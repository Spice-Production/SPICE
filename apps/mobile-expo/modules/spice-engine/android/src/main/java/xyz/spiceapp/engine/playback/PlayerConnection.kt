package xyz.spiceapp.engine.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import xyz.spiceapp.engine.RepeatMode
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import xyz.spiceapp.engine.serviceQueueKey
import kotlin.math.roundToInt

data class PlayerUiState(
    val connected: Boolean = false,
    val mediaId: String = "",
    val title: String = "",
    val artist: String = "",
    val artworkUrl: String = "",
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val volume: Int = 100,
    val shuffleEnabled: Boolean = false,
    val repeatMode: RepeatMode = RepeatMode.Off,
    val localCrossfadeSupported: Boolean = false,
    val error: String? = null,
)

class PlayerConnection(
    context: Context,
    private val onPlaybackEnded: (String) -> Unit = {},
    private val onTrackRepeated: () -> Unit = {},
    private val onCrossfadeCompleted: (String) -> Unit = {},
    private val onCrossfadeFailed: (String) -> Unit = {},
    private val onRemoteCommand: (String) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val playbackContextStore = MobilePlaybackServiceContextStore(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    private val sessionToken = SessionToken(
        appContext,
        ComponentName(appContext, SpicePlaybackService::class.java),
    )
    private val controllerListener = object : MediaController.Listener {
        override fun onCustomCommand(
            controller: MediaController,
            command: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            val trackKey = args.getString(ARG_TRACK_KEY).orEmpty()
            when (command.customAction) {
                ACTION_NOTIFICATION_BUTTON -> when (args.getString(ARG_BUTTON)) {
                    BUTTON_SHUFFLE -> toggleShuffle()
                    BUTTON_REPEAT -> cycleRepeat()
                    BUTTON_LIKE -> onRemoteCommand("toggleLike")
                }
                ACTION_CROSSFADE_COMPLETED -> {
                    handledEndedForItem = false
                    sourceRetryCount = 0
                    lastMediaItem = controller.currentMediaItem
                    playbackGeneration += 1L
                    publishState(controller)
                    onCrossfadeCompleted(trackKey)
                }
                ACTION_CROSSFADE_FAILED -> {
                    onCrossfadeFailed(trackKey)
                    if (
                        shouldDispatchMobilePlaybackEnded(
                            callbackReportsEnded = controller.playbackState == Player.STATE_ENDED,
                            controllerStillReportsEnded = controller.playbackState == Player.STATE_ENDED,
                            alreadyHandledForCurrentItem = handledEndedForItem,
                        )
                    ) {
                        handledEndedForItem = true
                        onPlaybackEnded(controller.currentMediaItem?.mediaId.orEmpty())
                    }
                }
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }
    private val controllerFuture = MediaController.Builder(appContext, sessionToken)
        .setListener(controllerListener)
        .buildAsync()
    private var controller: MediaController? = null
    private var pendingAction: ((MediaController) -> Unit)? = null
    private var progressJob: Job? = null
    private var lastMediaItem: MediaItem? = null
    private var handledEndedForItem = false
    private var repeatMode = RepeatMode.Off
    private var sourceRetryCount = 0
    private var userVolume = 1f
    private var playbackGeneration = 0L

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            publishState(player)
            updateProgressLoop(player.isPlaying)
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            val activeController = controller
            if (shouldDispatchMobilePlaybackEnded(
                    callbackReportsEnded = playbackState == Player.STATE_ENDED,
                    controllerStillReportsEnded = activeController?.playbackState == Player.STATE_ENDED,
                    alreadyHandledForCurrentItem = handledEndedForItem,
                )
            ) {
                handledEndedForItem = true
                onPlaybackEnded(activeController?.currentMediaItem?.mediaId.orEmpty())
            }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (isAutomaticMobileRepeatTransition(reason)) {
                handledEndedForItem = false
                onTrackRepeated()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            cancelPreparedCrossfade()
            if (shouldRetrySource(error)) {
                retryCurrentSource()
                return
            }

            _state.value = _state.value.copy(
                isPlaying = false,
                isBuffering = false,
                error = playbackErrorMessage(error),
            )
        }
    }

    init {
        controllerFuture.addListener(
            {
                runCatching { controllerFuture.get() }
                    .onSuccess { connectedController ->
                        controller = connectedController
                        userVolume = connectedController.volume.coerceIn(0f, 1f)
                        restorableMobilePlaybackServiceContext(
                            playbackContextStore.load(),
                            connectedController.currentMediaItem?.mediaId.orEmpty(),
                        )?.let { context ->
                            repeatMode = context.repeatMode
                            connectedController.shuffleModeEnabled = context.shuffleEnabled
                            connectedController.repeatMode = if (context.repeatMode == RepeatMode.One) {
                                Player.REPEAT_MODE_ONE
                            } else {
                                Player.REPEAT_MODE_OFF
                            }
                        }
                        connectedController.addListener(listener)
                        publishState(connectedController)
                        pendingAction?.invoke(connectedController)
                        pendingAction = null
                    }
                    .onFailure { error ->
                        _state.value = _state.value.copy(
                            error = error.message ?: "Could not connect to the playback service.",
                        )
                    }
            },
            ContextCompat.getMainExecutor(appContext),
        )
    }

    internal fun play(
        track: Track,
        streamUrl: String,
        playbackContext: MobilePlaybackServiceContext? = null,
    ) {
        if (playbackContext == null) {
            playbackContextStore.clear()
        } else {
            playbackContextStore.save(playbackContext)
        }
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            syncPlaybackContext(activeController)
            val metadata = MediaMetadata.Builder()
                .setTitle(track.title)
                .setArtist(track.artist)
                .setAlbumTitle(track.album)
                .apply {
                    if (track.artworkUrl.isNotBlank()) setArtworkUri(Uri.parse(track.artworkUrl))
                }
                .build()
            val mediaItem = MediaItem.Builder()
                .setMediaId(track.id)
                .setUri(streamUrl)
                .setMediaMetadata(metadata)
                .build()
            lastMediaItem = mediaItem
            playbackGeneration += 1L
            handledEndedForItem = false
            sourceRetryCount = 0
            activeController.setMediaItem(mediaItem)
            activeController.volume = userVolume
            activeController.prepare()
            activeController.play()
            publishState(activeController)
        }
    }

    fun toggle() {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            if (activeController.isPlaying) {
                activeController.pause()
            } else {
                if (activeController.playbackState == Player.STATE_IDLE) activeController.prepare()
                activeController.play()
            }
        }
    }

    fun pause() {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            activeController.pause()
            publishState(activeController)
        }
    }

    fun seekTo(positionMs: Long) {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            activeController.seekTo(positionMs.coerceAtLeast(0))
        }
    }

    fun seekBy(deltaMs: Long) {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            val duration = activeController.duration.takeUnless { it == C.TIME_UNSET } ?: Long.MAX_VALUE
            activeController.seekTo((activeController.currentPosition + deltaMs).coerceIn(0, duration))
        }
    }

    fun setVolume(volume: Int) {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            userVolume = volume.coerceIn(0, 100) / 100f
            activeController.volume = userVolume
            publishState(activeController)
        }
    }

    fun updatePlaybackContextSettings(quality: StreamQuality, crossfadeDurationMs: Long) {
        val context = playbackContextStore.load() ?: return
        playbackContextStore.save(
            context.copy(
                quality = quality,
                crossfadeDurationMs = crossfadeDurationMs.coerceIn(0L, 12_000L),
            ),
        )
        runWithController(::syncPlaybackContext)
    }

    fun prepareCrossfade(
        trackKey: String,
        track: Track,
        streamUrl: String,
        queueIndex: Int,
        crossfadeDurationMs: Long,
        startsNewShuffleRound: Boolean,
        countsAsShuffleDraw: Boolean,
        historyCursorTarget: Int?,
        onResult: (Boolean) -> Unit,
    ) {
        val args = Bundle().apply {
            putString(ARG_TRACK_KEY, trackKey)
            putString(ARG_MEDIA_ID, track.id)
            putString(ARG_STREAM_URL, streamUrl)
            putString(ARG_TITLE, track.title)
            putString(ARG_ARTIST, track.artist)
            putString(ARG_ALBUM, track.album)
            putString(ARG_ARTWORK_URL, track.artworkUrl)
            putLong(ARG_TRACK_DURATION_MS, track.durationMs)
            putInt(ARG_QUEUE_INDEX, queueIndex)
            putLong(ARG_DURATION_MS, crossfadeDurationMs)
            putBoolean(ARG_STARTS_NEW_SHUFFLE_ROUND, startsNewShuffleRound)
            putBoolean(ARG_COUNTS_AS_SHUFFLE_DRAW, countsAsShuffleDraw)
            putInt(ARG_HISTORY_CURSOR_TARGET, historyCursorTarget ?: -1)
        }
        sendCrossfadeCommand(PREPARE_CROSSFADE_COMMAND, args, onResult)
    }

    fun startPreparedCrossfade(durationMs: Long, onResult: (Boolean) -> Unit) {
        val args = Bundle().apply { putLong(ARG_DURATION_MS, durationMs) }
        sendCrossfadeCommand(START_CROSSFADE_COMMAND, args, onResult)
    }

    fun cancelPreparedCrossfade() {
        runWithController(::cancelPreparedCrossfade)
    }

    /** Mirrors the current track's Like into the notification's heart button. */
    fun setLiked(liked: Boolean) {
        runWithController { activeController ->
            if (activeController.isSessionCommandAvailable(SET_LIKED_COMMAND)) {
                activeController.sendCustomCommand(SET_LIKED_COMMAND, Bundle().apply { putBoolean(ARG_LIKED, liked) })
            }
        }
    }

    fun toggleShuffle() {
        setShuffle(!_state.value.shuffleEnabled)
    }

    fun setShuffle(enabled: Boolean) {
        runWithController { activeController ->
            activeController.shuffleModeEnabled = enabled
            playbackContextStore.load()?.let { context ->
                val currentKey = context.queue.getOrNull(context.queueIndex)?.serviceQueueKey()
                playbackContextStore.save(
                    context.copy(
                        shuffleEnabled = enabled,
                        shuffleRoundTrackKeys = if (enabled && currentKey != null) listOf(currentKey) else emptyList(),
                        shuffleRoundPlayCount = if (enabled && currentKey != null) 1 else 0,
                    ),
                )
                syncPlaybackContext(activeController)
            }
            publishState(activeController)
        }
    }

    fun cycleRepeat() {
        setRepeatMode(
            when (repeatMode) {
                RepeatMode.Off -> RepeatMode.All
                RepeatMode.All -> RepeatMode.One
                RepeatMode.One -> RepeatMode.Off
            },
        )
    }

    fun setRepeatMode(mode: RepeatMode) {
        repeatMode = mode
        runWithController { activeController ->
            activeController.repeatMode = if (repeatMode == RepeatMode.One) {
                Player.REPEAT_MODE_ONE
            } else {
                Player.REPEAT_MODE_OFF
            }
            playbackContextStore.load()?.let { context ->
                playbackContextStore.save(context.copy(repeatMode = mode))
                syncPlaybackContext(activeController)
            }
            publishState(activeController)
        }
    }

    fun stop() {
        runWithController { activeController ->
            cancelPreparedCrossfade(activeController)
            activeController.stop()
            activeController.clearMediaItems()
            playbackContextStore.clear()
            syncPlaybackContext(activeController)
            publishState(activeController)
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    fun release() {
        progressJob?.cancel()
        controller?.removeListener(listener)
        MediaController.releaseFuture(controllerFuture)
        controller = null
        scope.cancel()
    }

    private fun runWithController(action: (MediaController) -> Unit) {
        controller?.let(action) ?: run { pendingAction = action }
    }

    private fun publishState(player: Player) {
        val metadata = player.mediaMetadata
        _state.value = PlayerUiState(
            connected = true,
            mediaId = player.currentMediaItem?.mediaId.orEmpty(),
            title = metadata.title?.toString().orEmpty(),
            artist = metadata.artist?.toString().orEmpty(),
            artworkUrl = metadata.artworkUri?.toString().orEmpty(),
            isPlaying = player.isPlaying,
            isBuffering = player.playbackState == Player.STATE_BUFFERING,
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = player.duration.takeUnless { it == C.TIME_UNSET }?.coerceAtLeast(0) ?: 0,
            volume = (userVolume * 100).roundToInt().coerceIn(0, 100),
            shuffleEnabled = player.shuffleModeEnabled,
            repeatMode = repeatMode,
            localCrossfadeSupported = player is MediaController &&
                player.isSessionCommandAvailable(PREPARE_CROSSFADE_COMMAND),
            error = _state.value.error,
        )
    }

    private fun updateProgressLoop(playing: Boolean) {
        if (!playing) {
            progressJob?.cancel()
            progressJob = null
            return
        }
        if (progressJob?.isActive == true) return
        progressJob = scope.launch {
            while (isActive) {
                controller?.let(::publishState)
                delay(500)
            }
        }
    }

    private fun shouldRetrySource(error: PlaybackException): Boolean =
        sourceRetryCount < 1 && error.errorCode in setOf(
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
            PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
        )

    private fun retryCurrentSource() {
        val mediaItem = lastMediaItem ?: return
        val generation = playbackGeneration
        sourceRetryCount += 1
        _state.value = _state.value.copy(
            isPlaying = false,
            isBuffering = true,
            error = null,
        )
        scope.launch {
            delay(650)
            runWithController { activeController ->
                if (!shouldRetryMobilePlaybackSource(
                        capturedGeneration = generation,
                        currentGeneration = playbackGeneration,
                        capturedMediaId = mediaItem.mediaId,
                        currentMediaId = activeController.currentMediaItem?.mediaId.orEmpty(),
                    )
                ) return@runWithController
                activeController.setMediaItem(mediaItem)
                handledEndedForItem = false
                activeController.prepare()
                activeController.play()
                publishState(activeController)
            }
        }
    }

    private fun playbackErrorMessage(error: PlaybackException): String {
        val detail = error.message?.takeIf { it.isNotBlank() } ?: error.errorCodeName
        return "Android could not play this stream: $detail"
    }

    internal fun restoredPlaybackContext(activeMediaId: String): MobilePlaybackServiceContext? =
        restorableMobilePlaybackServiceContext(playbackContextStore.load(), activeMediaId)

    private fun sendCrossfadeCommand(
        command: SessionCommand,
        args: Bundle,
        onResult: (Boolean) -> Unit,
    ) {
        runWithController { activeController ->
            if (!activeController.isSessionCommandAvailable(command)) {
                onResult(false)
                return@runWithController
            }
            val result = activeController.sendCustomCommand(command, args)
            result.addListener(
                {
                    onResult(
                        runCatching { result.get().resultCode == SessionResult.RESULT_SUCCESS }
                            .getOrDefault(false),
                    )
                },
                ContextCompat.getMainExecutor(appContext),
            )
        }
    }

    private fun cancelPreparedCrossfade(activeController: MediaController) {
        if (activeController.isSessionCommandAvailable(CANCEL_CROSSFADE_COMMAND)) {
            activeController.sendCustomCommand(CANCEL_CROSSFADE_COMMAND, Bundle.EMPTY)
        }
    }

    private fun syncPlaybackContext(activeController: MediaController) {
        if (activeController.isSessionCommandAvailable(SYNC_PLAYBACK_CONTEXT_COMMAND)) {
            activeController.sendCustomCommand(SYNC_PLAYBACK_CONTEXT_COMMAND, Bundle.EMPTY)
        }
    }
}
