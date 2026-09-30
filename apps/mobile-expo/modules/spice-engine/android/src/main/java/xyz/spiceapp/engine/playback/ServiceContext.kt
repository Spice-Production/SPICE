package xyz.spiceapp.engine.playback

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import xyz.spiceapp.engine.RepeatMode
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import xyz.spiceapp.engine.serviceQueueKey

internal const val MAX_MOBILE_SERVICE_QUEUE_SIZE = 2_000
internal const val MAX_MOBILE_SERVICE_HISTORY_SIZE = 512
private const val MOBILE_SERVICE_CONTEXT_PREFERENCES = "mobile_playback_service_context"
private const val MOBILE_SERVICE_CONTEXT_KEY = "context"

internal data class MobilePlaybackServiceContext(
    val queue: List<Track>,
    val queueIndex: Int,
    val quality: StreamQuality,
    val crossfadeDurationMs: Long,
    val repeatMode: RepeatMode,
    val shuffleEnabled: Boolean,
    val shuffleRoundTrackKeys: List<String> = emptyList(),
    val shuffleRoundPlayCount: Int = 0,
    val playbackHistory: List<String> = emptyList(),
    val playbackHistoryCursor: Int = -1,
)

internal data class MobileServiceQueuePlan(
    val queueIndex: Int,
    val startsNewShuffleRound: Boolean = false,
    val countsAsShuffleDraw: Boolean = true,
    val historyCursorTarget: Int? = null,
)

internal class MobilePlaybackServiceContextStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        MOBILE_SERVICE_CONTEXT_PREFERENCES,
        Context.MODE_PRIVATE,
    )

    fun save(context: MobilePlaybackServiceContext) {
        preferences.edit().putString(MOBILE_SERVICE_CONTEXT_KEY, encodeMobilePlaybackServiceContext(context)).apply()
    }

    fun load(): MobilePlaybackServiceContext? = decodeMobilePlaybackServiceContext(
        preferences.getString(MOBILE_SERVICE_CONTEXT_KEY, null).orEmpty(),
    )

    fun clear() {
        preferences.edit().remove(MOBILE_SERVICE_CONTEXT_KEY).apply()
    }
}

internal fun encodeMobilePlaybackServiceContext(context: MobilePlaybackServiceContext): String {
    val safeIndex = context.queueIndex.coerceIn(0, context.queue.lastIndex.coerceAtLeast(0))
    val queueStart = if (context.queue.size <= MAX_MOBILE_SERVICE_QUEUE_SIZE) {
        0
    } else {
        (safeIndex - MAX_MOBILE_SERVICE_QUEUE_SIZE / 2)
            .coerceIn(0, context.queue.size - MAX_MOBILE_SERVICE_QUEUE_SIZE)
    }
    val boundedQueue = context.queue.drop(queueStart).take(MAX_MOBILE_SERVICE_QUEUE_SIZE)
    val boundedQueueIndex = safeIndex - queueStart
    val boundedQueueKeys = boundedQueue.mapTo(hashSetOf()) { it.serviceQueueKey() }
    val (boundedHistory, boundedHistoryCursor) = normalizeMobilePlaybackHistoryForQueue(
        history = context.playbackHistory,
        cursor = context.playbackHistoryCursor,
        availableTrackKeys = boundedQueueKeys,
    )
    return JSONObject().apply {
    put("queueIndex", boundedQueueIndex)
    put("quality", context.quality.name)
    put("crossfadeDurationMs", context.crossfadeDurationMs)
    put("repeatMode", context.repeatMode.name)
    put("shuffleEnabled", context.shuffleEnabled)
    put("shuffleRoundPlayCount", context.shuffleRoundPlayCount)
    put(
        "shuffleRoundTrackKeys",
        JSONArray(context.shuffleRoundTrackKeys.filter { it in boundedQueueKeys }.takeLast(MAX_MOBILE_SERVICE_QUEUE_SIZE)),
    )
    put("playbackHistory", JSONArray(boundedHistory))
    put("playbackHistoryCursor", boundedHistoryCursor)
    put(
        "queue",
        JSONArray().apply {
            boundedQueue.forEach { track ->
                put(
                    JSONObject()
                        .put("id", track.id)
                        .put("title", track.title)
                        .put("artist", track.artist)
                        .put("album", track.album)
                        .put("durationMs", track.durationMs)
                        .put("artworkUrl", track.artworkUrl)
                        .put("sourceId", track.sourceId)
                        .put("localUri", track.localUri),
                )
            }
        },
    )
    }.toString()
}

internal fun decodeMobilePlaybackServiceContext(payload: String): MobilePlaybackServiceContext? {
    val root = runCatching { JSONObject(payload) }.getOrNull() ?: return null
    val tracks = buildList {
        val queue = root.optJSONArray("queue") ?: return@buildList
        for (index in 0 until minOf(queue.length(), MAX_MOBILE_SERVICE_QUEUE_SIZE)) {
            val item = queue.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            if (id.isBlank()) continue
            add(
                Track(
                    id = id,
                    title = item.optString("title"),
                    artist = item.optString("artist"),
                    album = item.optString("album"),
                    durationMs = item.optLong("durationMs").coerceAtLeast(0L),
                    artworkUrl = item.optString("artworkUrl"),
                    sourceId = item.optString("sourceId").ifBlank { "youtube_music" },
                    localUri = item.optString("localUri"),
                ),
            )
        }
    }
    val queueIndex = root.optInt("queueIndex", -1)
    if (tracks.isEmpty() || queueIndex !in tracks.indices) return null
    val quality = enumValueOrDefault(root.optString("quality"), StreamQuality.Standard)
    val repeatMode = enumValueOrDefault(root.optString("repeatMode"), RepeatMode.Off)
    val roundKeys = buildList {
        val keys = root.optJSONArray("shuffleRoundTrackKeys") ?: return@buildList
        for (index in 0 until minOf(keys.length(), MAX_MOBILE_SERVICE_QUEUE_SIZE)) {
            keys.optString(index).takeIf(String::isNotBlank)?.let(::add)
        }
    }
    val rawPlaybackHistory = buildList {
        val history = root.optJSONArray("playbackHistory") ?: return@buildList
        for (index in 0 until minOf(history.length(), MAX_MOBILE_SERVICE_HISTORY_SIZE)) {
            history.optString(index).takeIf(String::isNotBlank)?.let(::add)
        }
    }
    val (playbackHistory, playbackHistoryCursor) = normalizeMobilePlaybackHistoryForQueue(
        history = rawPlaybackHistory,
        cursor = root.optInt("playbackHistoryCursor", rawPlaybackHistory.lastIndex),
        availableTrackKeys = tracks.mapTo(hashSetOf()) { it.serviceQueueKey() },
    )
    return MobilePlaybackServiceContext(
        queue = tracks,
        queueIndex = queueIndex,
        quality = quality,
        crossfadeDurationMs = root.optLong("crossfadeDurationMs")
            .coerceIn(0L, 12_000L),
        repeatMode = repeatMode,
        shuffleEnabled = root.optBoolean("shuffleEnabled"),
        shuffleRoundTrackKeys = roundKeys.distinct(),
        shuffleRoundPlayCount = root.optInt("shuffleRoundPlayCount")
            .coerceIn(0, tracks.size),
        playbackHistory = playbackHistory,
        playbackHistoryCursor = playbackHistoryCursor,
    )
}

internal fun planMobileServiceNextTrack(
    context: MobilePlaybackServiceContext,
    priorityForTrackKey: (String) -> Int,
    randomUnit: Double,
    manualNavigation: Boolean = false,
): MobileServiceQueuePlan? {
    if (context.queue.isEmpty() || (context.repeatMode == RepeatMode.One && !manualNavigation)) return null
    if (context.shuffleEnabled && context.queue.size > 1) {
        val queueKeys = context.queue.mapTo(hashSetOf()) { it.serviceQueueKey() }
        mobilePlaybackHistoryTarget(
            history = context.playbackHistory,
            cursor = context.playbackHistoryCursor,
            step = 1,
            availableTrackKeys = queueKeys,
        )?.let { (cursor, trackKey) ->
            val queueIndex = context.queue.indexOfFirst { it.serviceQueueKey() == trackKey }
            if (queueIndex >= 0) {
                return MobileServiceQueuePlan(
                    queueIndex = queueIndex,
                    countsAsShuffleDraw = false,
                    historyCursorTarget = cursor,
                )
            }
        }
        return planMobileShuffleQueueIndex(
            queueIndices = context.queue.indices.toList(),
            currentIndex = context.queueIndex,
            playedTrackKeys = context.shuffleRoundTrackKeys.toSet(),
            roundPlayCount = context.shuffleRoundPlayCount,
            allowWrap = manualNavigation || context.repeatMode == RepeatMode.All,
            trackKeyForIndex = { index -> context.queue[index].serviceQueueKey() },
            priorityForIndex = { index -> priorityForTrackKey(context.queue[index].serviceQueueKey()) },
            randomUnit = randomUnit,
        )?.let { plan ->
            MobileServiceQueuePlan(
                queueIndex = plan.queueIndex,
                startsNewShuffleRound = plan.startsNewRound,
            )
        }
    }
    val nextIndex = context.queueIndex + 1
    return when {
        nextIndex in context.queue.indices -> MobileServiceQueuePlan(nextIndex)
        manualNavigation || context.repeatMode == RepeatMode.All -> {
            MobileServiceQueuePlan(0, startsNewShuffleRound = true)
        }
        else -> null
    }
}

internal fun planMobileServicePreviousTrack(
    context: MobilePlaybackServiceContext,
): MobileServiceQueuePlan? {
    if (context.queue.isEmpty()) return null
    if (context.shuffleEnabled) {
        val queueKeys = context.queue.mapTo(hashSetOf()) { it.serviceQueueKey() }
        val target = mobilePlaybackHistoryTarget(
            history = context.playbackHistory,
            cursor = context.playbackHistoryCursor,
            step = -1,
            availableTrackKeys = queueKeys,
        ) ?: return null
        val queueIndex = context.queue.indexOfFirst { it.serviceQueueKey() == target.second }
        return queueIndex.takeIf { it >= 0 }?.let {
            MobileServiceQueuePlan(
                queueIndex = it,
                countsAsShuffleDraw = false,
                historyCursorTarget = target.first,
            )
        }
    }
    val previousIndex = if (context.queueIndex > 0) context.queueIndex - 1 else context.queue.lastIndex
    return MobileServiceQueuePlan(previousIndex, countsAsShuffleDraw = false)
}

internal fun advanceMobilePlaybackServiceContext(
    context: MobilePlaybackServiceContext,
    queueIndex: Int,
    resolvedTrack: Track,
    startsNewShuffleRound: Boolean,
    countsAsShuffleDraw: Boolean = true,
    historyCursorTarget: Int? = null,
): MobilePlaybackServiceContext {
    if (queueIndex !in context.queue.indices) return context
    val updatedQueue = context.queue.mapIndexed { index, track ->
        if (index == queueIndex) resolvedTrack else track
    }
    val updatedHistory = context.playbackHistory.toMutableList()
    var updatedHistoryCursor = context.playbackHistoryCursor.coerceIn(-1, updatedHistory.lastIndex)
    if (historyCursorTarget != null && historyCursorTarget in updatedHistory.indices) {
        updatedHistoryCursor = historyCursorTarget
        updatedHistory[updatedHistoryCursor] = resolvedTrack.serviceQueueKey()
    } else {
        while (updatedHistory.lastIndex > updatedHistoryCursor) updatedHistory.removeAt(updatedHistory.lastIndex)
        if (updatedHistory.lastOrNull() != resolvedTrack.serviceQueueKey()) {
            updatedHistory += resolvedTrack.serviceQueueKey()
        }
        updatedHistoryCursor = updatedHistory.lastIndex
    }
    if (updatedHistory.size > MAX_MOBILE_SERVICE_HISTORY_SIZE) {
        val removeCount = updatedHistory.size - MAX_MOBILE_SERVICE_HISTORY_SIZE
        repeat(removeCount) { updatedHistory.removeAt(0) }
        updatedHistoryCursor = (updatedHistoryCursor - removeCount).coerceAtLeast(0)
    }
    val base = context.copy(
        queue = updatedQueue,
        queueIndex = queueIndex,
        playbackHistory = updatedHistory,
        playbackHistoryCursor = updatedHistoryCursor,
    )
    if (!context.shuffleEnabled || !countsAsShuffleDraw) return base
    val keys = if (startsNewShuffleRound) linkedSetOf() else context.shuffleRoundTrackKeys.toCollection(linkedSetOf())
    keys += resolvedTrack.serviceQueueKey()
    val priorCount = if (startsNewShuffleRound) 0 else context.shuffleRoundPlayCount
    return base.copy(
        shuffleRoundTrackKeys = keys.toList().takeLast(updatedQueue.size),
        shuffleRoundPlayCount = (priorCount + 1).coerceAtMost(updatedQueue.size),
    )
}

internal fun restorableMobilePlaybackServiceContext(
    context: MobilePlaybackServiceContext?,
    activeMediaId: String,
): MobilePlaybackServiceContext? = context?.takeIf {
    activeMediaId.isNotBlank() && it.queue.getOrNull(it.queueIndex)?.id == activeMediaId
}

internal fun normalizeMobilePlaybackHistoryForQueue(
    history: List<String>,
    cursor: Int,
    availableTrackKeys: Set<String>,
): Pair<List<String>, Int> {
    val filtered = mutableListOf<String>()
    var filteredCursor = -1
    history.forEachIndexed { index, trackKey ->
        if (trackKey !in availableTrackKeys) return@forEachIndexed
        filtered += trackKey
        if (index <= cursor) filteredCursor = filtered.lastIndex
    }
    if (filtered.isEmpty()) return emptyList<String>() to -1
    val anchor = filteredCursor.takeIf { it >= 0 } ?: filtered.lastIndex
    val start = if (filtered.size <= MAX_MOBILE_SERVICE_HISTORY_SIZE) {
        0
    } else {
        (anchor - MAX_MOBILE_SERVICE_HISTORY_SIZE / 2)
            .coerceIn(0, filtered.size - MAX_MOBILE_SERVICE_HISTORY_SIZE)
    }
    val bounded = filtered.drop(start).take(MAX_MOBILE_SERVICE_HISTORY_SIZE)
    val boundedCursor = if (filteredCursor >= start) {
        (filteredCursor - start).coerceAtMost(bounded.lastIndex)
    } else {
        -1
    }
    return bounded to boundedCursor
}

private inline fun <reified T : Enum<T>> enumValueOrDefault(value: String, fallback: T): T =
    enumValues<T>().firstOrNull { it.name == value } ?: fallback

