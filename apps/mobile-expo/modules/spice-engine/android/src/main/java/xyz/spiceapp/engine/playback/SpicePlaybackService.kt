package xyz.spiceapp.engine.playback

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import xyz.spiceapp.engine.resolve.StreamResolver
import xyz.spiceapp.engine.Track
import xyz.spiceapp.engine.serviceQueueKey
import kotlin.random.Random

class SpicePlaybackService : MediaSessionService() {
    private val handler = Handler(Looper.getMainLooper())
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var audioAttributes: AudioAttributes
    private lateinit var playbackContextStore: MobilePlaybackServiceContextStore
    private lateinit var priorityStore: TrackPriorityStore
    private lateinit var backgroundHistoryStore: BackgroundHistoryStore
    private val api get() = StreamResolver.shared
    private var mediaSession: MediaSession? = null
    private var activePlayer: ExoPlayer? = null
    private var preparedPlayer: ExoPlayer? = null
    private var preparedTrackKey: String = ""
    private var preparedTrack: Track? = null
    private var preparedQueueIndex = -1
    private var preparedStartsNewShuffleRound = false
    private var preparedCountsAsShuffleDraw = true
    private var preparedHistoryCursorTarget: Int? = null
    private var preparedPromoteImmediately = false
    private var preparedManualDeparture: PendingBackgroundDeparture? = null
    private var preparedServiceOwnedNavigation = false
    private var preparedPlayWhenReady = true
    private var preparedCrossfadeDurationMs = 0L
    private var preparedRequiresExactCut = false
    private var fadeRunnable: Runnable? = null
    private var transitionMonitorRunnable: Runnable? = null
    private var fadeTargetVolume = 1f
    private var crossfadeRunning = false
    private var backgroundOwnership = false
    private var backgroundResolveJob: Job? = null
    private var backgroundResolveGeneration = 0L
    private var nextBackgroundResolveAtMs = 0L
    private var backgroundResolveFailureCount = 0
    private var backgroundFeedbackRecordedForTrackKey = ""
    private var serviceQueueNavigationInProgress = false

    private val sessionCallback = object : MediaSession.Callback {
        @androidx.annotation.OptIn(markerClass = [UnstableApi::class])
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            if (controller.packageName == packageName) {
                backgroundOwnership = false
                backgroundResolveGeneration += 1L
                backgroundResolveJob?.cancel()
                backgroundResolveJob = null
                cancelCrossfade()
            }
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                .buildUpon()
                .add(PREPARE_CROSSFADE_COMMAND)
                .add(START_CROSSFADE_COMMAND)
                .add(CANCEL_CROSSFADE_COMMAND)
                .add(SYNC_PLAYBACK_CONTEXT_COMMAND)
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands)
                .setAvailablePlayerCommands(
                    MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS
                        .buildUpon()
                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .build(),
                )
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            val result = when (customCommand.customAction) {
                ACTION_PREPARE_CROSSFADE -> prepareCrossfade(args)
                ACTION_START_CROSSFADE -> startCrossfade(args.getLong(ARG_DURATION_MS))
                ACTION_CANCEL_CROSSFADE -> {
                    cancelPendingQueueResolution()
                    cancelCrossfade(notifyController = true)
                    SessionResult.RESULT_SUCCESS
                }
                ACTION_SYNC_PLAYBACK_CONTEXT -> {
                    playbackContextStore.load()
                    SessionResult.RESULT_SUCCESS
                }
                else -> SessionResult.RESULT_ERROR_NOT_SUPPORTED
            }
            return Futures.immediateFuture(SessionResult(result))
        }

        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int,
        ): Int {
            mobileQueueNavigationStepForPlayerCommand(playerCommand)?.let { step ->
                requestServiceQueueStep(step)
                return SessionResult.RESULT_SUCCESS
            }
            val cancelledPendingResolution = cancelPendingQueueResolution()
            val cancelledPreparedPlayback = crossfadeRunning || preparedPlayer != null
            if (cancelledPreparedPlayback) cancelCrossfade(notifyController = true)
            val pausingOrStopping = playerCommand == Player.COMMAND_STOP ||
                (playerCommand == Player.COMMAND_PLAY_PAUSE && activePlayer?.playWhenReady == true)
            if (
                backgroundOwnership &&
                !pausingOrStopping &&
                (cancelledPreparedPlayback || cancelledPendingResolution)
            ) {
                scheduleBackgroundContinuation(500L)
            }
            return SessionResult.RESULT_SUCCESS
        }
    }

    override fun onCreate() {
        super.onCreate()
        playbackContextStore = MobilePlaybackServiceContextStore(this)
        priorityStore = TrackPriorityStore(this)
        backgroundHistoryStore = BackgroundHistoryStore(this)
        audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        val player = createPlayer(handleAudioFocus = true)
        activePlayer = player
        mediaSession = MediaSession.Builder(this, player)
            .setCallback(sessionCallback)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = activePlayer
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
            return
        }
        backgroundOwnership = true
        scheduleBackgroundContinuation()
    }

    override fun onDestroy() {
        backgroundResolveGeneration += 1L
        backgroundResolveJob?.cancel()
        serviceScope.cancel()
        cancelCrossfade()
        mediaSession?.release()
        mediaSession = null
        activePlayer?.release()
        activePlayer = null
        super.onDestroy()
    }

    private fun createPlayer(handleAudioFocus: Boolean): ExoPlayer = ExoPlayer.Builder(this)
        .setAudioAttributes(audioAttributes, handleAudioFocus)
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_LOCAL)
        .build()
        .also { player ->
            player.addListener(object : Player.Listener {
                override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                    if (player === activePlayer && !playWhenReady) cancelPendingQueueResolution()
                    if (
                        player === activePlayer &&
                        shouldCancelMobileCrossfadeForPlaybackInterruption(
                            crossfadeRunning = crossfadeRunning,
                            playWhenReady = playWhenReady,
                            outgoingEndedNaturally = player.playbackState == Player.STATE_ENDED,
                            playbackSuppressed = player.playbackSuppressionReason !=
                                Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                        )
                    ) {
                        cancelCrossfade(notifyController = true)
                    }
                    if (
                        player === activePlayer &&
                        backgroundOwnership &&
                        playWhenReady &&
                        player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE
                    ) {
                        scheduleBackgroundContinuation(500L)
                    }
                }

                override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                    if (
                        player === activePlayer &&
                        playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
                    ) {
                        cancelPendingQueueResolution()
                    }
                    if (
                        player === activePlayer &&
                        shouldCancelMobileCrossfadeForPlaybackInterruption(
                            crossfadeRunning = crossfadeRunning,
                            playWhenReady = player.playWhenReady,
                            outgoingEndedNaturally = player.playbackState == Player.STATE_ENDED,
                            playbackSuppressed = playbackSuppressionReason !=
                                Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                        )
                    ) {
                        cancelCrossfade(notifyController = true)
                    }
                    if (
                        player === activePlayer &&
                        backgroundOwnership &&
                        playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE &&
                        player.playWhenReady
                    ) {
                        scheduleBackgroundContinuation(500L)
                    }
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState != Player.STATE_ENDED) return
                    if (player === preparedPlayer && crossfadeRunning) {
                        val failedTrackKey = preparedTrackKey
                        cancelCrossfade()
                        notifyCrossfadeFailure(failedTrackKey)
                        if (backgroundOwnership) scheduleBackgroundContinuation()
                        return
                    }
                    if (player === activePlayer) {
                        playbackContextStore.load()?.let { context ->
                            context.queue.getOrNull(context.queueIndex)?.let(::recordBackgroundCompletion)
                        }
                        val incoming = preparedPlayer
                        if (incoming != null && incoming.playbackState == Player.STATE_READY) {
                            promotePreparedAtBoundary(player, incoming)
                        } else if (backgroundOwnership) {
                            scheduleBackgroundContinuation()
                        }
                    }
                }

                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    if (
                        player === activePlayer &&
                        backgroundOwnership &&
                        reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT
                    ) {
                        playbackContextStore.load()?.let { context ->
                            context.queue.getOrNull(context.queueIndex)?.let(::recordBackgroundCompletion)
                        }
                        backgroundFeedbackRecordedForTrackKey = ""
                    }
                }
            })
        }

    private fun prepareCrossfade(args: Bundle): Int {
        val serviceOwnedNavigation = args.getBoolean(ARG_SERVICE_OWNED_NAVIGATION)
        if (serviceQueueNavigationInProgress && !serviceOwnedNavigation) {
            return SessionResult.RESULT_ERROR_INVALID_STATE
        }
        if (crossfadeRunning) return SessionResult.RESULT_ERROR_INVALID_STATE
        val streamUrl = args.getString(ARG_STREAM_URL).orEmpty()
        val trackKey = args.getString(ARG_TRACK_KEY).orEmpty()
        val mediaId = args.getString(ARG_MEDIA_ID).orEmpty()
        val queueIndex = args.getInt(ARG_QUEUE_INDEX, -1)
        val configuredDurationMs = args.getLong(ARG_DURATION_MS).coerceIn(0L, 12_000L)
        if (streamUrl.isBlank() || trackKey.isBlank() || mediaId.isBlank()) {
            return SessionResult.RESULT_ERROR_BAD_VALUE
        }

        releasePreparedPlayer()
        val resolvedTrack = Track(
            id = mediaId,
            title = args.getString(ARG_TITLE).orEmpty(),
            artist = args.getString(ARG_ARTIST).orEmpty(),
            album = args.getString(ARG_ALBUM).orEmpty(),
            durationMs = args.getLong(ARG_TRACK_DURATION_MS).coerceAtLeast(0L),
            artworkUrl = args.getString(ARG_ARTWORK_URL).orEmpty(),
            sourceId = trackKey.substringBefore(':', "youtube_music").ifBlank { "youtube_music" },
        )
        val metadata = MediaMetadata.Builder()
            .setTitle(args.getString(ARG_TITLE).orEmpty())
            .setArtist(args.getString(ARG_ARTIST).orEmpty())
            .setAlbumTitle(args.getString(ARG_ALBUM).orEmpty())
            .apply {
                args.getString(ARG_ARTWORK_URL)
                    ?.takeIf(String::isNotBlank)
                    ?.let { setArtworkUri(Uri.parse(it)) }
            }
            .build()
        val player = createPlayer(handleAudioFocus = false).apply {
            volume = 0f
            activePlayer?.let { outgoing ->
                shuffleModeEnabled = outgoing.shuffleModeEnabled
                repeatMode = outgoing.repeatMode
            }
            setMediaItem(
                MediaItem.Builder()
                    .setMediaId(mediaId)
                    .setUri(streamUrl)
                    .setMediaMetadata(metadata)
                    .build(),
            )
            addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    if (this@apply !== preparedPlayer) return
                    notifyCrossfadeFailure(trackKey)
                    cancelCrossfade()
                    if (backgroundOwnership) {
                        scheduleBackgroundContinuation(markBackgroundResolveFailure())
                    }
                }
            })
            prepare()
        }
        preparedPlayer = player
        preparedTrackKey = trackKey
        preparedTrack = resolvedTrack
        preparedQueueIndex = queueIndex
        preparedStartsNewShuffleRound = args.getBoolean(ARG_STARTS_NEW_SHUFFLE_ROUND)
        preparedCountsAsShuffleDraw = args.getBoolean(ARG_COUNTS_AS_SHUFFLE_DRAW, true)
        preparedHistoryCursorTarget = args.getInt(ARG_HISTORY_CURSOR_TARGET, -1).takeIf { it >= 0 }
        preparedPromoteImmediately = args.getBoolean(ARG_PROMOTE_IMMEDIATELY)
        preparedServiceOwnedNavigation = serviceOwnedNavigation
        preparedPlayWhenReady = activePlayer?.let { player ->
            player.isPlaying &&
                player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE
        } == true
        preparedCrossfadeDurationMs = configuredDurationMs
        preparedRequiresExactCut = configuredDurationMs == 0L
        scheduleTransitionMonitor()
        return SessionResult.RESULT_SUCCESS
    }

    private fun scheduleTransitionMonitor() {
        if (transitionMonitorRunnable != null) return
        val runnable = object : Runnable {
            override fun run() {
                if (preparedPlayer == null || activePlayer == null) {
                    transitionMonitorRunnable = null
                    return
                }
                val outgoing = activePlayer ?: return
                val incoming = preparedPlayer ?: return
                if (crossfadeRunning) {
                    transitionMonitorRunnable = null
                    return
                }
                var nextCheckDelayMs = TRANSITION_MONITOR_SLOW_INTERVAL_MS
                if (outgoing.playbackState == Player.STATE_ENDED) {
                    if (incoming.playbackState == Player.STATE_READY) {
                        promotePreparedAtBoundary(outgoing, incoming)
                        return
                    }
                    nextCheckDelayMs = 250L
                } else if (!crossfadeRunning && incoming.playbackState == Player.STATE_READY) {
                    if (preparedPromoteImmediately) {
                        promotePreparedAtBoundary(outgoing, incoming)
                        return
                    }
                    val configuredDurationMs = preparedCrossfadeDurationMs
                    val incomingDurationMs = incoming.duration
                    if (
                        configuredDurationMs > 0L &&
                        incomingDurationMs != C.TIME_UNSET &&
                        shouldUseExactMobileCutForIncoming(incomingDurationMs, configuredDurationMs)
                    ) {
                        preparedRequiresExactCut = true
                    }
                    val outgoingDurationMs = outgoing.duration
                    if (
                        shouldStartMobileCrossfadeForPlaybackState(
                            isPlaying = outgoing.isPlaying,
                            playbackSuppressed = outgoing.playbackSuppressionReason !=
                                Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                        ) &&
                        !preparedRequiresExactCut &&
                        configuredDurationMs >= 250L &&
                        outgoingDurationMs != C.TIME_UNSET
                    ) {
                        val remainingMs = (outgoingDurationMs - outgoing.currentPosition).coerceAtLeast(0L)
                        nextCheckDelayMs = when {
                            remainingMs <= configuredDurationMs + 1_000L -> TRANSITION_MONITOR_INTERVAL_MS
                            remainingMs <= configuredDurationMs + 15_000L -> 500L
                            else -> minOf(
                                TRANSITION_MONITOR_SLOW_INTERVAL_MS,
                                remainingMs - configuredDurationMs - 15_000L,
                            ).coerceAtLeast(500L)
                        }
                        if (remainingMs in 250L..configuredDurationMs) {
                            startCrossfade(minOf(configuredDurationMs, remainingMs))
                        }
                    }
                }
                handler.postDelayed(this, nextCheckDelayMs)
            }
        }
        transitionMonitorRunnable = runnable
        handler.post(runnable)
    }

    private fun scheduleBackgroundContinuation(delayMs: Long = 0L) {
        if (!backgroundOwnership) return
        handler.postDelayed(
            {
                if (!backgroundOwnership || preparedPlayer != null || backgroundResolveJob?.isActive == true) {
                    if (backgroundOwnership && preparedPlayer != null) scheduleTransitionMonitor()
                    return@postDelayed
                }
                val now = SystemClock.elapsedRealtime()
                if (now < nextBackgroundResolveAtMs) {
                    scheduleBackgroundContinuation(nextBackgroundResolveAtMs - now)
                    return@postDelayed
                }
                val outgoing = activePlayer ?: return@postDelayed
                if (!shouldRunMobileBackgroundContinuation(
                        playWhenReady = outgoing.playWhenReady,
                        playbackEnded = outgoing.playbackState == Player.STATE_ENDED,
                        playbackSuppressed = outgoing.playbackSuppressionReason !=
                            Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                    )
                ) return@postDelayed
                val context = playbackContextStore.load() ?: return@postDelayed
                if (context.queue.getOrNull(context.queueIndex)?.id != outgoing.currentMediaItem?.mediaId) {
                    return@postDelayed
                }
                val plan = planMobileServiceNextTrack(
                    context = context,
                    priorityForTrackKey = priorityStore::trackPriority,
                    randomUnit = Random.nextDouble(),
                ) ?: return@postDelayed
                val nextTrack = context.queue.getOrNull(plan.queueIndex) ?: return@postDelayed
                val outgoingMediaId = outgoing.currentMediaItem?.mediaId.orEmpty()
                val generation = ++backgroundResolveGeneration
                backgroundResolveJob = serviceScope.launch {
                    runCatching { api.resolvePlayable(nextTrack, context.quality) }
                        .onSuccess { playback ->
                            withContext(Dispatchers.Main.immediate) {
                                if (
                                    !backgroundOwnership ||
                                    generation != backgroundResolveGeneration ||
                                    activePlayer?.currentMediaItem?.mediaId != outgoingMediaId ||
                                    preparedPlayer != null
                                ) return@withContext
                                val result = prepareCrossfade(
                                    Bundle().apply {
                                        putString(ARG_TRACK_KEY, playback.track.serviceQueueKey())
                                        putString(ARG_MEDIA_ID, playback.track.id)
                                        putString(ARG_STREAM_URL, playback.stream.url)
                                        putString(ARG_TITLE, playback.track.title)
                                        putString(ARG_ARTIST, playback.track.artist)
                                        putString(ARG_ALBUM, playback.track.album)
                                        putString(ARG_ARTWORK_URL, playback.track.artworkUrl)
                                        putLong(ARG_TRACK_DURATION_MS, playback.track.durationMs)
                                        putInt(ARG_QUEUE_INDEX, plan.queueIndex)
                                        putLong(ARG_DURATION_MS, context.crossfadeDurationMs)
                                        putBoolean(
                                            ARG_STARTS_NEW_SHUFFLE_ROUND,
                                            plan.startsNewShuffleRound,
                                        )
                                        putBoolean(ARG_COUNTS_AS_SHUFFLE_DRAW, plan.countsAsShuffleDraw)
                                        putInt(ARG_HISTORY_CURSOR_TARGET, plan.historyCursorTarget ?: -1)
                                    },
                                )
                                if (result != SessionResult.RESULT_SUCCESS) {
                                    markBackgroundResolveFailure()
                                } else {
                                    resetBackgroundResolveBackoff()
                                }
                            }
                        }
                        .onFailure {
                            handler.post {
                                if (generation == backgroundResolveGeneration) {
                                    markBackgroundResolveFailure()
                                }
                            }
                        }
                    withContext(Dispatchers.Main.immediate) {
                        if (generation == backgroundResolveGeneration) {
                            backgroundResolveJob = null
                            if (preparedPlayer == null) {
                                scheduleBackgroundContinuation()
                            }
                        }
                    }
                }
            },
            delayMs.coerceAtLeast(0L),
        )
    }

    private fun requestServiceQueueStep(step: Int) {
        if (step == 0) return
        val outgoing = activePlayer ?: return
        if (step < 0 && outgoing.currentPosition > 3_000L) {
            cancelCrossfade(notifyController = true)
            backgroundFeedbackRecordedForTrackKey = ""
            outgoing.seekTo(0L)
            if (backgroundOwnership) scheduleBackgroundContinuation(500L)
            return
        }
        val context = playbackContextStore.load() ?: return
        if (context.queue.getOrNull(context.queueIndex)?.id != outgoing.currentMediaItem?.mediaId) return
        val plan = if (step < 0) {
            planMobileServicePreviousTrack(context)
        } else {
            planMobileServiceNextTrack(
                context = context,
                priorityForTrackKey = priorityStore::trackPriority,
                randomUnit = Random.nextDouble(),
                manualNavigation = true,
            )
        } ?: return
        val nextTrack = context.queue.getOrNull(plan.queueIndex) ?: return
        val pendingDeparture = context.queue.getOrNull(context.queueIndex)?.let { track ->
            pendingBackgroundManualDeparture(track)
        }
        cancelCrossfade(notifyController = true)
        serviceQueueNavigationInProgress = true
        backgroundResolveGeneration += 1L
        backgroundResolveJob?.cancel()
        val generation = backgroundResolveGeneration
        val outgoingMediaId = outgoing.currentMediaItem?.mediaId.orEmpty()
        backgroundResolveJob = serviceScope.launch {
            runCatching { api.resolvePlayable(nextTrack, context.quality) }
                .onSuccess { playback ->
                    withContext(Dispatchers.Main.immediate) {
                        if (!shouldCommitMobileServiceNavigation(
                                capturedGeneration = generation,
                                currentGeneration = backgroundResolveGeneration,
                                capturedMediaId = outgoingMediaId,
                                currentMediaId = activePlayer?.currentMediaItem?.mediaId.orEmpty(),
                                navigationStillPending = serviceQueueNavigationInProgress,
                            ) || preparedPlayer != null
                        ) return@withContext
                        val result = prepareCrossfade(
                            Bundle().apply {
                                putString(ARG_TRACK_KEY, playback.track.serviceQueueKey())
                                putString(ARG_MEDIA_ID, playback.track.id)
                                putString(ARG_STREAM_URL, playback.stream.url)
                                putString(ARG_TITLE, playback.track.title)
                                putString(ARG_ARTIST, playback.track.artist)
                                putString(ARG_ALBUM, playback.track.album)
                                putString(ARG_ARTWORK_URL, playback.track.artworkUrl)
                                putLong(ARG_TRACK_DURATION_MS, playback.track.durationMs)
                                putInt(ARG_QUEUE_INDEX, plan.queueIndex)
                                putLong(ARG_DURATION_MS, 0L)
                                putBoolean(
                                    ARG_STARTS_NEW_SHUFFLE_ROUND,
                                    plan.startsNewShuffleRound,
                                )
                                putBoolean(ARG_COUNTS_AS_SHUFFLE_DRAW, plan.countsAsShuffleDraw)
                                putInt(ARG_HISTORY_CURSOR_TARGET, plan.historyCursorTarget ?: -1)
                                putBoolean(ARG_PROMOTE_IMMEDIATELY, true)
                                putBoolean(ARG_SERVICE_OWNED_NAVIGATION, true)
                            },
                        )
                        if (result == SessionResult.RESULT_SUCCESS) {
                            preparedManualDeparture = pendingDeparture
                            resetBackgroundResolveBackoff()
                        } else {
                            markBackgroundResolveFailure()
                        }
                    }
                }
                .onFailure {
                    handler.post {
                        if (generation == backgroundResolveGeneration) {
                            markBackgroundResolveFailure()
                        }
                    }
                }
            withContext(Dispatchers.Main.immediate) {
                if (generation == backgroundResolveGeneration) {
                    backgroundResolveJob = null
                    if (preparedPlayer == null) scheduleBackgroundContinuation()
                    if (preparedPlayer == null) serviceQueueNavigationInProgress = false
                }
            }
        }
    }

    private fun cancelPendingQueueResolution(): Boolean {
        val hadPendingResolution = backgroundResolveJob?.isActive == true ||
            serviceQueueNavigationInProgress
        if (!hadPendingResolution) return false
        backgroundResolveGeneration += 1L
        backgroundResolveJob?.cancel()
        backgroundResolveJob = null
        serviceQueueNavigationInProgress = false
        return true
    }

    private fun startCrossfade(requestedDurationMs: Long): Int {
        if (crossfadeRunning) return SessionResult.RESULT_SUCCESS
        val outgoing = activePlayer ?: return SessionResult.RESULT_ERROR_INVALID_STATE
        val incoming = preparedPlayer ?: return SessionResult.RESULT_ERROR_INVALID_STATE
        if (incoming.playbackState != Player.STATE_READY) return SessionResult.RESULT_ERROR_INVALID_STATE
        if (!outgoing.playWhenReady) return SessionResult.RESULT_ERROR_INVALID_STATE
        if (requestedDurationMs !in 250L..12_000L) return SessionResult.RESULT_ERROR_BAD_VALUE
        val incomingDurationMs = incoming.duration
        if (
            preparedRequiresExactCut ||
            (incomingDurationMs != C.TIME_UNSET &&
                shouldUseExactMobileCutForIncoming(incomingDurationMs, requestedDurationMs))
        ) {
            preparedRequiresExactCut = true
            return SessionResult.RESULT_SUCCESS
        }
        val durationMs = requestedDurationMs
        val startedAt = SystemClock.elapsedRealtime()
        val trackKey = preparedTrackKey
        fadeTargetVolume = outgoing.volume.coerceIn(0f, 1f)
        crossfadeRunning = true
        incoming.volume = 0f
        incoming.play()

        val runnable = object : Runnable {
            override fun run() {
                if (!crossfadeRunning || preparedPlayer !== incoming || activePlayer !== outgoing) return
                val progress = ((SystemClock.elapsedRealtime() - startedAt).toFloat() / durationMs)
                    .coerceIn(0f, 1f)
                outgoing.volume = fadeTargetVolume * (1f - progress)
                incoming.volume = fadeTargetVolume * progress
                if (progress < 1f) {
                    handler.postDelayed(this, 40L)
                } else {
                    finishCrossfade(outgoing, incoming, trackKey)
                }
            }
        }
        fadeRunnable = runnable
        handler.post(runnable)
        return SessionResult.RESULT_SUCCESS
    }

    private fun finishCrossfade(outgoing: ExoPlayer, incoming: ExoPlayer, trackKey: String) {
        val completedTrack = preparedTrack
        val completedQueueIndex = preparedQueueIndex
        val startsNewRound = preparedStartsNewShuffleRound
        val countsAsShuffleDraw = preparedCountsAsShuffleDraw
        val historyCursorTarget = preparedHistoryCursorTarget
        val manualDeparture = preparedManualDeparture
        val serviceOwnedNavigation = preparedServiceOwnedNavigation
        fadeRunnable?.let(handler::removeCallbacks)
        fadeRunnable = null
        transitionMonitorRunnable?.let(handler::removeCallbacks)
        transitionMonitorRunnable = null
        crossfadeRunning = false
        outgoing.pause()
        incoming.volume = fadeTargetVolume
        val promotedModes = mobilePromotedPlayerModes(
            outgoingShuffleEnabled = outgoing.shuffleModeEnabled,
            outgoingRepeatMode = outgoing.repeatMode,
        )
        incoming.shuffleModeEnabled = promotedModes.shuffleEnabled
        incoming.repeatMode = promotedModes.repeatMode
        incoming.setAudioAttributes(audioAttributes, true)
        activePlayer = incoming
        preparedPlayer = null
        preparedTrackKey = ""
        clearPreparedMetadata()
        mediaSession?.setPlayer(incoming)
        outgoing.release()
        if (completedTrack != null) {
            playbackContextStore.load()?.let { context ->
                applyBackgroundManualDeparture(manualDeparture)
                context.queue.getOrNull(context.queueIndex)?.let(::recordBackgroundCompletion)
                playbackContextStore.save(
                    advanceMobilePlaybackServiceContext(
                        context = context,
                        queueIndex = completedQueueIndex,
                        resolvedTrack = completedTrack,
                        startsNewShuffleRound = startsNewRound,
                        countsAsShuffleDraw = countsAsShuffleDraw,
                        historyCursorTarget = historyCursorTarget,
                    ),
                )
            }
            if (backgroundOwnership || serviceOwnedNavigation) {
                backgroundHistoryStore.append(completedTrack)
            }
        }
        backgroundFeedbackRecordedForTrackKey = ""
        serviceQueueNavigationInProgress = false
        mediaSession?.broadcastCustomCommand(
            CROSSFADE_COMPLETED_COMMAND,
            Bundle().apply { putString(ARG_TRACK_KEY, trackKey) },
        )
        if (backgroundOwnership) scheduleBackgroundContinuation()
    }

    private fun promotePreparedAtBoundary(outgoing: ExoPlayer, incoming: ExoPlayer) {
        if (incoming.playbackState != Player.STATE_READY) return
        fadeTargetVolume = outgoing.volume.coerceIn(0f, 1f)
        incoming.volume = fadeTargetVolume
        if (preparedPlayWhenReady) incoming.play()
        finishCrossfade(outgoing, incoming, preparedTrackKey)
    }

    private fun cancelCrossfade(notifyController: Boolean = false) {
        val wasRunning = crossfadeRunning
        val cancelledTrackKey = preparedTrackKey
        fadeRunnable?.let(handler::removeCallbacks)
        fadeRunnable = null
        transitionMonitorRunnable?.let(handler::removeCallbacks)
        transitionMonitorRunnable = null
        crossfadeRunning = false
        if (wasRunning) activePlayer?.volume = fadeTargetVolume.coerceIn(0f, 1f)
        releasePreparedPlayer()
        serviceQueueNavigationInProgress = false
        if (notifyController && cancelledTrackKey.isNotBlank()) {
            mediaSession?.broadcastCustomCommand(
                CROSSFADE_FAILED_COMMAND,
                Bundle().apply { putString(ARG_TRACK_KEY, cancelledTrackKey) },
            )
        }
    }

    private fun releasePreparedPlayer() {
        preparedPlayer?.run {
            stop()
            release()
        }
        preparedPlayer = null
        clearPreparedMetadata()
    }

    private fun clearPreparedMetadata() {
        preparedTrackKey = ""
        preparedTrack = null
        preparedQueueIndex = -1
        preparedStartsNewShuffleRound = false
        preparedCountsAsShuffleDraw = true
        preparedHistoryCursorTarget = null
        preparedPromoteImmediately = false
        preparedManualDeparture = null
        preparedServiceOwnedNavigation = false
        preparedPlayWhenReady = true
        preparedCrossfadeDurationMs = 0L
        preparedRequiresExactCut = false
    }

    private fun notifyCrossfadeFailure(trackKey: String) {
        mediaSession?.broadcastCustomCommand(
            CROSSFADE_FAILED_COMMAND,
            Bundle().apply { putString(ARG_TRACK_KEY, trackKey) },
        )
    }

    private fun recordBackgroundCompletion(track: Track) {
        if (!backgroundOwnership) return
        val trackKey = track.serviceQueueKey()
        if (backgroundFeedbackRecordedForTrackKey == trackKey) return
        priorityStore.recordTrackFeedback(trackKey, MobileTrackFeedback.Completed)
        backgroundFeedbackRecordedForTrackKey = trackKey
    }

    private fun pendingBackgroundManualDeparture(track: Track): PendingBackgroundDeparture? {
        val trackKey = track.serviceQueueKey()
        if (backgroundFeedbackRecordedForTrackKey == trackKey) return null
        val player = activePlayer ?: return null
        return PendingBackgroundDeparture(
            trackKey = trackKey,
            feedback = mobileTrackFeedbackForManualDeparture(player.currentPosition, player.duration),
        )
    }

    private fun applyBackgroundManualDeparture(departure: PendingBackgroundDeparture?) {
        if (departure == null) return
        if (backgroundFeedbackRecordedForTrackKey == departure.trackKey) return
        val feedback = committedMobileDepartureFeedback(
            pending = departure.feedback,
            replacementCommitted = true,
        ) ?: return
        priorityStore.recordTrackFeedback(departure.trackKey, feedback)
        backgroundFeedbackRecordedForTrackKey = departure.trackKey
    }

    private fun markBackgroundResolveFailure(): Long {
        backgroundResolveFailureCount = (backgroundResolveFailureCount + 1)
            .coerceAtMost(MAX_BACKGROUND_RESOLVE_BACKOFF_STEPS)
        val delayMs = (BACKGROUND_RESOLVE_RETRY_MS shl (backgroundResolveFailureCount - 1))
            .coerceAtMost(MAX_BACKGROUND_RESOLVE_RETRY_MS)
        nextBackgroundResolveAtMs = SystemClock.elapsedRealtime() + delayMs
        return delayMs
    }

    private fun resetBackgroundResolveBackoff() {
        backgroundResolveFailureCount = 0
        nextBackgroundResolveAtMs = 0L
    }

    private companion object {
        const val TRANSITION_MONITOR_INTERVAL_MS = 100L
        const val TRANSITION_MONITOR_SLOW_INTERVAL_MS = 5_000L
        const val BACKGROUND_RESOLVE_RETRY_MS = 3_000L
        const val MAX_BACKGROUND_RESOLVE_RETRY_MS = 300_000L
        const val MAX_BACKGROUND_RESOLVE_BACKOFF_STEPS = 7
    }
}

private data class PendingBackgroundDeparture(
    val trackKey: String,
    val feedback: MobileTrackFeedback,
)
