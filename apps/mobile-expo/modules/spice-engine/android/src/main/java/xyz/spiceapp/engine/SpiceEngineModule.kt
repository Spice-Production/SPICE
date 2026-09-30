package xyz.spiceapp.engine

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import xyz.spiceapp.engine.playback.BackgroundHistoryStore
import xyz.spiceapp.engine.playback.MobilePlaybackServiceContext
import xyz.spiceapp.engine.playback.MobileTrackFeedback
import xyz.spiceapp.engine.playback.PlayerConnection
import xyz.spiceapp.engine.playback.PlayerUiState
import xyz.spiceapp.engine.playback.TrackPriorityStore
import xyz.spiceapp.engine.resolve.StreamResolver

/**
 * JS bridge for SPICE's native audio engine: Media3 playback with a media
 * session, two-player crossfade, background queue continuation, and
 * phone-side SoundCloud/NewPipe resolution.
 */
class SpiceEngineModule : Module() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var connection: PlayerConnection? = null
    private var stateJob: Job? = null

    private val context: Context
        get() = requireNotNull(appContext.reactContext?.applicationContext) { "React context is unavailable." }

    private val priorities by lazy { TrackPriorityStore(context) }
    private val backgroundHistory by lazy { BackgroundHistoryStore(context) }

    override fun definition() = ModuleDefinition {
        Name("SpiceEngine")

        Events(
            "onPlayerState",
            "onPlaybackEnded",
            "onTrackRepeated",
            "onCrossfadeCompleted",
            "onCrossfadeFailed",
        )

        OnDestroy {
            stateJob?.cancel()
            connection?.release()
            connection = null
            scope.cancel()
        }

        // --- Resolution ----------------------------------------------------

        AsyncFunction("search") Coroutine { query: String, limit: Int, provider: String ->
            StreamResolver.shared
                .search(query, limit, enumOrDefault(provider, SearchProvider.All))
                .map { it.toMap() }
        }

        AsyncFunction("resolvePlayable") Coroutine { track: Map<String, Any?>, quality: String ->
            val playback = StreamResolver.shared.resolvePlayable(
                trackFromMap(track),
                enumOrDefault(quality, StreamQuality.Standard),
            )
            mapOf(
                "track" to playback.track.toMap(),
                "stream" to playback.stream.toMap(),
                "usedFallback" to playback.usedFallback,
            )
        }

        // --- Playback (MediaController calls must stay on the main thread) ----

        AsyncFunction("connect") {
            ensureConnection()
            ensureConnection().state.value.toMap()
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("play") { track: Map<String, Any?>, streamUrl: String, playbackContext: Map<String, Any?>? ->
            ensureConnection().play(trackFromMap(track), streamUrl, playbackContext?.let(::playbackContextFromMap))
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("toggle") { ensureConnection().toggle() }.runOnQueue(Queues.MAIN)
        AsyncFunction("pause") { ensureConnection().pause() }.runOnQueue(Queues.MAIN)
        AsyncFunction("seekTo") { positionMs: Double -> ensureConnection().seekTo(positionMs.toLong()) }.runOnQueue(Queues.MAIN)
        AsyncFunction("seekBy") { deltaMs: Double -> ensureConnection().seekBy(deltaMs.toLong()) }.runOnQueue(Queues.MAIN)
        AsyncFunction("setVolume") { volume: Int -> ensureConnection().setVolume(volume) }.runOnQueue(Queues.MAIN)
        AsyncFunction("setShuffle") { enabled: Boolean -> ensureConnection().setShuffle(enabled) }.runOnQueue(Queues.MAIN)
        AsyncFunction("setRepeatMode") { mode: String ->
            ensureConnection().setRepeatMode(enumOrDefault(mode, RepeatMode.Off))
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stop") { ensureConnection().stop() }.runOnQueue(Queues.MAIN)
        AsyncFunction("clearError") { ensureConnection().clearError() }.runOnQueue(Queues.MAIN)

        AsyncFunction("updatePlaybackContextSettings") { quality: String, crossfadeDurationMs: Double ->
            ensureConnection().updatePlaybackContextSettings(
                enumOrDefault(quality, StreamQuality.Standard),
                crossfadeDurationMs.toLong(),
            )
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("prepareCrossfade") { args: Map<String, Any?>, promise: Promise ->
            val track = trackFromMap(args["track"] as? Map<String, Any?> ?: emptyMap())
            ensureConnection().prepareCrossfade(
                trackKey = args["trackKey"] as? String ?: track.serviceQueueKey(),
                track = track,
                streamUrl = args["streamUrl"] as? String ?: "",
                queueIndex = (args["queueIndex"] as? Number)?.toInt() ?: -1,
                crossfadeDurationMs = (args["crossfadeDurationMs"] as? Number)?.toLong() ?: 0L,
                startsNewShuffleRound = args["startsNewShuffleRound"] as? Boolean ?: false,
                countsAsShuffleDraw = args["countsAsShuffleDraw"] as? Boolean ?: true,
                historyCursorTarget = (args["historyCursorTarget"] as? Number)?.toInt()?.takeIf { it >= 0 },
            ) { ready -> promise.resolve(ready) }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("startPreparedCrossfade") { durationMs: Double, promise: Promise ->
            ensureConnection().startPreparedCrossfade(durationMs.toLong()) { started -> promise.resolve(started) }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("cancelPreparedCrossfade") { ensureConnection().cancelPreparedCrossfade() }.runOnQueue(Queues.MAIN)

        AsyncFunction("restoredPlaybackContext") { mediaId: String ->
            ensureConnection().restoredPlaybackContext(mediaId)?.toMap()
        }.runOnQueue(Queues.MAIN)

        // --- Adaptive taste --------------------------------------------------

        Function("trackPriority") { trackKey: String -> priorities.trackPriority(trackKey) }

        Function("trackPriorities") { trackKeys: List<String> ->
            trackKeys.associateWith { priorities.trackPriority(it) }
        }

        Function("recordTrackFeedback") { trackKey: String, feedback: String ->
            val parsed = MobileTrackFeedback.entries.firstOrNull { it.name == feedback } ?: return@Function 0
            priorities.recordTrackFeedback(trackKey, parsed)
        }

        Function("trackPriorityPayload") { priorities.payload() }

        Function("replaceTrackPriorities") { payload: String -> priorities.replace(payload) }

        Function("drainBackgroundHistory") { backgroundHistory.drain() }
    }

    private fun ensureConnection(): PlayerConnection {
        connection?.let { return it }
        val created = PlayerConnection(
            context = context,
            onPlaybackEnded = { mediaId -> sendEvent("onPlaybackEnded", mapOf("mediaId" to mediaId)) },
            onTrackRepeated = { sendEvent("onTrackRepeated", emptyMap<String, Any?>()) },
            onCrossfadeCompleted = { trackKey -> sendEvent("onCrossfadeCompleted", mapOf("trackKey" to trackKey)) },
            onCrossfadeFailed = { trackKey -> sendEvent("onCrossfadeFailed", mapOf("trackKey" to trackKey)) },
        )
        connection = created
        stateJob = scope.launch {
            created.state.collect { state -> sendEvent("onPlayerState", state.toMap()) }
        }
        return created
    }
}

private fun PlayerUiState.toMap(): Map<String, Any?> = mapOf(
    "connected" to connected,
    "mediaId" to mediaId,
    "title" to title,
    "artist" to artist,
    "artworkUrl" to artworkUrl,
    "isPlaying" to isPlaying,
    "isBuffering" to isBuffering,
    "positionMs" to positionMs.toDouble(),
    "durationMs" to durationMs.toDouble(),
    "volume" to volume,
    "shuffleEnabled" to shuffleEnabled,
    "repeatMode" to repeatMode.name,
    "localCrossfadeSupported" to localCrossfadeSupported,
    "error" to error,
)

private fun MobilePlaybackServiceContext.toMap(): Map<String, Any?> = mapOf(
    "queue" to queue.map { it.toMap() },
    "queueIndex" to queueIndex,
    "quality" to quality.name,
    "crossfadeDurationMs" to crossfadeDurationMs.toDouble(),
    "repeatMode" to repeatMode.name,
    "shuffleEnabled" to shuffleEnabled,
    "shuffleRoundTrackKeys" to shuffleRoundTrackKeys,
    "shuffleRoundPlayCount" to shuffleRoundPlayCount,
    "playbackHistory" to playbackHistory,
    "playbackHistoryCursor" to playbackHistoryCursor,
)

@Suppress("UNCHECKED_CAST")
private fun playbackContextFromMap(map: Map<String, Any?>): MobilePlaybackServiceContext {
    val queue = (map["queue"] as? List<*>).orEmpty()
        .mapNotNull { (it as? Map<String, Any?>)?.let(::trackFromMap) }
        .filter { it.id.isNotBlank() }
    fun strings(key: String): List<String> = (map[key] as? List<*>).orEmpty().mapNotNull { it as? String }
    return MobilePlaybackServiceContext(
        queue = queue,
        queueIndex = (map["queueIndex"] as? Number)?.toInt() ?: 0,
        quality = enumOrDefault(map["quality"] as? String, StreamQuality.Standard),
        crossfadeDurationMs = ((map["crossfadeDurationMs"] as? Number)?.toLong() ?: 0L).coerceIn(0L, 12_000L),
        repeatMode = enumOrDefault(map["repeatMode"] as? String, RepeatMode.Off),
        shuffleEnabled = map["shuffleEnabled"] as? Boolean ?: false,
        shuffleRoundTrackKeys = strings("shuffleRoundTrackKeys"),
        shuffleRoundPlayCount = (map["shuffleRoundPlayCount"] as? Number)?.toInt() ?: 0,
        playbackHistory = strings("playbackHistory"),
        playbackHistoryCursor = (map["playbackHistoryCursor"] as? Number)?.toInt() ?: -1,
    )
}
