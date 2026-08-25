package xyz.spiceapp.mobile

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import xyz.spiceapp.mobile.data.LibraryRepository
import xyz.spiceapp.mobile.data.PairedCredentialStore
import xyz.spiceapp.mobile.data.SessionStore
import xyz.spiceapp.mobile.data.SpiceApi
import xyz.spiceapp.mobile.data.SpiceApiException
import xyz.spiceapp.mobile.data.SpiceConnectRealtimeEvent
import xyz.spiceapp.mobile.data.SPICE_CONNECT_LAN_SIGNAL_COMMAND
import xyz.spiceapp.mobile.data.SpiceConnectLanTransport
import xyz.spiceapp.mobile.data.ResolvedPlayback
import xyz.spiceapp.mobile.data.parseSpiceConnectLanTimestamp
import xyz.spiceapp.mobile.data.parseListenerFavorites
import xyz.spiceapp.mobile.data.spiceConnectLanTimestamp
import xyz.spiceapp.mobile.data.toRemoteTrackJson
import xyz.spiceapp.mobile.data.download.MediaDownloadClient
import xyz.spiceapp.mobile.data.update.AppUpdateClient
import xyz.spiceapp.mobile.data.update.AppUpdateDownloadStatus
import xyz.spiceapp.mobile.data.update.AppUpdateException
import xyz.spiceapp.mobile.data.update.AppUpdateInfo
import xyz.spiceapp.mobile.data.update.AppUpdateUiState
import xyz.spiceapp.mobile.data.update.DurableAppUpdateDownload
import xyz.spiceapp.mobile.data.update.DurableAppUpdateDownloadManager
import xyz.spiceapp.mobile.data.update.parseStableSemanticVersion
import xyz.spiceapp.mobile.model.AccountBlock
import xyz.spiceapp.mobile.model.AccountSession
import xyz.spiceapp.mobile.model.AccentTheme
import xyz.spiceapp.mobile.model.AppScreen
import xyz.spiceapp.mobile.model.AuthMode
import xyz.spiceapp.mobile.model.DownloadedTrack
import xyz.spiceapp.mobile.model.EmailVerificationChallenge
import xyz.spiceapp.mobile.model.FeedSection
import xyz.spiceapp.mobile.model.LibraryTab
import xyz.spiceapp.mobile.model.LibrarySyncSummary
import xyz.spiceapp.mobile.model.LyricsPayload
import xyz.spiceapp.mobile.model.PairedDeviceCredential
import xyz.spiceapp.mobile.model.PendingPlaylistInvite
import xyz.spiceapp.mobile.model.Playlist
import xyz.spiceapp.mobile.model.PlaylistInvitePreview
import xyz.spiceapp.mobile.model.PlaylistMembersSummary
import xyz.spiceapp.mobile.model.ProfileSummary
import xyz.spiceapp.mobile.model.RemoteCommand
import xyz.spiceapp.mobile.model.RemoteDevice
import xyz.spiceapp.mobile.model.RepeatMode
import xyz.spiceapp.mobile.model.SearchProvider
import xyz.spiceapp.mobile.model.SharedPlaylistTrack
import xyz.spiceapp.mobile.model.SharedPlaylistTracks
import xyz.spiceapp.mobile.model.SpiceProfile
import xyz.spiceapp.mobile.model.StreamQuality
import xyz.spiceapp.mobile.model.Track
import xyz.spiceapp.mobile.playback.PlayerConnection
import xyz.spiceapp.mobile.playback.PlayerUiState
import xyz.spiceapp.mobile.playback.MobilePlaybackServiceContext
import xyz.spiceapp.mobile.playback.normalizeMobilePlaybackHistoryForQueue
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.random.Random

private const val SPICE_CONNECT_LOG_TAG = "SpiceConnect"

private enum class SpiceConnectRealtimeWakeup {
    Command,
    State,
}

data class SpiceUiState(
    val screen: AppScreen = AppScreen.Home,
    val homeSections: List<FeedSection> = emptyList(),
    val homeLoading: Boolean = true,
    val searchQuery: String = "",
    val searchResults: List<Track> = emptyList(),
    val searchLoading: Boolean = false,
    val resolvingTrackId: String? = null,
    val currentTrack: Track? = null,
    val playbackQueue: List<Track> = emptyList(),
    val queueIndex: Int = -1,
    val likedTracks: List<Track> = emptyList(),
    val historyTracks: List<Track> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val downloads: List<DownloadedTrack> = emptyList(),
    val libraryTab: LibraryTab = LibraryTab.Playlists,
    val quality: StreamQuality = StreamQuality.Standard,
    val searchProvider: SearchProvider = SearchProvider.All,
    val crossfadeDurationMs: Long = 0L,
    val smartQueueEnabled: Boolean = true,
    val accentTheme: AccentTheme = AccentTheme.MidnightVelvet,
    val accountSession: AccountSession? = null,
    val accountBlock: AccountBlock? = null,
    val pairedDeviceCredential: PairedDeviceCredential? = null,
    val spiceConnectEnabled: Boolean = false,
    val pairingCode: String = "",
    val pairingLoading: Boolean = false,
    val profileSummary: ProfileSummary? = null,
    val profileLoading: Boolean = false,
    val profileEditOpen: Boolean = false,
    val profileEditDisplayName: String = "",
    val profileEditUsername: String = "",
    val profileEditAvatarUrl: String = "",
    val profileEditBio: String = "",
    val profileEditPrivate: Boolean = false,
    val profileEditLoading: Boolean = false,
    val authMode: AuthMode = AuthMode.SignIn,
    val authEmail: String = "",
    val authPassword: String = "",
    val authUsername: String = "",
    val emailVerification: EmailVerificationChallenge? = null,
    val authVerificationCode: String = "",
    val accountLoading: Boolean = false,
    val syncLoading: Boolean = false,
    val lastSync: LibrarySyncSummary? = null,
    val pendingInvitePreview: PlaylistInvitePreview? = null,
    val inviteLoading: Boolean = false,
    val pendingAccountInvites: List<PendingPlaylistInvite> = emptyList(),
    val accountInvitesLoading: Boolean = false,
    val sharingPlaylistId: String? = null,
    val activeMemberPlaylist: Playlist? = null,
    val playlistMembers: PlaylistMembersSummary? = null,
    val sharedPlaylistTracks: SharedPlaylistTracks? = null,
    val membersLoading: Boolean = false,
    val memberActionLoading: Boolean = false,
    val sharedTrackActionLoading: Boolean = false,
    val memberInviteUsername: String = "",
    val downloadTrackId: String? = null,
    val downloadProgress: String? = null,
    val downloadPlaylistId: String? = null,
    val downloadPlaylistCompleted: Int = 0,
    val downloadPlaylistTotal: Int = 0,
    val pendingRemoteDownloadTrack: Track? = null,
    val lyricsTrackId: String? = null,
    val lyricsPayload: LyricsPayload? = null,
    val lyricsLoading: Boolean = false,
    val remoteDeviceId: String = "",
    val remoteDevices: List<RemoteDevice> = emptyList(),
    val selectedPlaybackDeviceId: String = "",
    val lanConnectedDeviceIds: Set<String> = emptySet(),
    val incomingRemoteControllerDeviceId: String = "",
    val connectLoading: Boolean = false,
    val connectStatus: String = "",
    val appUpdate: AppUpdateUiState = AppUpdateUiState(),
    val message: String? = null,
)

class SpiceViewModel(application: Application) : AndroidViewModel(application) {
    private val api = SpiceApi()
    private val libraryRepository = LibraryRepository(application)
    private val sessionStore = SessionStore(application)
    private val pairedCredentialStore = PairedCredentialStore(application)
    private val downloadClient = MediaDownloadClient(application)
    private val appUpdateClient = AppUpdateClient()
    private val appUpdateDownloadManager = DurableAppUpdateDownloadManager(application)
    private val playerConnection = PlayerConnection(
        context = application,
        onPlaybackEnded = ::handlePlaybackEnded,
        onTrackRepeated = ::handleTrackRepeated,
        onCrossfadeCompleted = ::handleCrossfadeCompleted,
        onCrossfadeFailed = ::handleCrossfadeFailed,
    )
    private val connectPreferences = application.getSharedPreferences("spice_connect", Context.MODE_PRIVATE)
    private val remoteDeviceId = loadRemoteDeviceId()
    private val clientBootedAtMs = System.currentTimeMillis()
    private val initialPairedCredential = pairedCredentialStore.load()
        ?.takeIf { it.deviceId == remoteDeviceId }
        .also { credential ->
            if (credential == null) pairedCredentialStore.clear()
        }
    private val initialSpiceConnectEnabled = if (connectPreferences.contains(KEY_SPICE_CONNECT_ENABLED)) {
        connectPreferences.getBoolean(KEY_SPICE_CONNECT_ENABLED, false)
    } else {
        initialPairedCredential != null
    }
    private var playJob: Job? = null
    private var downloadJob: Job? = null
    private var remoteVolumeJob: Job? = null
    private var connectJob: Job? = null
    private var connectRealtimeJob: Job? = null
    private var connectRefreshJob: Job? = null
    private var searchDebounceJob: Job? = null
    private var searchJob: Job? = null
    private var adaptiveTasteSyncJob: Job? = null
    private var spiceConnectLanTransport: SpiceConnectLanTransport? = null
    private var lastSpiceConnectLanFingerprint: String? = null
    private var handoffAcceptTimeoutJob: Job? = null
    private var handoffCompleteTimeoutJob: Job? = null
    private var pendingSpiceConnectHandoff: PendingSpiceConnectHandoff? = null
    private val preparedSpiceConnectHandoffs = mutableMapOf<String, PreparedSpiceConnectHandoff>()
    private val likeMutationRevisions = mutableMapOf<String, Long>()
    private var updateCheckJob: Job? = null
    private var updateDownloadJob: Job? = null
    private var autoHistorySyncJob: Job? = null
    private var autoTasteSyncJob: Job? = null
    private var lyricsJob: Job? = null
    private var homeLoadJob: Job? = null
    private var transitionPreparationJob: Job? = null
    private var preparedTransition: PreparedMobileTransition? = null
    private var crossfadeInProgress = false
    private var crossfadeBypassOutgoingKey = ""
    private val playbackHistory = mutableListOf<String>()
    private var playbackHistoryCursor = -1
    private val shuffleCycleTrackKeys = linkedSetOf<String>()
    private var shuffleRoundPlayCount = 0
    private var feedbackRecordedForCurrentPlayback = false
    private var lastObservedShuffleEnabled = false
    private val cloudLibrarySyncMutex = Mutex()
    private val remoteLibraryMutationMutex = Mutex()
    private var optimisticRemoteDeviceId: String? = null
    private var optimisticRemoteStateUntilElapsedMs: Long = 0L
    private var optimisticRemoteTrackChanged: Boolean = false
    private val optimisticallyForgottenRemoteDeviceIds = mutableSetOf<String>()
    private val appliedRemoteCommandIds = BoundedSpiceConnectCommandIds(
        capacity = MAX_APPLIED_REMOTE_COMMAND_IDS,
        initialIds = loadAppliedRemoteCommandIds(),
    )
    private val connectRealtimeWakeups = Channel<SpiceConnectRealtimeWakeup>(Channel.BUFFERED)
    private val connectRealtimeAvailable = AtomicBoolean(false)
    private var activeDownloadProcessId: String? = null
    private val _uiState = MutableStateFlow(
        SpiceUiState(
            quality = libraryRepository.quality(),
            searchProvider = libraryRepository.searchProvider(),
            crossfadeDurationMs = libraryRepository.crossfadeDurationMs(),
            smartQueueEnabled = libraryRepository.smartQueueEnabled(),
            accentTheme = libraryRepository.accentTheme(),
            accountSession = sessionStore.load(),
            pairedDeviceCredential = initialPairedCredential,
            spiceConnectEnabled = initialSpiceConnectEnabled,
            remoteDeviceId = remoteDeviceId,
            selectedPlaybackDeviceId = loadSelectedPlaybackDeviceId(),
        ),
    )
    val uiState: StateFlow<SpiceUiState> = _uiState.asStateFlow()
    val playerState: StateFlow<PlayerUiState> = playerConnection.state

    init {
        observeLibrary()
        initializeLibraryAndHome()
        observePlaybackTransitions()
        _uiState.value.accountSession?.let { session ->
            verifyRestoredAccountSession(session)
        }
        if (shouldStartSpiceConnect()) {
            startSpiceConnect()
        }
        if (!resumeDurableAppUpdateDownload()) checkForAppUpdate()
    }

    private fun verifyRestoredAccountSession(session: AccountSession) {
        viewModelScope.launch {
            runCatching { api.fetchAccountMe(session.token) }
                .onSuccess { account ->
                    if (account.moderationStatus != "active") {
                        _uiState.value = _uiState.value.copy(
                            accountBlock = accountBlockFromModeration(
                                status = account.moderationStatus,
                                reason = account.moderationReason,
                                expiresAt = account.moderationExpiresAt,
                            ),
                        )
                        return@onSuccess
                    }
                    loadProfileSummary(session)
                    loadPendingAccountInvites(session)
                }
                .onFailure { error ->
                    // A blocked account rejects /account/me with 403 before the
                    // rest of the session work can start.
                    if (!applyAccountBlockFromApiError(error)) {
                        // Offline or transient failure: keep the existing restore
                        // behavior so local playback still works.
                        loadProfileSummary(session)
                        loadPendingAccountInvites(session)
                    }
                }
        }
    }

    private fun accountBlockFromModeration(
        status: String,
        reason: String,
        expiresAt: String,
    ): AccountBlock {
        val isTimeout = status == "timeout"
        return AccountBlock(
            status = if (isTimeout) "timeout" else "banned",
            reason = reason.trim(),
            expiresAt = expiresAt.trim(),
        )
    }

    private fun applyAccountBlockFromApiError(error: Throwable): Boolean {
        val apiError = error as? SpiceApiException ?: return false
        val code = apiError.code
        if (code != "account_timed_out" && code != "account_banned") return false
        val isTimeout = code == "account_timed_out"
        _uiState.value = _uiState.value.copy(
            accountBlock = AccountBlock(
                status = if (isTimeout) "timeout" else "banned",
                reason = apiError.moderationReason?.trim().orEmpty(),
                expiresAt = apiError.moderationExpiresAt?.trim().orEmpty(),
            ),
            accountLoading = false,
            profileLoading = false,
        )
        return true
    }

    fun checkForAppUpdate() {
        if (updateCheckJob?.isActive == true || updateDownloadJob?.isActive == true) return
        _uiState.value = _uiState.value.copy(
            appUpdate = _uiState.value.appUpdate.copy(checking = true, error = null),
        )
        updateCheckJob = viewModelScope.launch {
            runCatching { appUpdateClient.findLatestUpdate(BuildConfig.SPICE_RELEASE_VERSION) }
                .onSuccess { update ->
                    _uiState.value = _uiState.value.copy(
                        appUpdate = AppUpdateUiState(
                            checking = false,
                            update = update,
                            totalBytes = update?.sizeBytes ?: 0L,
                        ),
                    )
                }
                .onFailure {
                    // A startup update check should never block an offline listener.
                    _uiState.value = _uiState.value.copy(
                        appUpdate = _uiState.value.appUpdate.copy(checking = false),
                    )
                }
        }
    }

    fun downloadAppUpdate() {
        val update = _uiState.value.appUpdate.update ?: return
        if (updateDownloadJob?.isActive == true) return
        startDurableAppUpdateDownload(update)
    }

    fun cancelAppUpdateDownload() {
        val activeJob = updateDownloadJob
        updateDownloadJob = null
        activeJob?.cancel()
        viewModelScope.launch {
            activeJob?.join()
            withContext(Dispatchers.IO) {
                runCatching {
                    appUpdateDownloadManager.clear(removeSystemDownload = true, deleteFile = true)
                }
            }
            _uiState.value = _uiState.value.copy(
                appUpdate = _uiState.value.appUpdate.copy(
                    downloading = false,
                    downloadedBytes = 0L,
                    downloadedApkPath = null,
                ),
            )
        }
    }

    fun dismissAppUpdate() {
        if (_uiState.value.appUpdate.downloading) return
        _uiState.value = _uiState.value.copy(
            appUpdate = _uiState.value.appUpdate.copy(dismissed = true, error = null),
        )
    }

    fun reportAppUpdateInstallError(message: String) {
        _uiState.value = _uiState.value.copy(
            appUpdate = _uiState.value.appUpdate.copy(error = message, dismissed = false),
        )
    }

    private fun resumeDurableAppUpdateDownload(): Boolean {
        val active = appUpdateDownloadManager.restore() ?: return false
        if (!isNewerAppUpdate(active.update)) {
            viewModelScope.launch(Dispatchers.IO) {
                runCatching {
                    appUpdateDownloadManager.clear(removeSystemDownload = true, deleteFile = true)
                }
            }
            return false
        }
        startDurableAppUpdateDownload(active.update, active)
        return true
    }

    private fun isNewerAppUpdate(update: AppUpdateInfo): Boolean {
        val currentVersion = parseStableSemanticVersion(BuildConfig.SPICE_RELEASE_VERSION) ?: return false
        val updateVersion = parseStableSemanticVersion(update.version) ?: return false
        return updateVersion > currentVersion
    }

    private fun startDurableAppUpdateDownload(
        update: AppUpdateInfo,
        restoredDownload: DurableAppUpdateDownload? = null,
    ) {
        _uiState.value = _uiState.value.copy(
            appUpdate = AppUpdateUiState(
                update = update,
                downloading = true,
                totalBytes = update.sizeBytes,
            ),
        )
        updateDownloadJob = viewModelScope.launch {
            try {
                val active = restoredDownload ?: withContext(Dispatchers.IO) {
                    appUpdateDownloadManager.enqueue(update)
                }
                monitorDurableAppUpdateDownload(active)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                withContext(Dispatchers.IO) {
                    runCatching {
                        appUpdateDownloadManager.clear(removeSystemDownload = true, deleteFile = true)
                    }
                }
                if (_uiState.value.appUpdate.update?.version == update.version) {
                    _uiState.value = _uiState.value.copy(
                        appUpdate = _uiState.value.appUpdate.copy(
                            downloading = false,
                            downloadedBytes = 0L,
                            downloadedApkPath = null,
                            error = error.message ?: "The SPICE Android update download failed.",
                        ),
                    )
                }
            }
        }
    }

    private suspend fun monitorDurableAppUpdateDownload(active: DurableAppUpdateDownload) {
        var consecutiveMissingChecks = 0
        while (true) {
            val snapshot = withContext(Dispatchers.IO) { appUpdateDownloadManager.query(active) }
            when (snapshot.status) {
                AppUpdateDownloadStatus.Pending,
                AppUpdateDownloadStatus.Running,
                AppUpdateDownloadStatus.Paused -> {
                    consecutiveMissingChecks = 0
                    if (_uiState.value.appUpdate.update?.version == active.update.version) {
                        _uiState.value = _uiState.value.copy(
                            appUpdate = _uiState.value.appUpdate.copy(
                                downloading = true,
                                downloadedBytes = snapshot.downloadedBytes,
                                totalBytes = snapshot.totalBytes.takeIf { it > 0L }
                                    ?: active.update.sizeBytes,
                                error = null,
                            ),
                        )
                    }
                    delay(APP_UPDATE_DOWNLOAD_POLL_INTERVAL_MS)
                }
                AppUpdateDownloadStatus.Successful -> {
                    val apk = withContext(Dispatchers.IO) {
                        appUpdateDownloadManager.verifyCompletedFile(active)
                    }
                    _uiState.value = _uiState.value.copy(
                        appUpdate = _uiState.value.appUpdate.copy(
                            downloading = false,
                            downloadedBytes = apk.length(),
                            totalBytes = apk.length(),
                            downloadedApkPath = apk.absolutePath,
                            error = null,
                        ),
                    )
                    return
                }
                AppUpdateDownloadStatus.Missing -> {
                    val completedApk = withContext(Dispatchers.IO) {
                        runCatching { appUpdateDownloadManager.verifyCompletedFile(active) }.getOrNull()
                    }
                    if (completedApk != null) {
                        _uiState.value = _uiState.value.copy(
                            appUpdate = _uiState.value.appUpdate.copy(
                                downloading = false,
                                downloadedBytes = completedApk.length(),
                                totalBytes = completedApk.length(),
                                downloadedApkPath = completedApk.absolutePath,
                                error = null,
                            ),
                        )
                        return
                    }
                    consecutiveMissingChecks += 1
                    if (consecutiveMissingChecks >= MAX_MISSING_APP_UPDATE_DOWNLOAD_CHECKS) {
                        throw AppUpdateException("Android lost the SPICE update download. Please retry.")
                    }
                    delay(APP_UPDATE_DOWNLOAD_POLL_INTERVAL_MS)
                }
                AppUpdateDownloadStatus.Failed -> throw AppUpdateException(
                    appUpdateDownloadManager.failureMessage(snapshot.reason),
                )
            }
        }
    }

    fun selectScreen(screen: AppScreen) {
        _uiState.value = _uiState.value.copy(screen = screen)
    }

    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        searchDebounceJob?.cancel()
        val normalized = query.trim()
        if (normalized.isEmpty()) {
            _uiState.value = _uiState.value.copy(searchResults = emptyList(), searchLoading = false)
            return
        }
        searchDebounceJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            runSearch(normalized)
        }
    }

    fun setSearchProvider(provider: SearchProvider) {
        libraryRepository.setSearchProvider(provider)
        _uiState.value = _uiState.value.copy(searchProvider = provider)
    }

    fun search(query: String = _uiState.value.searchQuery) {
        searchDebounceJob?.cancel()
        val normalized = query.trim()
        if (normalized.isEmpty()) return
        _uiState.value = _uiState.value.copy(searchQuery = normalized, searchLoading = true, message = null)
        runSearch(normalized)
    }

    private fun runSearch(normalized: String) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _uiState.value = _uiState.value.copy(searchLoading = true, message = null)
            runCatching { api.search(normalized, 20, _uiState.value.searchProvider) }
                .onSuccess { tracks ->
                    if (!isActive) return@launch
                    val reordered = reorderSearchResultsForTaste(tracks)
                    _uiState.value = _uiState.value.copy(
                        screen = AppScreen.Search,
                        searchResults = reordered,
                        searchLoading = false,
                        message = if (reordered.isEmpty()) "No tracks found." else null,
                    )
                }
                .onFailure { error ->
                    if (error is CancellationException) return@onFailure
                    if (!isActive) return@onFailure
                    _uiState.value = _uiState.value.copy(
                        searchLoading = false,
                        message = error.message ?: "Search failed.",
                    )
                }
        }
    }

    /**
     * Subtle taste re-ranking of search results using the same affinity
     * signals as the home feed: artist familiarity, likes, and the adaptive
     * skip/completion learning. Provider relevance order is preserved for
     * everything without strong affinity.
     */
    private suspend fun reorderSearchResultsForTaste(tracks: List<Track>): List<Track> {
        if (tracks.size < 2) return tracks
        val history = libraryRepository.historySnapshot()
        if (history.isEmpty()) return tracks
        val context = mobileTasteContext(
            history = history,
            liked = libraryRepository.likedSnapshot(),
            trackPriorityFor = { key -> libraryRepository.trackPriority(key) },
        )
        return reorderMobileTracksByTaste(tracks, context)
    }

    fun play(track: Track, queue: List<Track> = listOf(track), queueIndexHint: Int? = null) {
        activeRemoteTargetId()?.let { targetDeviceId ->
            if (queueIndexHint != null) {
                playQueueIndexOnRemoteDevice(targetDeviceId, track, queueIndexHint)
            } else {
                playOnRemoteDevice(targetDeviceId, track, queue)
            }
            return
        }
        val normalizedQueue = normalizeQueue(queue, track)
        val nextIndex = resolveQueueSelectionIndex(normalizedQueue, track, queueIndexHint)
        val departure = _uiState.value.currentTrack?.let { pendingManualPlaybackDeparture() }
        playQueueIndex(normalizedQueue, nextIndex, manualDeparture = departure)
    }

    fun playNext() {
        activeRemoteTargetId()?.let { targetDeviceId ->
            // The receiver owns shuffle history, repeat boundaries, and queue
            // continuation. Its direct/cloud state acknowledgement is the
            // only truthful source for the resulting track.
            sendRemoteCommand(targetDeviceId, "next")
            return
        }
        playNextLocally()
    }

    private fun playNextLocally() {
        val state = _uiState.value
        val plan = nextQueuePlan(state, allowWrap = state.playbackQueue.isNotEmpty())
        if (plan == null) {
            _uiState.value = state.copy(message = "No next track in queue.")
            return
        }
        playQueueIndex(
            state.playbackQueue,
            plan.queueIndex,
            historyCursorTarget = plan.historyCursorTarget,
            startsNewShuffleRound = plan.startsNewShuffleRound,
            manualDeparture = pendingManualPlaybackDeparture(),
        )
    }

    fun playPrevious() {
        activeRemoteTargetId()?.let { targetDeviceId ->
            // Previous can restart the current track instead of moving the
            // queue, so never invent an optimistic remote queue position.
            sendRemoteCommand(targetDeviceId, "previous")
            return
        }
        playPreviousLocally()
    }

    private fun playPreviousLocally() {
        val state = _uiState.value
        val queue = state.playbackQueue
        if (queue.isEmpty()) {
            _uiState.value = state.copy(message = "No previous track in queue.")
            return
        }
        if (shouldRestartMobileTrackForPrevious(playerState.value.positionMs)) {
            cancelMobilePlaybackTransition()
            playerConnection.seekTo(0L)
            feedbackRecordedForCurrentPlayback = false
            return
        }
        if (playerState.value.shuffleEnabled) {
            historyTraversalIndex(queue, step = -1)?.let { (historyCursor, queueIndex) ->
                playQueueIndex(
                    queue,
                    queueIndex,
                    historyCursorTarget = historyCursor,
                    manualDeparture = pendingManualPlaybackDeparture(),
                )
                return
            }
        }
        if (playerState.value.shuffleEnabled) {
            _uiState.value = state.copy(message = "No earlier track in playback history.")
            return
        }
        val previousIndex = if (state.queueIndex > 0) {
            state.queueIndex - 1
        } else {
            queue.lastIndex
        }
        playQueueIndex(queue, previousIndex, manualDeparture = pendingManualPlaybackDeparture())
    }

    private fun playQueueIndex(
        queue: List<Track>,
        index: Int,
        historyCursorTarget: Int? = null,
        startsNewShuffleRound: Boolean = false,
        manualDeparture: PendingMobileDeparture? = null,
    ) {
        val track = queue.getOrNull(index) ?: return
        cancelMobilePlaybackTransition()
        cancelPendingLocalPlayResolution()
        _uiState.value = _uiState.value.copy(
            resolvingTrackId = track.id,
            message = null,
        )
        playJob = viewModelScope.launch {
            try {
                val playback = api.resolvePlayable(track, _uiState.value.quality)
                commitResolvedPlayback(
                    queue,
                    index,
                    playback,
                    historyCursorTarget,
                    startsNewShuffleRound,
                    manualDeparture,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                _uiState.value = _uiState.value.copy(
                    resolvingTrackId = null,
                    message = error.message ?: "No playable source is available.",
                )
            }
        }
    }

    private suspend fun commitResolvedPlayback(
        queue: List<Track>,
        index: Int,
        playback: ResolvedPlayback,
        historyCursorTarget: Int? = null,
        startsNewShuffleRound: Boolean = false,
        manualDeparture: PendingMobileDeparture? = null,
    ) {
        applyManualPlaybackDeparture(manualDeparture)
        val updatedQueue = queue.replaceAt(index, playback.track)
        if (
            playerState.value.shuffleEnabled &&
            shouldResetMobileShuffleRound(
                previousQueueKeys = _uiState.value.playbackQueue.map { it.queueKey() },
                replacementQueueKeys = queue.map { it.queueKey() },
            )
        ) {
            shuffleCycleTrackKeys.clear()
            shuffleRoundPlayCount = 0
        }
        recordPlaybackStarted(
            updatedQueue,
            playback.track,
            historyCursorTarget,
            startsNewShuffleRound,
        )
        _uiState.value = _uiState.value.copy(
            resolvingTrackId = null,
            currentTrack = playback.track,
            playbackQueue = updatedQueue,
            queueIndex = index,
            message = if (playback.usedFallback) {
                "Playing full SoundCloud source: ${playback.track.title}"
            } else {
                null
            },
        )
        playerConnection.clearError()
        val localPlayer = playerState.value
        playerConnection.play(
            playback.track,
            playback.stream.url,
            MobilePlaybackServiceContext(
                queue = updatedQueue,
                queueIndex = index,
                quality = _uiState.value.quality,
                crossfadeDurationMs = _uiState.value.crossfadeDurationMs,
                repeatMode = localPlayer.repeatMode,
                shuffleEnabled = localPlayer.shuffleEnabled,
                shuffleRoundTrackKeys = shuffleCycleTrackKeys.toList(),
                shuffleRoundPlayCount = shuffleRoundPlayCount,
                playbackHistory = playbackHistory.toList(),
                playbackHistoryCursor = playbackHistoryCursor,
            ),
        )
        libraryRepository.addToHistory(playback.track)
        scheduleHistorySync()
    }


    fun playEngineTest() {
        if (!BuildConfig.DEBUG) return
        val track = Track(
            id = "native-engine-test",
            title = "Native audio engine test",
            artist = "Spice",
            durationMs = 30_000,
        )
        _uiState.value = _uiState.value.copy(
            currentTrack = track,
            playbackQueue = listOf(track),
            queueIndex = 0,
            resolvingTrackId = null,
            message = null,
        )
        playerConnection.clearError()
        playerConnection.play(
            track,
            "android.resource://" + getApplication<Application>().packageName + "/" + R.raw.engine_test,
        )
    }
    fun togglePlayback() {
        val targetDeviceId = activeRemoteTargetId()
        if (targetDeviceId == null) {
            cancelPendingLocalPlayResolution()
            cancelMobilePlaybackTransition()
            playerConnection.toggle()
            return
        }

        val device = selectedRemoteDevice()
        if (device == null) {
            unavailableRemoteTarget()
            return
        }
        if (!device.isPlaying && device.currentTrack == null) {
            _uiState.value = _uiState.value.copy(message = "Choose a track for ${device.displayName} first.")
            return
        }

        val command = if (device.isPlaying) "pause" else "play"
        patchRemoteDevice(targetDeviceId) { it.copy(isPlaying = !device.isPlaying) }
        sendRemoteCommand(targetDeviceId, command)
    }

    fun seekTo(positionMs: Long) {
        val targetDeviceId = activeRemoteTargetId()
        if (targetDeviceId == null) {
            cancelPendingLocalPlayResolution()
            cancelMobilePlaybackTransition()
            val player = playerState.value
            if (shouldTreatMobileSeekAsSkip(player.positionMs, positionMs, player.durationMs)) {
                recordManualPlaybackDeparture()
            }
            playerConnection.seekTo(positionMs)
            return
        }

        val device = selectedRemoteDevice()
        if (device == null) {
            unavailableRemoteTarget()
            return
        }
        val safePosition = positionMs.coerceIn(0, device.durationMs.takeIf { it > 0 } ?: Long.MAX_VALUE)
        patchRemoteDevice(targetDeviceId) { it.copy(progressMs = safePosition) }
        sendRemoteCommand(
            targetDeviceId,
            "seek",
            JSONObject().put("progress", safePosition / 1000.0),
        )
    }

    fun seekBy(deltaMs: Long) {
        cancelPendingLocalPlayResolution()
        cancelMobilePlaybackTransition()
        val player = playerState.value
        val targetPositionMs = (player.positionMs + deltaMs).coerceIn(
            0L,
            player.durationMs.takeIf { it > 0L } ?: Long.MAX_VALUE,
        )
        if (shouldTreatMobileSeekAsSkip(player.positionMs, targetPositionMs, player.durationMs)) {
            recordManualPlaybackDeparture()
        }
        playerConnection.seekBy(deltaMs)
    }

    fun setRemoteVolume(volume: Int) {
        val target = selectedRemoteDevice() ?: return
        if (!target.isOnline) {
            unavailableRemoteTarget()
            return
        }
        val safeVolume = volume.coerceIn(0, 100)
        patchRemoteDevice(target.deviceId) { it.copy(volume = safeVolume) }
        remoteVolumeJob?.cancel()
        remoteVolumeJob = viewModelScope.launch {
            delay(75L)
            sendRemoteCommand(target.deviceId, "volume", JSONObject().put("volume", safeVolume))
        }
    }

    fun adjustRemoteVolume(delta: Int) {
        selectedRemoteDevice()?.let { setRemoteVolume(it.volume + delta) }
    }

    fun isControllingRemoteDevice(): Boolean = selectedRemoteDevice()?.isOnline == true

    fun toggleShuffle() {
        val targetDeviceId = activeRemoteTargetId()
        if (targetDeviceId == null) {
            val enabling = !playerState.value.shuffleEnabled
            shuffleCycleTrackKeys.clear()
            shuffleRoundPlayCount = 0
            if (enabling) {
                _uiState.value.currentTrack?.queueKey()?.let {
                    shuffleCycleTrackKeys += it
                    shuffleRoundPlayCount = 1
                }
            }
            playerConnection.toggleShuffle()
            return
        }

        val device = selectedRemoteDevice()
        if (device == null) {
            unavailableRemoteTarget()
            return
        }
        val enabled = !device.shuffleEnabled
        patchRemoteDevice(targetDeviceId) { it.copy(shuffleEnabled = enabled) }
        sendRemoteCommand(targetDeviceId, "shuffle", JSONObject().put("enabled", enabled))
    }

    fun cycleRepeat() {
        val targetDeviceId = activeRemoteTargetId()
        if (targetDeviceId == null) {
            playerConnection.cycleRepeat()
            return
        }

        val device = selectedRemoteDevice()
        if (device == null) {
            unavailableRemoteTarget()
            return
        }
        val mode = device.repeatMode.next()
        patchRemoteDevice(targetDeviceId) { it.copy(repeatMode = mode) }
        sendRemoteCommand(targetDeviceId, "repeat", JSONObject().put("mode", mode.remoteValue()))
    }

    fun setAccentTheme(theme: AccentTheme) {
        libraryRepository.setAccentTheme(theme)
        _uiState.value = _uiState.value.copy(accentTheme = theme)
    }

    fun stopPlayback() {
        cancelPendingLocalPlayResolution()
        cancelMobilePlaybackTransition()
        activeRemoteTargetId()?.let { targetDeviceId ->
            patchRemoteDevice(targetDeviceId) { it.copy(isPlaying = false) }
            sendRemoteCommand(targetDeviceId, "pause")
            return
        }
        recordManualPlaybackDeparture()
        playerConnection.stop()
        _uiState.value = _uiState.value.copy(
            currentTrack = null,
            playbackQueue = emptyList(),
            queueIndex = -1,
            resolvingTrackId = null,
        )
        playbackHistory.clear()
        playbackHistoryCursor = -1
        shuffleCycleTrackKeys.clear()
        shuffleRoundPlayCount = 0
        feedbackRecordedForCurrentPlayback = false
    }

    private fun cancelPendingLocalPlayResolution() {
        playJob?.cancel()
        playJob = null
        if (_uiState.value.resolvingTrackId != null) {
            _uiState.value = _uiState.value.copy(resolvingTrackId = null)
        }
    }

    fun approvePendingRemoteDownload() {
        val track = _uiState.value.pendingRemoteDownloadTrack ?: return
        _uiState.value = _uiState.value.copy(pendingRemoteDownloadTrack = null)
        downloadTrack(track)
    }

    fun denyPendingRemoteDownloadPermission() {
        _uiState.value = _uiState.value.copy(
            pendingRemoteDownloadTrack = null,
            message = "Storage permission is required to save downloads on Android 7-9.",
        )
    }

    fun downloadTrack(track: Track) {
        if (downloadJob?.isActive == true) {
            _uiState.value = _uiState.value.copy(message = "A download is already running.")
            return
        }

        _uiState.value = _uiState.value.copy(
            downloadTrackId = track.id,
            downloadProgress = "Preparing download...",
            message = null,
        )
        downloadJob = viewModelScope.launch {
            try {
                val download = downloadOneTrack(track)
                _uiState.value = _uiState.value.copy(
                    downloadTrackId = null,
                    downloadProgress = null,
                    libraryTab = LibraryTab.Downloads,
                    message = "Saved ${track.title} to Music/Spice as ${download.fileName}.",
                )
            } catch (cancelled: CancellationException) {
                _uiState.value = _uiState.value.copy(downloadTrackId = null, downloadProgress = null)
                throw cancelled
            } catch (error: Exception) {
                _uiState.value = _uiState.value.copy(
                    downloadTrackId = null,
                    downloadProgress = null,
                    message = error.message ?: "Download failed.",
                )
            } finally {
                activeDownloadProcessId = null
            }
        }
    }

    fun downloadPlaylist(playlist: Playlist) {
        if (downloadJob?.isActive == true) {
            _uiState.value = _uiState.value.copy(message = "A download is already running.")
            return
        }
        if (playlist.tracks.isEmpty()) return

        _uiState.value = _uiState.value.copy(
            downloadPlaylistId = playlist.id,
            downloadPlaylistCompleted = 0,
            downloadPlaylistTotal = playlist.tracks.size,
            downloadProgress = "Preparing playlist download...",
            message = null,
        )
        downloadJob = viewModelScope.launch {
            var completed = 0
            var failed = 0
            try {
                playlist.tracks.forEach { track ->
                    _uiState.value = _uiState.value.copy(
                        downloadTrackId = track.id,
                        downloadProgress = "${completed + 1}/${playlist.tracks.size}: Preparing ${track.title}",
                    )
                    try {
                        downloadOneTrack(track, "${completed + 1}/${playlist.tracks.size}")
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (error: Exception) {
                        failed += 1
                        Log.w("SpiceDownload", "Playlist track download failed: ${error.message}")
                    }
                    completed += 1
                    _uiState.value = _uiState.value.copy(downloadPlaylistCompleted = completed)
                }
                val saved = completed - failed
                _uiState.value = _uiState.value.copy(
                    downloadTrackId = null,
                    downloadProgress = null,
                    downloadPlaylistId = null,
                    downloadPlaylistCompleted = 0,
                    downloadPlaylistTotal = 0,
                    libraryTab = LibraryTab.Downloads,
                    message = if (failed == 0) {
                        "Saved all $saved playlist tracks to Music/Spice, including duplicates."
                    } else {
                        "Saved $saved of ${playlist.tracks.size} playlist tracks."
                    },
                )
            } catch (cancelled: CancellationException) {
                _uiState.value = _uiState.value.copy(
                    downloadTrackId = null,
                    downloadProgress = null,
                    downloadPlaylistId = null,
                    downloadPlaylistCompleted = 0,
                    downloadPlaylistTotal = 0,
                    message = "Playlist download cancelled after $completed tracks.",
                )
                throw cancelled
            } finally {
                activeDownloadProcessId = null
            }
        }
    }

    fun cancelDownload() {
        val processId = activeDownloadProcessId
        if (processId == null) {
            _uiState.value = _uiState.value.copy(message = "No active download to cancel.")
            return
        }

        runCatching { downloadClient.cancel(processId) }
        downloadJob?.cancel()
        activeDownloadProcessId = null
        _uiState.value = _uiState.value.copy(
            downloadTrackId = null,
            downloadProgress = null,
            downloadPlaylistId = null,
            downloadPlaylistCompleted = 0,
            downloadPlaylistTotal = 0,
            message = "Download cancelled.",
        )
    }

    fun openDownload(download: DownloadedTrack) {
        startDownloadIntent(download, Intent.ACTION_VIEW)
    }

    fun shareDownload(download: DownloadedTrack) {
        val uri = downloadUri(download)
        if (uri == null) {
            _uiState.value = _uiState.value.copy(message = "That downloaded file is missing.")
            return
        }
        val shareIntent = Intent(Intent.ACTION_SEND)
            .setType(download.mimeType)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val chooser = Intent.createChooser(shareIntent, "Share audio")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching {
            getApplication<Application>().startActivity(chooser)
        }.onFailure { error ->
            _uiState.value = _uiState.value.copy(message = error.message ?: "No app can share this download.")
        }
    }

    fun removeDownload(download: DownloadedTrack) {
        viewModelScope.launch {
            runCatching {
                libraryRepository.removeDownload(download)
            }.onSuccess {
                _uiState.value = _uiState.value.copy(message = "Removed ${download.fileName}.")
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(message = error.message ?: "Could not remove download.")
            }
        }
    }

    fun toggleLike(track: Track) {
        viewModelScope.launch {
            val liked = libraryRepository.toggleLike(track)
            val revision = (likeMutationRevisions[track.id] ?: 0L) + 1L
            likeMutationRevisions[track.id] = revision
            val session = _uiState.value.accountSession
            if (session == null) {
                syncLikeToActiveReceiver(track, liked)
                _uiState.value = _uiState.value.copy(
                    message = if (liked) "Saved ${track.title} to Liked." else "Removed ${track.title} from Liked.",
                )
                return@launch
            }

            runCatching {
                api.setTrackLiked(session.token, track, liked)
            }.onSuccess {
                when (
                    resolveLikeMutation(
                        requestRevision = revision,
                        latestRevision = likeMutationRevisions[track.id] ?: revision,
                        requestedLiked = liked,
                        currentlyLiked = libraryRepository.isLiked(track.id),
                        succeeded = true,
                    )
                ) {
                    LikeMutationResolution.Confirm -> {
                        libraryRepository.markLikeMutationSynced(track.id)
                        syncLikeToActiveReceiver(track, liked)
                        _uiState.value = _uiState.value.copy(
                            message = if (liked) "Saved ${track.title} to Liked." else "Removed ${track.title} from Liked.",
                        )
                    }
                    LikeMutationResolution.ReconcileNewerChange -> {
                        // A newer local or cross-device state won while this
                        // request was in flight. Keep it pending so cloud sync
                        // repairs any out-of-order server response.
                        libraryRepository.markLikeMutationPending(track.id)
                    }
                    LikeMutationResolution.RollBack -> Unit
                }
                if (libraryRepository.pendingLikedTrackIds().isNotEmpty()) scheduleTasteSync()
            }.onFailure { error ->
                when (
                    resolveLikeMutation(
                        requestRevision = revision,
                        latestRevision = likeMutationRevisions[track.id] ?: revision,
                        requestedLiked = liked,
                        currentlyLiked = libraryRepository.isLiked(track.id),
                        succeeded = false,
                    )
                ) {
                    LikeMutationResolution.RollBack -> {
                        libraryRepository.setLiked(track, nextLikeState(liked), markPending = false)
                        libraryRepository.markLikeMutationSynced(track.id)
                        _uiState.value = _uiState.value.copy(
                            message = error.message ?: "The Like could not be saved, so the change was restored.",
                        )
                    }
                    LikeMutationResolution.ReconcileNewerChange -> {
                        libraryRepository.markLikeMutationPending(track.id)
                        scheduleTasteSync()
                    }
                    LikeMutationResolution.Confirm -> Unit
                }
            }
        }
    }

    fun setLibraryTab(tab: LibraryTab) {
        _uiState.value = _uiState.value.copy(libraryTab = tab)
    }

    fun createPlaylist() {
        viewModelScope.launch {
            val playlist = libraryRepository.createPlaylist()
            _uiState.value = _uiState.value.copy(
                libraryTab = LibraryTab.Playlists,
                message = "Created ${playlist.title}.",
            )
        }
    }

    fun addCurrentTrackToPlaylist(playlistId: String) {
        val track = activePlayerTrack()
        if (track == null) {
            _uiState.value = _uiState.value.copy(message = "Play a track before adding it to a playlist.")
            return
        }
        addTrackToPlaylist(playlistId, track)
    }

    fun addTrackToPlaylist(playlistId: String, track: Track) {
        val playlist = _uiState.value.playlists.firstOrNull { it.id == playlistId }
        if (playlist != null && playlist.shared) {
            addCurrentTrackToSharedPlaylist(playlist, track)
            return
        }

        viewModelScope.launch {
            val added = libraryRepository.addTrackToPlaylist(playlistId, track)
            if (added) syncPlaylistAddToActiveReceiver(track, playlist)
            _uiState.value = _uiState.value.copy(
                message = if (added) {
                    "Added ${track.title} to ${playlist?.title ?: "playlist"}."
                } else {
                    "${track.title} is already in ${playlist?.title ?: "that playlist"}."
                },
            )
        }
    }

    private fun addCurrentTrackToSharedPlaylist(playlist: Playlist, track: Track) {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before editing shared playlists.")
            return
        }
        if (playlist.shareRole !in setOf("owner", "editor")) {
            _uiState.value = state.copy(message = "You need editor access to add tracks to this shared playlist.")
            return
        }
        if (playlist.tracks.any { it.queueKey() == track.queueKey() }) {
            _uiState.value = state.copy(message = "${track.title} is already in ${playlist.title}.")
            return
        }

        _uiState.value = state.copy(sharedTrackActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.addSharedPlaylistTrack(session.token, playlist.id, track)
                val refresh = refreshCloudLibrary(session)
                val activePlaylist = _uiState.value.activeMemberPlaylist
                val liveTracks = if (activePlaylist?.id == playlist.id) {
                    api.fetchSharedPlaylistTracks(session.token, playlist.id)
                } else {
                    null
                }
                SharedTrackEditResult(refresh.summary, liveTracks)
            }.onSuccess { result ->
                syncPlaylistAddToActiveReceiver(track, playlist)
                _uiState.value = _uiState.value.copy(
                    sharedPlaylistTracks = result.tracks ?: _uiState.value.sharedPlaylistTracks,
                    sharedTrackActionLoading = false,
                    lastSync = result.summary,
                    message = "Added ${track.title} to ${playlist.title}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    sharedTrackActionLoading = false,
                    message = error.message ?: "Could not add track to shared playlist.",
                )
            }
        }
    }

    fun sharePlaylist(playlist: Playlist) {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before sharing playlists.")
            return
        }
        if (state.syncLoading || state.sharingPlaylistId != null) {
            _uiState.value = state.copy(message = "Wait for the current sync to finish before sharing.")
            return
        }

        _uiState.value = state.copy(
            sharingPlaylistId = playlist.id,
            syncLoading = true,
            message = null,
        )
        viewModelScope.launch {
            runCatching {
                val refresh = refreshCloudLibrary(session)
                val cloudPlaylist = findSyncedPlaylist(playlist, refresh.playlists)
                    ?: throw IllegalStateException("Sync finished, but this playlist was not returned from the cloud.")
                if (cloudPlaylist.shared && cloudPlaylist.shareRole != "owner") {
                    throw IllegalStateException("Only the playlist owner can create share links.")
                }
                val invite = api.createPlaylistInvite(session.token, cloudPlaylist.id)
                openShareTextIntent(
                    subject = "Spice playlist: ${cloudPlaylist.title}",
                    text = "Join my Spice playlist \"${cloudPlaylist.title}\": ${invite.inviteUrl}",
                )
                SharePlaylistResult(refresh.summary, cloudPlaylist.title)
            }.onSuccess { result ->
                _uiState.value = _uiState.value.copy(
                    syncLoading = false,
                    sharingPlaylistId = null,
                    lastSync = result.summary,
                    message = "Share link ready for ${result.playlistTitle}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    syncLoading = false,
                    sharingPlaylistId = null,
                    message = error.message ?: "Could not create playlist share link.",
                )
            }
        }
    }

    fun setQuality(quality: StreamQuality) {
        libraryRepository.setQuality(quality)
        _uiState.value = _uiState.value.copy(quality = quality)
        playerConnection.updatePlaybackContextSettings(quality, _uiState.value.crossfadeDurationMs)
    }

    fun setCrossfadeDurationMs(durationMs: Long) {
        val normalized = normalizeMobileCrossfadeDurationMs(durationMs)
        libraryRepository.setCrossfadeDurationMs(normalized)
        _uiState.value = _uiState.value.copy(crossfadeDurationMs = normalized)
        playerConnection.updatePlaybackContextSettings(_uiState.value.quality, normalized)
        if (normalized == 0L) cancelMobilePlaybackTransition()
    }

    fun setSmartQueueEnabled(enabled: Boolean) {
        libraryRepository.setSmartQueueEnabled(enabled)
        _uiState.value = _uiState.value.copy(smartQueueEnabled = enabled)
    }

    fun setAuthMode(mode: AuthMode) {
        _uiState.value = _uiState.value.copy(
            authMode = mode,
            emailVerification = null,
            authVerificationCode = "",
            message = null,
        )
    }

    fun setAuthEmail(email: String) {
        _uiState.value = _uiState.value.copy(authEmail = email)
    }

    fun setAuthPassword(password: String) {
        _uiState.value = _uiState.value.copy(authPassword = password)
    }

    fun setAuthUsername(username: String) {
        _uiState.value = _uiState.value.copy(authUsername = username)
    }

    fun setAuthVerificationCode(code: String) {
        _uiState.value = _uiState.value.copy(
            authVerificationCode = code.filter(Char::isDigit).take(6),
        )
    }

    fun openProfileEditor() {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before editing your profile.")
            return
        }

        val profile = state.profileSummary?.profile
        _uiState.value = state.copy(
            profileEditOpen = true,
            profileEditDisplayName = profile?.displayName?.takeIf { it.isNotBlank() }
                ?: session.account.displayName.takeIf { it.isNotBlank() }
                ?: session.account.email.substringBefore("@"),
            profileEditUsername = profile?.username?.takeIf { it.isNotBlank() }
                ?: session.account.username,
            profileEditAvatarUrl = profile?.avatarUrl?.takeIf { it.isNotBlank() }
                ?: session.account.avatarUrl,
            profileEditBio = profile?.bio.orEmpty(),
            profileEditPrivate = profile?.isPrivate == true,
            message = null,
        )
    }

    fun dismissProfileEditor() {
        _uiState.value = _uiState.value.copy(profileEditOpen = false, profileEditLoading = false)
    }

    fun setProfileEditDisplayName(value: String) {
        _uiState.value = _uiState.value.copy(profileEditDisplayName = value)
    }

    fun setProfileEditUsername(value: String) {
        _uiState.value = _uiState.value.copy(profileEditUsername = value)
    }

    fun setProfileEditAvatarUrl(value: String) {
        _uiState.value = _uiState.value.copy(profileEditAvatarUrl = value)
    }

    fun setProfileEditBio(value: String) {
        _uiState.value = _uiState.value.copy(profileEditBio = value)
    }

    fun setProfileEditPrivate(value: Boolean) {
        _uiState.value = _uiState.value.copy(profileEditPrivate = value)
    }

    fun saveProfileEdit() {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before editing your profile.")
            return
        }

        val displayName = state.profileEditDisplayName.trim().ifEmpty { "Spice Listener" }
        val username = state.profileEditUsername.trim().lowercase()
        val avatarUrl = state.profileEditAvatarUrl.trim()
        val bio = state.profileEditBio.trim().ifEmpty { "No bio written yet." }

        if (!Regex("^[a-zA-Z0-9_]{3,20}$").matches(username)) {
            _uiState.value = state.copy(message = "Username must be 3-20 letters, numbers, or underscores.")
            return
        }

        if (avatarUrl.isNotBlank() && !avatarUrl.startsWith("https://") && !avatarUrl.startsWith("http://")) {
            _uiState.value = state.copy(message = "Profile picture must be an http or https URL.")
            return
        }

        _uiState.value = state.copy(profileEditLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                val remoteProfiles = api.fetchProfiles(session.token)
                val currentProfile = remoteProfiles.firstOrNull { it.id == "default" }
                    ?: state.profileSummary?.profile
                    ?: SpiceProfile(
                        id = "default",
                        displayName = displayName,
                        username = username,
                    )
                val updatedProfile = currentProfile.copy(
                    displayName = displayName,
                    username = username,
                    avatarUrl = avatarUrl,
                    bio = bio,
                    isPrivate = state.profileEditPrivate,
                    songsPlayed = currentProfile.songsPlayed.takeIf { it > 0 }
                        ?: state.profileSummary?.stats?.songsPlayed
                        ?: 0,
                )
                val profiles = if (remoteProfiles.any { it.id == updatedProfile.id }) {
                    remoteProfiles.map { profile -> if (profile.id == updatedProfile.id) updatedProfile else profile }
                } else {
                    remoteProfiles + updatedProfile
                }

                if (username != session.account.username) {
                    api.updateUsername(session.token, username, updatedProfile.id)
                }
                api.syncProfiles(session.token, profiles)
                api.fetchProfileSummary(session.token, session.account.id, updatedProfile.id)
            }.onSuccess { summary ->
                val updatedSession = session.copy(
                    account = session.account.copy(
                        username = summary.profile.username,
                        displayName = summary.profile.displayName,
                        avatarUrl = summary.profile.avatarUrl,
                    ),
                )
                sessionStore.save(updatedSession)
                _uiState.value = _uiState.value.copy(
                    accountSession = updatedSession,
                    profileSummary = summary,
                    profileEditOpen = false,
                    profileEditLoading = false,
                    message = "Profile updated.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    profileEditLoading = false,
                    message = error.message ?: "Could not update profile.",
                )
            }
        }
    }

    fun submitAccount() {
        val state = _uiState.value
        val email = state.authEmail.trim()
        val password = state.authPassword
        val username = state.authUsername.trim()

        if (email.isEmpty() || password.isEmpty() || (state.authMode == AuthMode.SignUp && username.isEmpty())) {
            _uiState.value = state.copy(message = "Enter the required account fields.")
            return
        }

        _uiState.value = state.copy(accountLoading = true, message = null)
        viewModelScope.launch {
            if (state.authMode == AuthMode.SignUp) {
                runCatching { api.signUp(email, password, username) }
                    .onSuccess { challenge ->
                        _uiState.value = _uiState.value.copy(
                            emailVerification = challenge,
                            authVerificationCode = "",
                            authPassword = "",
                            accountLoading = false,
                            message = "We sent a six-digit code to ${challenge.email}.",
                        )
                    }
                    .onFailure { error ->
                        _uiState.value = _uiState.value.copy(
                            accountLoading = false,
                            message = error.message ?: "Account registration failed.",
                        )
                    }
            } else {
                runCatching { api.signIn(email, password) }
                    .onSuccess(::completeAccountSignIn)
                    .onFailure { error ->
                        applyAccountBlockFromApiError(error)
                        _uiState.value = _uiState.value.copy(
                            accountLoading = false,
                            message = error.message ?: "Account sign-in failed.",
                        )
                    }
            }
        }
    }

    fun submitEmailVerification() {
        val state = _uiState.value
        val challenge = state.emailVerification ?: return
        if (state.authVerificationCode.length != 6) {
            _uiState.value = state.copy(message = "Enter the six-digit verification code.")
            return
        }
        _uiState.value = state.copy(accountLoading = true, message = null)
        viewModelScope.launch {
            runCatching { api.verifyEmail(challenge.registrationId, state.authVerificationCode) }
                .onSuccess(::completeAccountSignIn)
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        accountLoading = false,
                        message = error.message ?: "Email verification failed.",
                    )
                }
        }
    }

    fun resendEmailVerification() {
        val state = _uiState.value
        val challenge = state.emailVerification ?: return
        _uiState.value = state.copy(accountLoading = true, message = null)
        viewModelScope.launch {
            runCatching { api.resendEmailVerification(challenge.registrationId) }
                .onSuccess { refreshed ->
                    _uiState.value = _uiState.value.copy(
                        emailVerification = refreshed,
                        authVerificationCode = "",
                        accountLoading = false,
                        message = "A new verification code was sent to ${refreshed.email}.",
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        accountLoading = false,
                        message = error.message ?: "Could not resend the verification code.",
                    )
                }
        }
    }

    fun cancelEmailVerification() {
        _uiState.value = _uiState.value.copy(
            emailVerification = null,
            authVerificationCode = "",
            accountLoading = false,
            message = "Enter your account details to try again.",
        )
    }

    fun setPairingCode(code: String) {
        _uiState.value = _uiState.value.copy(
            pairingCode = normalizeSpiceConnectPairingCodeInput(code),
        )
    }

    fun claimPairingCode() {
        val submittedCode = spiceConnectPairingCodeForSubmission(_uiState.value.pairingCode)
        if (submittedCode == null) {
            _uiState.value = _uiState.value.copy(message = "Enter the eight-character pairing code.")
            return
        }

        _uiState.value = _uiState.value.copy(pairingLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.claimPairingCode(
                    code = submittedCode,
                    deviceId = remoteDeviceId,
                    displayName = "Spice Android",
                ).also(pairedCredentialStore::save)
            }.onSuccess { credential ->
                connectPreferences.edit().putBoolean(KEY_SPICE_CONNECT_ENABLED, true).apply()
                _uiState.value = _uiState.value.copy(
                    pairedDeviceCredential = credential,
                    spiceConnectEnabled = true,
                    pairingCode = "",
                    pairingLoading = false,
                    connectStatus = "This phone is securely paired for Spice Connect.",
                    message = "Pairing complete. Spice Connect is ready.",
                )
                startSpiceConnect()
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    pairingLoading = false,
                    message = error.message ?: "Could not claim the pairing code.",
                )
            }
        }
    }

    fun disconnectPairedDevice() {
        clearPairedCredential("Paired-device access was removed from this phone.")
    }

    private fun completeAccountSignIn(session: AccountSession) {
        sessionStore.save(session)
        _uiState.value = _uiState.value.copy(
            accountSession = session,
            emailVerification = null,
            authVerificationCode = "",
            accountLoading = false,
            authPassword = "",
            message = "Signed in as ${session.account.email}.",
        )
        loadProfileSummary(session)
        syncLibrary(session)
        loadPendingAccountInvites(session)
        if (shouldStartSpiceConnect()) startSpiceConnect()
    }

    fun signOut() {
        sessionStore.clear()
        autoHistorySyncJob?.cancel()
        autoTasteSyncJob?.cancel()
        connectJob?.cancel()
        connectRealtimeJob?.cancel()
        connectRefreshJob?.cancel()
        disposeSpiceConnectLanTransport()
        clearPendingSpiceConnectHandoff()
        preparedSpiceConnectHandoffs.clear()
        clearOptimisticRemoteState()
        connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
        _uiState.value = _uiState.value.copy(
            accountSession = null,
            accountBlock = null,
            profileSummary = null,
            profileLoading = false,
            authPassword = "",
            emailVerification = null,
            authVerificationCode = "",
            lastSync = null,
            pendingAccountInvites = emptyList(),
            pendingInvitePreview = null,
            activeMemberPlaylist = null,
            playlistMembers = null,
            sharedPlaylistTracks = null,
            remoteDevices = emptyList(),
            selectedPlaybackDeviceId = "",
            lanConnectedDeviceIds = emptySet(),
            connectLoading = false,
            connectStatus = "",
            message = "Signed out of Spice account.",
        )
        if (shouldStartSpiceConnect()) startSpiceConnect()
    }

    fun syncNow() {
        val session = _uiState.value.accountSession
        if (session == null) {
            _uiState.value = _uiState.value.copy(message = "Sign in before syncing.")
            return
        }
        syncLibrary(session)
        loadProfileSummary(session)
        loadPendingAccountInvites(session)
    }

    fun openPlaylistInviteFromUri(uri: Uri?) {
        val token = uri?.getQueryParameter("playlistInvite")?.trim().orEmpty()
        if (token.isNotEmpty()) {
            openPlaylistInvite(token)
        }
    }

    fun openPlaylistInvite(token: String) {
        val normalized = token.trim()
        if (normalized.isEmpty() || _uiState.value.inviteLoading) return

        _uiState.value = _uiState.value.copy(inviteLoading = true, message = null)
        viewModelScope.launch {
            runCatching { api.previewPlaylistInvite(normalized) }
                .onSuccess { preview ->
                    _uiState.value = _uiState.value.copy(
                        screen = AppScreen.Library,
                        libraryTab = LibraryTab.Playlists,
                        inviteLoading = false,
                        pendingInvitePreview = preview,
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        inviteLoading = false,
                        message = error.message ?: "Could not open playlist invite.",
                    )
                }
        }
    }

    fun dismissPlaylistInvite() {
        _uiState.value = _uiState.value.copy(pendingInvitePreview = null, inviteLoading = false)
    }

    fun acceptPlaylistInvite() {
        val state = _uiState.value
        val preview = state.pendingInvitePreview ?: return
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(
                screen = AppScreen.Settings,
                message = "Sign in before accepting playlist invites.",
            )
            return
        }

        _uiState.value = state.copy(inviteLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.acceptPlaylistInvite(session.token, preview.token)
                val refresh = refreshCloudLibrary(session)
                loadPendingAccountInvites(session, silent = true)
                refresh.summary
            }.onSuccess { summary ->
                _uiState.value = _uiState.value.copy(
                    screen = AppScreen.Library,
                    libraryTab = LibraryTab.Playlists,
                    inviteLoading = false,
                    pendingInvitePreview = null,
                    lastSync = summary,
                    message = "Added ${preview.playlist.title} to your shared playlists.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    inviteLoading = false,
                    message = error.message ?: "Could not accept playlist invite.",
                )
            }
        }
    }

    fun refreshPendingAccountInvites() {
        val session = _uiState.value.accountSession
        if (session == null) {
            _uiState.value = _uiState.value.copy(message = "Sign in before checking playlist invites.")
            return
        }
        loadPendingAccountInvites(session)
    }

    fun acceptPendingPlaylistInvite(invite: PendingPlaylistInvite) {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before accepting playlist invites.")
            return
        }

        _uiState.value = state.copy(accountInvitesLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.acceptPendingPlaylistInvite(session.token, invite.playlistId)
                val refresh = refreshCloudLibrary(session)
                val pending = api.fetchPendingPlaylistInvites(session.token)
                PendingInviteActionResult(refresh.summary, pending)
            }.onSuccess { result ->
                _uiState.value = _uiState.value.copy(
                    screen = AppScreen.Library,
                    libraryTab = LibraryTab.Playlists,
                    accountInvitesLoading = false,
                    pendingAccountInvites = result.pendingInvites,
                    lastSync = result.summary,
                    message = "Joined ${invite.playlistTitle}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    accountInvitesLoading = false,
                    message = error.message ?: "Could not accept playlist invite.",
                )
            }
        }
    }

    fun rejectPendingPlaylistInvite(invite: PendingPlaylistInvite) {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null) {
            _uiState.value = state.copy(message = "Sign in before rejecting playlist invites.")
            return
        }

        _uiState.value = state.copy(accountInvitesLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.rejectPendingPlaylistInvite(session.token, invite.playlistId)
                api.fetchPendingPlaylistInvites(session.token)
            }.onSuccess { pending ->
                _uiState.value = _uiState.value.copy(
                    accountInvitesLoading = false,
                    pendingAccountInvites = pending,
                    message = "Rejected ${invite.playlistTitle}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    accountInvitesLoading = false,
                    message = error.message ?: "Could not reject playlist invite.",
                )
            }
        }
    }

    fun openPlaylistMembers(playlist: Playlist) {
        val state = _uiState.value
        val session = state.accountSession
        if (session == null && playlist.shared) {
            _uiState.value = state.copy(message = "Sign in before managing shared playlists.")
            return
        }
        if (state.membersLoading || state.memberActionLoading) return

        _uiState.value = state.copy(
            activeMemberPlaylist = playlist,
            playlistMembers = null,
            sharedPlaylistTracks = SharedPlaylistTracks(
                playlistId = playlist.id,
                role = playlist.shareRole.ifBlank { if (playlist.shared) "viewer" else "owner" },
                tracks = playlist.tracks.mapIndexed { index, track -> SharedPlaylistTrack(index, track) },
            ),
            membersLoading = true,
            memberInviteUsername = "",
            message = null,
        )
        if (session == null) {
            _uiState.value = _uiState.value.copy(membersLoading = false)
            return
        }
        viewModelScope.launch {
            runCatching {
                val membersDeferred = async { api.fetchPlaylistMembers(session.token, playlist.id) }
                val tracksDeferred = async { api.fetchSharedPlaylistTracks(session.token, playlist.id) }
                MemberSheetResult(playlist, membersDeferred.await(), tracksDeferred.await())
            }.onSuccess { result ->
                _uiState.value = _uiState.value.copy(
                    activeMemberPlaylist = result.playlist,
                    playlistMembers = result.members,
                    sharedPlaylistTracks = result.tracks,
                    membersLoading = false,
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    membersLoading = false,
                    message = error.message ?: "Could not load playlist members.",
                )
            }
        }
    }

    fun dismissPlaylistMembers() {
        _uiState.value = _uiState.value.copy(
            activeMemberPlaylist = null,
            playlistMembers = null,
            sharedPlaylistTracks = null,
            membersLoading = false,
            memberActionLoading = false,
            sharedTrackActionLoading = false,
            memberInviteUsername = "",
        )
    }

    fun setMemberInviteUsername(username: String) {
        _uiState.value = _uiState.value.copy(memberInviteUsername = username)
    }

    fun invitePlaylistMember() {
        val state = _uiState.value
        val session = state.accountSession
        val playlist = state.activeMemberPlaylist
        val username = state.memberInviteUsername.trim()
        if (session == null || playlist == null) {
            _uiState.value = state.copy(message = "Open a signed-in playlist before inviting members.")
            return
        }
        if (username.isEmpty()) {
            _uiState.value = state.copy(message = "Enter a Spice username to invite.")
            return
        }

        _uiState.value = state.copy(memberActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.invitePlaylistMember(session.token, playlist.id, username)
                api.fetchPlaylistMembers(session.token, playlist.id)
            }.onSuccess { members ->
                _uiState.value = _uiState.value.copy(
                    playlistMembers = members,
                    memberActionLoading = false,
                    memberInviteUsername = "",
                    message = "Join request sent to @$username.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    memberActionLoading = false,
                    message = error.message ?: "Could not invite playlist member.",
                )
            }
        }
    }

    fun removePlaylistMember(userId: String) {
        val state = _uiState.value
        val session = state.accountSession
        val playlist = state.activeMemberPlaylist
        if (session == null || playlist == null) return

        _uiState.value = state.copy(memberActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.removePlaylistMember(session.token, playlist.id, userId)
                api.fetchPlaylistMembers(session.token, playlist.id)
            }.onSuccess { members ->
                _uiState.value = _uiState.value.copy(
                    playlistMembers = members,
                    memberActionLoading = false,
                    message = "Member removed.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    memberActionLoading = false,
                    message = error.message ?: "Could not remove playlist member.",
                )
            }
        }
    }

    fun removeSharedPlaylistTrack(track: SharedPlaylistTrack) {
        val state = _uiState.value
        val session = state.accountSession
        val playlist = state.activeMemberPlaylist
        if (session == null || playlist == null) return

        _uiState.value = state.copy(sharedTrackActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.removeSharedPlaylistTrack(session.token, playlist.id, track.position)
                val refresh = refreshCloudLibrary(session)
                val liveTracks = api.fetchSharedPlaylistTracks(session.token, playlist.id)
                SharedTrackEditResult(refresh.summary, liveTracks)
            }.onSuccess { result ->
                _uiState.value = _uiState.value.copy(
                    sharedPlaylistTracks = result.tracks,
                    sharedTrackActionLoading = false,
                    lastSync = result.summary,
                    message = "Removed ${track.track.title} from ${playlist.title}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    sharedTrackActionLoading = false,
                    message = error.message ?: "Could not remove track from shared playlist.",
                )
            }
        }
    }

    fun refreshActiveSharedPlaylistTracks() {
        val state = _uiState.value
        val session = state.accountSession
        val playlist = state.activeMemberPlaylist
        if (session == null || playlist == null) return

        _uiState.value = state.copy(sharedTrackActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching { api.fetchSharedPlaylistTracks(session.token, playlist.id) }
                .onSuccess { tracks ->
                    _uiState.value = _uiState.value.copy(
                        sharedPlaylistTracks = tracks,
                        sharedTrackActionLoading = false,
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        sharedTrackActionLoading = false,
                        message = error.message ?: "Could not refresh shared playlist tracks.",
                    )
                }
        }
    }

    fun leaveActiveSharedPlaylist() {
        val state = _uiState.value
        val session = state.accountSession
        val playlist = state.activeMemberPlaylist
        if (session == null || playlist == null) return

        _uiState.value = state.copy(memberActionLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                api.removePlaylistMember(session.token, playlist.id)
                val refresh = refreshCloudLibrary(session)
                refresh.summary
            }.onSuccess { summary ->
                _uiState.value = _uiState.value.copy(
                    activeMemberPlaylist = null,
                    playlistMembers = null,
                    sharedPlaylistTracks = null,
                    memberActionLoading = false,
                    lastSync = summary,
                    message = "Left ${playlist.title}.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    memberActionLoading = false,
                    message = error.message ?: "Could not leave shared playlist.",
                )
            }
        }
    }

    fun clearMessage() {
        _uiState.value = _uiState.value.copy(message = null)
        playerConnection.clearError()
    }

    fun retryHome() = loadHome()

    private fun observePlaybackTransitions() {
        viewModelScope.launch {
            playerConnection.state.collect { player ->
                val restored = restoreLocalPlaybackContextIfNeeded(player)
                if (!restored) updateObservedShuffleState(player)
                evaluateMobilePlaybackTransition(player)
                broadcastSpiceConnectLanStateIfChanged()
            }
        }
    }

    private fun restoreLocalPlaybackContextIfNeeded(player: PlayerUiState): Boolean {
        if (!player.connected || player.mediaId.isBlank()) return false
        if (crossfadeInProgress || preparedTransition != null) return false
        val state = _uiState.value
        if (state.currentTrack?.id == player.mediaId && state.playbackQueue.isNotEmpty()) return false
        val context = playerConnection.restoredPlaybackContext(player.mediaId) ?: return false
        val currentTrack = context.queue.getOrNull(context.queueIndex) ?: return false
        val queueKeys = context.queue.mapTo(hashSetOf()) { it.queueKey() }
        val (restoredHistory, restoredHistoryCursor) = normalizeMobilePlaybackHistoryForQueue(
            history = context.playbackHistory,
            cursor = context.playbackHistoryCursor,
            availableTrackKeys = queueKeys,
        )
        playbackHistory.clear()
        playbackHistory += restoredHistory
        playbackHistoryCursor = restoredHistoryCursor
        shuffleCycleTrackKeys.clear()
        shuffleCycleTrackKeys += context.shuffleRoundTrackKeys.filter { it in queueKeys }
        shuffleRoundPlayCount = context.shuffleRoundPlayCount.coerceIn(0, context.queue.size)
        feedbackRecordedForCurrentPlayback = false
        lastObservedShuffleEnabled = context.shuffleEnabled
        _uiState.value = state.copy(
            currentTrack = currentTrack,
            playbackQueue = context.queue,
            queueIndex = context.queueIndex,
            resolvingTrackId = null,
            quality = context.quality,
            crossfadeDurationMs = context.crossfadeDurationMs,
            message = null,
        )
        return true
    }

    private fun evaluateMobilePlaybackTransition(player: PlayerUiState) {
        val state = _uiState.value
        val current = state.currentTrack
        val outgoingKey = current?.queueKey().orEmpty()
        val durationMs = player.durationMs
        val configuredDurationMs = state.crossfadeDurationMs

        if (
            activeRemoteTargetId() != null ||
            !player.isPlaying ||
            current == null ||
            configuredDurationMs <= 0L ||
            player.repeatMode == RepeatMode.One ||
            !player.localCrossfadeSupported ||
            crossfadeInProgress ||
            crossfadeBypassOutgoingKey == outgoingKey
        ) {
            if (preparedTransition?.outgoingTrackKey != outgoingKey) {
                transitionPreparationJob?.cancel()
                transitionPreparationJob = null
                preparedTransition = null
            }
            return
        }

        val prepared = preparedTransition
        if (
            prepared != null &&
            (
                prepared.outgoingTrackKey != outgoingKey ||
                    state.playbackQueue.getOrNull(prepared.nextIndex)?.queueKey() != prepared.nextTrackKey
                )
        ) {
            preparedTransition = null
        }

        if (
            preparedTransition == null &&
            transitionPreparationJob?.isActive != true &&
            shouldPrepareMobileTransition(
                positionMs = player.positionMs,
                durationMs = durationMs,
                crossfadeDurationMs = configuredDurationMs,
                hasNextTrack = true,
            )
        ) {
            val nextPlan = nextQueuePlan(
                state = state,
                allowWrap = player.repeatMode == RepeatMode.All,
            ) ?: return
            val nextIndex = nextPlan.queueIndex
            val nextTrack = state.playbackQueue.getOrNull(nextIndex) ?: return
            val queueSnapshot = state.playbackQueue
            transitionPreparationJob = viewModelScope.launch {
                runCatching { api.resolvePlayable(nextTrack, _uiState.value.quality) }
                    .onSuccess { playback ->
                        val latest = _uiState.value
                        if (
                            latest.currentTrack?.queueKey() == outgoingKey &&
                            latest.playbackQueue.getOrNull(nextIndex)?.queueKey() == nextTrack.queueKey()
                        ) {
                            playerConnection.prepareCrossfade(
                                trackKey = playback.track.queueKey(),
                                track = playback.track,
                                streamUrl = playback.stream.url,
                                queueIndex = nextIndex,
                                crossfadeDurationMs = configuredDurationMs,
                                startsNewShuffleRound = nextPlan.startsNewShuffleRound,
                                countsAsShuffleDraw = nextPlan.historyCursorTarget == null,
                                historyCursorTarget = nextPlan.historyCursorTarget,
                            ) { ready ->
                                val currentState = _uiState.value
                                if (
                                    ready &&
                                    currentState.currentTrack?.queueKey() == outgoingKey &&
                                    currentState.playbackQueue.getOrNull(nextIndex)?.queueKey() == nextTrack.queueKey()
                                ) {
                                    preparedTransition = PreparedMobileTransition(
                                        outgoingTrackKey = outgoingKey,
                                        nextTrackKey = nextTrack.queueKey(),
                                        queue = queueSnapshot,
                                        nextIndex = nextIndex,
                                        historyCursorTarget = nextPlan.historyCursorTarget,
                                        startsNewShuffleRound = nextPlan.startsNewShuffleRound,
                                        playback = playback,
                                    )
                                } else if (!ready) {
                                    crossfadeBypassOutgoingKey = outgoingKey
                                }
                            }
                        }
                    }
                transitionPreparationJob = null
            }
        }

        val ready = preparedTransition ?: return
        if (
            !crossfadeInProgress &&
            shouldStartMobileTransition(
                positionMs = player.positionMs,
                durationMs = durationMs,
                crossfadeDurationMs = configuredDurationMs,
                prepared = true,
            )
        ) {
            val effectiveDurationMs = effectiveMobileCrossfadeDurationMs(
                configuredDurationMs = configuredDurationMs,
                outgoingRemainingMs = durationMs - player.positionMs,
            )
            if (effectiveDurationMs == null) {
                crossfadeBypassOutgoingKey = outgoingKey
                preparedTransition = null
                playerConnection.cancelPreparedCrossfade()
            } else {
                startMobilePlaybackTransition(ready, effectiveDurationMs)
            }
        }
    }

    private fun startMobilePlaybackTransition(
        prepared: PreparedMobileTransition,
        durationMs: Long,
    ) {
        transitionPreparationJob?.cancel()
        transitionPreparationJob = null
        crossfadeInProgress = true
        playerConnection.startPreparedCrossfade(durationMs) { started ->
            if (!started) {
                crossfadeBypassOutgoingKey = prepared.outgoingTrackKey
                crossfadeInProgress = false
                preparedTransition = null
                playerConnection.cancelPreparedCrossfade()
            }
        }
    }

    private fun cancelMobilePlaybackTransition() {
        transitionPreparationJob?.cancel()
        transitionPreparationJob = null
        playerConnection.cancelPreparedCrossfade()
        crossfadeInProgress = false
        preparedTransition = null
    }

    private fun handleCrossfadeCompleted(trackKey: String) {
        val transition = preparedTransition
        val state = _uiState.value
        if (transition == null || transition.playback.track.queueKey() != trackKey) {
            crossfadeInProgress = false
            preparedTransition = null
            return
        }
        recordCompletedPlayback(transition.outgoingTrackKey)
        val updatedQueue = transition.queue.replaceAt(transition.nextIndex, transition.playback.track)
        _uiState.value = state.copy(
            resolvingTrackId = null,
            currentTrack = transition.playback.track,
            playbackQueue = updatedQueue,
            queueIndex = transition.nextIndex,
            message = if (transition.playback.usedFallback) {
                "Playing full SoundCloud source: ${transition.playback.track.title}"
            } else {
                null
            },
        )
        recordPlaybackStarted(
            updatedQueue,
            transition.playback.track,
            transition.historyCursorTarget,
            transition.startsNewShuffleRound,
        )
        preparedTransition = null
        crossfadeInProgress = false
        viewModelScope.launch {
            libraryRepository.addToHistory(transition.playback.track)
            scheduleHistorySync()
        }
    }

    private fun handleCrossfadeFailed(trackKey: String) {
        val transition = preparedTransition
        if (transition != null && transition.playback.track.queueKey() == trackKey) {
            crossfadeBypassOutgoingKey = transition.outgoingTrackKey
        }
        preparedTransition = null
        crossfadeInProgress = false
    }

    private fun updateObservedShuffleState(player: PlayerUiState) {
        if (player.shuffleEnabled != lastObservedShuffleEnabled) {
            shuffleCycleTrackKeys.clear()
            shuffleRoundPlayCount = 0
            if (player.shuffleEnabled) {
                _uiState.value.currentTrack?.queueKey()?.let {
                    shuffleCycleTrackKeys += it
                    shuffleRoundPlayCount = 1
                }
            }
            lastObservedShuffleEnabled = player.shuffleEnabled
        }
    }

    private fun handleTrackRepeated() {
        recordCompletedPlayback()
        feedbackRecordedForCurrentPlayback = false
    }

    private fun recordManualPlaybackDeparture() {
        applyManualPlaybackDeparture(pendingManualPlaybackDeparture())
    }

    private fun pendingManualPlaybackDeparture(): PendingMobileDeparture? {
        val state = _uiState.value
        val track = state.currentTrack ?: return null
        if (feedbackRecordedForCurrentPlayback) return null
        val player = playerState.value
        if (player.mediaId.isNotBlank() && player.mediaId != track.id) return null
        return PendingMobileDeparture(
            trackKey = track.queueKey(),
            feedback = mobileTrackFeedbackForManualDeparture(player.positionMs, player.durationMs),
        )
    }

    private fun applyManualPlaybackDeparture(departure: PendingMobileDeparture?) {
        if (departure == null || feedbackRecordedForCurrentPlayback) return
        libraryRepository.recordTrackFeedback(departure.trackKey, departure.feedback)
        feedbackRecordedForCurrentPlayback = true
        scheduleAdaptiveTasteSync()
    }

    private fun recordCompletedPlayback(trackKeyOverride: String? = null) {
        val trackKey = trackKeyOverride ?: _uiState.value.currentTrack?.queueKey() ?: return
        if (feedbackRecordedForCurrentPlayback) return
        libraryRepository.recordTrackFeedback(trackKey, MobileTrackFeedback.Completed)
        feedbackRecordedForCurrentPlayback = true
        scheduleAdaptiveTasteSync()
    }

    // Adaptive priority cloud sync: pushes the local skip/completion learning
    // (debounced) and adopts newer cloud copies during account sync so taste
    // follows the listener across desktop and phone.
    private fun scheduleAdaptiveTasteSync() {
        val session = _uiState.value.accountSession ?: return
        adaptiveTasteSyncJob?.cancel()
        adaptiveTasteSyncJob = viewModelScope.launch {
            delay(AUTO_TASTE_SYNC_DEBOUNCE_MS)
            runCatching {
                val states = JSONArray().put(
                    JSONObject()
                        .put("kind", "adaptive")
                        .put("payload", libraryRepository.trackPriorityPayload())
                        .put("updatedAt", System.currentTimeMillis()),
                )
                api.pushTasteStates(session.token, states)
                libraryRepository.markTasteSyncedAt(System.currentTimeMillis())
            }
        }
    }

    private suspend fun pullAdaptiveTaste(session: AccountSession) {
        runCatching {
            val payload = api.fetchTasteStates(session.token)
            val adaptive = payload.optJSONObject("states")?.optJSONObject("adaptive") ?: return
            val updatedAt = adaptive.optLong("updatedAt", 0L)
            if (updatedAt <= libraryRepository.tasteSyncedAt()) return
            libraryRepository.replaceTrackPriorities(adaptive.optString("payload", "[]"))
            libraryRepository.markTasteSyncedAt(updatedAt)
        }
    }

    private fun recordPlaybackStarted(
        queue: List<Track>,
        track: Track,
        historyCursorTarget: Int? = null,
        startsNewShuffleRound: Boolean = false,
    ) {
        val queueKeys = queue.mapTo(hashSetOf()) { it.queueKey() }
        if (playbackHistory.any { it !in queueKeys }) {
            playbackHistory.clear()
            playbackHistoryCursor = -1
        }
        if (historyCursorTarget != null && historyCursorTarget in playbackHistory.indices) {
            playbackHistoryCursor = historyCursorTarget
            playbackHistory[historyCursorTarget] = track.queueKey()
        } else {
            while (playbackHistory.lastIndex > playbackHistoryCursor) {
                playbackHistory.removeAt(playbackHistory.lastIndex)
            }
            if (playbackHistory.lastOrNull() != track.queueKey()) playbackHistory += track.queueKey()
            playbackHistoryCursor = playbackHistory.lastIndex
        }
        if (playerState.value.shuffleEnabled) {
            if (startsNewShuffleRound) {
                shuffleCycleTrackKeys.clear()
                shuffleRoundPlayCount = 0
            }
            if (historyCursorTarget == null) {
                shuffleCycleTrackKeys += track.queueKey()
                shuffleRoundPlayCount = (shuffleRoundPlayCount + 1).coerceAtMost(queue.size)
            }
        }
        if (playbackHistory.size > MAX_PLAYBACK_HISTORY_ENTRIES) {
            val removeCount = playbackHistory.size - MAX_PLAYBACK_HISTORY_ENTRIES
            repeat(removeCount) { playbackHistory.removeAt(0) }
            playbackHistoryCursor = (playbackHistoryCursor - removeCount).coerceAtLeast(0)
        }
        feedbackRecordedForCurrentPlayback = false
        crossfadeBypassOutgoingKey = ""
    }

    private fun historyTraversalIndex(queue: List<Track>, step: Int): Pair<Int, Int>? {
        val target = mobilePlaybackHistoryTarget(
            history = playbackHistory,
            cursor = playbackHistoryCursor,
            step = step,
            availableTrackKeys = queue.mapTo(hashSetOf()) { it.queueKey() },
        ) ?: return null
        return target.first to queue.indexOfFirst { it.queueKey() == target.second }
    }

    private fun handlePlaybackEnded(endedMediaId: String) {
        viewModelScope.launch {
            if (crossfadeInProgress || preparedTransition != null) return@launch
            val state = _uiState.value
            if (endedMediaId.isBlank() || state.currentTrack?.id != endedMediaId) return@launch
            recordCompletedPlayback()
            val nextPlan = nextQueuePlan(
                state = state,
                allowWrap = playerState.value.repeatMode == RepeatMode.All,
            )
            if (nextPlan == null) {
                if (state.smartQueueEnabled) {
                    val continuation = mobileSmartQueueCandidates(
                        sections = state.homeSections,
                        currentQueue = state.playbackQueue,
                    )
                    if (continuation.isNotEmpty()) {
                        val continuedQueue = state.playbackQueue + continuation
                        playQueueIndex(continuedQueue, state.playbackQueue.size)
                        return@launch
                    }
                }
                _uiState.value = state.copy(message = "Queue finished.")
                return@launch
            }
            playQueueIndex(
                state.playbackQueue,
                nextPlan.queueIndex,
                historyCursorTarget = nextPlan.historyCursorTarget,
                startsNewShuffleRound = nextPlan.startsNewShuffleRound,
            )
        }
    }

    fun loadCurrentLyrics() {
        val track = activePlayerTrack()
        if (track == null) {
            _uiState.value = _uiState.value.copy(message = "Play a track before opening lyrics.")
            return
        }
        _uiState.value = _uiState.value.copy(
            lyricsTrackId = track.id,
            lyricsPayload = null,
            lyricsLoading = true,
            message = null,
        )
        lyricsJob?.cancel()
        lyricsJob = viewModelScope.launch {
            runCatching { api.fetchLyrics(track) }
                .onSuccess { lyrics ->
                    if (_uiState.value.lyricsTrackId != track.id) return@onSuccess
                    _uiState.value = _uiState.value.copy(
                        lyricsPayload = lyrics,
                        lyricsLoading = false,
                        message = if (lyrics.plainLyrics.isBlank() && lyrics.syncedLyrics.isBlank()) {
                            "No lyrics found for ${track.title}."
                        } else {
                            null
                        },
                    )
                }
                .onFailure { error ->
                    if (error is CancellationException || _uiState.value.lyricsTrackId != track.id) return@onFailure
                    _uiState.value = _uiState.value.copy(
                        lyricsLoading = false,
                        message = error.message ?: "Could not load lyrics.",
                    )
                }
        }
    }

    fun dismissLyrics() {
        lyricsJob?.cancel()
        lyricsJob = null
        _uiState.value = _uiState.value.copy(lyricsTrackId = null, lyricsPayload = null, lyricsLoading = false)
    }

    fun selectPlaybackDevice(deviceId: String?) {
        val normalized = deviceId
            ?.trim()
            ?.takeUnless { it == remoteDeviceId }
            .orEmpty()
        val previousDeviceId = _uiState.value.selectedPlaybackDeviceId
        if (normalized.isNotEmpty() && !hasRemoteAccess()) {
            _uiState.value = _uiState.value.copy(message = "Sign in or pair this phone to use Spice Connect.")
            return
        }

        if (normalized.isEmpty()) {
            clearOptimisticRemoteState()
            connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
            _uiState.value = _uiState.value.copy(
                selectedPlaybackDeviceId = "",
                connectStatus = "Player controls now target this phone.",
            )
            if (previousDeviceId.isNotEmpty()) {
                sendRemoteCommand(
                    deviceId = previousDeviceId,
                    command = "connect",
                    payload = JSONObject().put("connected", false),
                )
            }
            return
        }

        val target = _uiState.value.remoteDevices.firstOrNull { it.deviceId == normalized }
        if (target == null) {
            _uiState.value = _uiState.value.copy(message = "That Spice Connect device is no longer available.")
            refreshSpiceConnect()
            return
        }

        clearOptimisticRemoteState()
        connectPreferences.edit().putString(KEY_SELECTED_PLAYBACK_DEVICE_ID, normalized).apply()
        _uiState.value = _uiState.value.copy(
            selectedPlaybackDeviceId = normalized,
            connectStatus = "Player controls now target ${target.displayName}.",
        )
        if (previousDeviceId.isNotEmpty() && previousDeviceId != normalized) {
            sendRemoteCommand(
                deviceId = previousDeviceId,
                command = "connect",
                payload = JSONObject().put("connected", false),
            )
        }
        if (previousDeviceId != normalized) {
            sendRemoteCommand(
                deviceId = normalized,
                command = "connect",
                payload = JSONObject().put("connected", true),
            )
        }
        if (target.isOnline && _uiState.value.currentTrack != null) {
            handoffPlaybackToSelectedDevice()
        }
    }

    fun forgetSpiceConnectDevice(deviceId: String) {
        if (deviceId.isBlank() || deviceId == remoteDeviceId) return
        val stateBeforeForget = _uiState.value
        val removedDevice = stateBeforeForget.remoteDevices.firstOrNull { it.deviceId == deviceId } ?: return
        val wasSelected = stateBeforeForget.selectedPlaybackDeviceId == deviceId
        spiceConnectLanTransport?.disconnect(deviceId)
        optimisticallyForgottenRemoteDeviceIds += deviceId
        if (wasSelected) {
            clearOptimisticRemoteState(deviceId)
            connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
        }
        _uiState.value = stateBeforeForget.copy(
            remoteDevices = stateBeforeForget.remoteDevices.filterNot { it.deviceId == deviceId },
            selectedPlaybackDeviceId = stateBeforeForget.selectedPlaybackDeviceId.takeUnless { wasSelected }.orEmpty(),
            connectStatus = "Removing ${removedDevice.displayName} everywhere and revoking its access...",
        )
        viewModelScope.launch {
            runCatching {
                withRemoteAccess { token -> api.forgetRemoteDevice(token, remoteDeviceId, deviceId) }
            }.onSuccess {
                _uiState.value = _uiState.value.copy(
                    remoteDevices = _uiState.value.remoteDevices.filterNot { it.deviceId == deviceId },
                    connectStatus = "Removed the device everywhere and revoked its Spice Connect access.",
                )
                refreshSpiceConnect()
            }.onFailure { error ->
                optimisticallyForgottenRemoteDeviceIds -= deviceId
                val current = _uiState.value
                val restoredDevices = if (current.remoteDevices.any { it.deviceId == deviceId }) {
                    current.remoteDevices
                } else {
                    (current.remoteDevices + removedDevice).sortedByDescending { it.updatedAt }
                }
                if (wasSelected) {
                    connectPreferences.edit().putString(KEY_SELECTED_PLAYBACK_DEVICE_ID, deviceId).apply()
                }
                _uiState.value = current.copy(
                    remoteDevices = restoredDevices,
                    selectedPlaybackDeviceId = if (wasSelected) deviceId else current.selectedPlaybackDeviceId,
                    connectStatus = "The device could not be removed, so it was restored.",
                    message = error.message ?: "Could not forget that device.",
                )
            }
        }
    }

    fun handoffPlaybackToSelectedDevice() {
        val state = _uiState.value
        val target = selectedRemoteDevice()
        val track = state.currentTrack
        if (target == null || !target.isOnline || track == null) {
            _uiState.value = state.copy(message = "Play something on this phone, then choose another online device.")
            return
        }

        pendingSpiceConnectHandoff?.let { pending ->
            if (pending.phase == SpiceConnectHandoffPhase.WaitingForComplete) {
                _uiState.value = state.copy(
                    message = "${pending.targetName} already accepted a transfer. Wait for its playback confirmation.",
                )
                return
            }
            clearPendingSpiceConnectHandoff()
            sendRemoteCommand(
                deviceId = pending.targetDeviceId,
                command = "handoff_cancel",
                payload = JSONObject()
                    .put("transferId", pending.transferId)
                    .put("reason", "superseded"),
                quiet = true,
            )
        }

        val transferId = normalizeSpiceConnectTransferId(
            "$remoteDeviceId:${target.deviceId}:${System.currentTimeMillis().toString(36)}:${UUID.randomUUID()}",
        )
        val pending = beginSpiceConnectHandoff(
            transferId = transferId,
            targetDeviceId = target.deviceId,
            targetName = target.displayName,
            sourceWasPlaying = playerState.value.let { it.isPlaying || it.isBuffering },
        )
        pendingSpiceConnectHandoff = pending
        handoffAcceptTimeoutJob = viewModelScope.launch {
            delay(SPICE_CONNECT_HANDOFF_ACCEPT_TIMEOUT_MS)
            if (pendingSpiceConnectHandoff != pending) return@launch
            clearPendingSpiceConnectHandoff()
            sendRemoteCommand(
                deviceId = target.deviceId,
                command = "handoff_cancel",
                payload = JSONObject()
                    .put("transferId", transferId)
                    .put("reason", "ready_timeout"),
                quiet = true,
            )
            _uiState.value = _uiState.value.copy(
                connectStatus = "${target.displayName} did not accept the transfer in time. Playback stayed on this phone.",
                message = "${target.displayName} did not accept the transfer. Playback stayed here.",
            )
        }

        _uiState.value = state.copy(
            connectStatus = "Waiting for ${target.displayName} to accept the playback transfer...",
        )
        sendRemoteCommand(
            deviceId = target.deviceId,
            command = "handoff_prepare",
            payload = JSONObject().put("transferId", transferId),
            onSuccess = {
                if (pendingSpiceConnectHandoff == pending) {
                    _uiState.value = _uiState.value.copy(
                        connectStatus = "Waiting for ${target.displayName} to accept the playback transfer...",
                    )
                }
            },
            onFailure = {
                if (pendingSpiceConnectHandoff == pending) {
                    clearPendingSpiceConnectHandoff()
                    _uiState.value = _uiState.value.copy(
                        connectStatus = "Could not ask ${target.displayName} to accept playback. Playback stayed here.",
                    )
                }
            },
            quiet = true,
        )
    }

    private fun clearPendingSpiceConnectHandoff() {
        handoffAcceptTimeoutJob?.cancel()
        handoffAcceptTimeoutJob = null
        handoffCompleteTimeoutJob?.cancel()
        handoffCompleteTimeoutJob = null
        pendingSpiceConnectHandoff = null
    }

    fun refreshSpiceConnect() {
        if (!hasRemoteAccess()) {
            _uiState.value = _uiState.value.copy(message = "Sign in or pair this phone to use Spice Connect.")
            return
        }
        _uiState.value = _uiState.value.copy(connectLoading = true, connectStatus = "")
        viewModelScope.launch {
            runCatching {
                withRemoteAccess { token ->
                    publishSpiceConnectDevice(token)
                    api.fetchRemoteDevices(token)
                }
            }.onSuccess { devices ->
                applyRemoteDeviceSnapshot(
                    devices = devices,
                    loading = false,
                    status = "${devices.count { it.deviceId != remoteDeviceId }} other device(s) visible.",
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    connectLoading = false,
                    connectStatus = error.message ?: "Could not refresh Spice Connect.",
                    message = error.message ?: "Could not refresh Spice Connect.",
                )
            }
        }
    }

    fun setSpiceConnectEnabled(enabled: Boolean) {
        connectPreferences.edit().putBoolean(KEY_SPICE_CONNECT_ENABLED, enabled).apply()
        _uiState.value = _uiState.value.copy(
            spiceConnectEnabled = enabled,
            connectStatus = if (enabled) {
                "Spice Connect enabled on this phone."
            } else {
                "Spice Connect disabled on this phone."
            },
        )
        if (enabled) {
            if (hasRemoteAccess()) startSpiceConnect()
            return
        }

        connectJob?.cancel()
        connectRealtimeJob?.cancel()
        connectRefreshJob?.cancel()
        disposeSpiceConnectLanTransport()
        connectJob = null
        connectRealtimeJob = null
        connectRefreshJob = null
        connectRealtimeAvailable.set(false)
        clearPendingSpiceConnectHandoff()
        preparedSpiceConnectHandoffs.clear()
        clearOptimisticRemoteState()
        connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
        _uiState.value = _uiState.value.copy(
            remoteDevices = emptyList(),
            selectedPlaybackDeviceId = "",
            lanConnectedDeviceIds = emptySet(),
            incomingRemoteControllerDeviceId = "",
            connectLoading = false,
        )
    }

    private fun sendRemoteCommand(
        deviceId: String,
        command: String,
        payload: JSONObject = JSONObject(),
        onSuccess: () -> Unit = {},
        onFailure: (Throwable) -> Unit = {},
        quiet: Boolean = false,
    ) {
        if (!hasRemoteAccess()) {
            onFailure(IllegalStateException("Sign in or pair this phone to use Spice Connect."))
            _uiState.value = _uiState.value.copy(message = "Sign in or pair this phone to use Spice Connect.")
            return
        }
        if (deviceId == remoteDeviceId) {
            onFailure(IllegalArgumentException("Choose another Spice Connect device."))
            _uiState.value = _uiState.value.copy(connectStatus = "Choose another Spice Connect device.")
            return
        }
        val target = _uiState.value.remoteDevices.firstOrNull { it.deviceId == deviceId }
        if (target?.isOnline == false && deviceId !in _uiState.value.lanConnectedDeviceIds) {
            onFailure(IllegalStateException("${target.displayName} is offline."))
            _uiState.value = _uiState.value.copy(message = "${target.displayName} is offline.")
            return
        }
        viewModelScope.launch {
            if (
                command != SPICE_CONNECT_LAN_SIGNAL_COMMAND &&
                spiceConnectLanTransport?.sendCommand(deviceId, command, payload) == true
            ) {
                onSuccess()
                if (!quiet) {
                    _uiState.value = _uiState.value.copy(
                        connectStatus = if (command == "handoff") {
                            _uiState.value.connectStatus
                        } else {
                            "Sent $command directly over the same network."
                        },
                    )
                }
                Log.i(SPICE_CONNECT_LOG_TAG, "Delivered $command over LAN from $remoteDeviceId to $deviceId")
                return@launch
            }
            runCatching {
                withRemoteAccess { token ->
                    api.sendRemoteCommand(
                        token = token,
                        targetDeviceId = deviceId,
                        sourceDeviceId = remoteDeviceId,
                        command = command,
                        payload = payload,
                    )
                }
            }.onSuccess {
                onSuccess()
                if (!quiet) {
                    _uiState.value = _uiState.value.copy(
                        connectStatus = if (command == "handoff") {
                            _uiState.value.connectStatus
                        } else {
                            "Sent $command through Spice Connect cloud fallback."
                        },
                    )
                }
                Log.i(SPICE_CONNECT_LOG_TAG, "Queued $command from $remoteDeviceId to $deviceId")
                scheduleRemoteDeviceRefresh()
            }.onFailure { error ->
                onFailure(error)
                clearOptimisticRemoteState(deviceId)
                if (!quiet) {
                    _uiState.value = _uiState.value.copy(
                        connectStatus = error.message ?: "Spice Connect command failed.",
                        message = error.message ?: "Spice Connect command failed.",
                    )
                }
                Log.e(SPICE_CONNECT_LOG_TAG, "Failed to send $command from $remoteDeviceId to $deviceId", error)
                refreshSpiceConnect()
            }
        }
    }

    private fun scheduleRemoteDeviceRefresh() {
        connectRefreshJob?.cancel()
        connectRefreshJob = viewModelScope.launch {
            delay(SPICE_CONNECT_COMMAND_STATE_SETTLE_MS)
            runCatching {
                withRemoteAccess { token -> api.fetchRemoteDevices(token) }
            }.onSuccess { devices -> applyRemoteDeviceSnapshot(devices) }
        }
    }

    private fun playOnRemoteDevice(targetDeviceId: String, track: Track, queue: List<Track>) {
        val target = _uiState.value.remoteDevices.firstOrNull { it.deviceId == targetDeviceId }
        if (target == null || !target.isOnline) {
            unavailableRemoteTarget()
            return
        }

        val normalizedQueue = normalizeQueue(queue, track)
        val queueIndex = normalizedQueue.indexOfFirst { it.queueKey() == track.queueKey() }
            .takeIf { it >= 0 }
            ?: 0
        patchRemoteDevice(targetDeviceId) {
            it.copy(
                currentTrack = track,
                queue = normalizedQueue,
                queueIndex = queueIndex,
                isPlaying = true,
                progressMs = 0,
                durationMs = track.durationMs,
            )
        }
        sendRemoteCommand(
            targetDeviceId,
            "play_track",
            JSONObject()
                .put("track", track.toRemoteTrackJson())
                .put("queue", JSONArray(normalizedQueue.map { it.toRemoteTrackJson() }))
                .put("queueIndex", queueIndex),
        )
        _uiState.value = _uiState.value.copy(connectStatus = "Sent ${track.title} to ${target.displayName}.")
    }

    private fun playQueueIndexOnRemoteDevice(targetDeviceId: String, track: Track, queueIndex: Int) {
        val target = _uiState.value.remoteDevices.firstOrNull { it.deviceId == targetDeviceId }
        if (target == null || !target.isOnline || queueIndex !in target.queue.indices) {
            unavailableRemoteTarget()
            return
        }
        patchRemoteDevice(targetDeviceId) {
            it.copy(
                currentTrack = track,
                queueIndex = queueIndex,
                isPlaying = true,
                progressMs = 0,
                durationMs = track.durationMs,
            )
        }
        sendRemoteCommand(
            targetDeviceId,
            "play_queue_index",
            JSONObject().put("queueIndex", queueIndex),
        )
        _uiState.value = _uiState.value.copy(connectStatus = "Selected ${track.title} on ${target.displayName}.")
    }

    private fun patchRemoteDevice(deviceId: String, transform: (RemoteDevice) -> RemoteDevice) {
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        optimisticRemoteDeviceId = deviceId
        optimisticRemoteStateUntilElapsedMs = nowElapsedRealtimeMs + SPICE_CONNECT_OPTIMISTIC_STATE_WINDOW_MS
        _uiState.value = _uiState.value.copy(
            remoteDevices = _uiState.value.remoteDevices.map { device ->
                if (device.deviceId == deviceId) {
                    val updated = transform(device).copy(observedAtElapsedRealtimeMs = nowElapsedRealtimeMs)
                    optimisticRemoteTrackChanged =
                        device.currentTrack?.queueKey() != updated.currentTrack?.queueKey()
                    updated
                } else {
                    device
                }
            },
        )
    }

    private fun clearOptimisticRemoteState(deviceId: String? = null) {
        if (deviceId != null && optimisticRemoteDeviceId != deviceId) return
        optimisticRemoteDeviceId = null
        optimisticRemoteStateUntilElapsedMs = 0L
        optimisticRemoteTrackChanged = false
    }

    private fun activeRemoteTargetId(): String? =
        _uiState.value.selectedPlaybackDeviceId.takeIf { it.isNotBlank() }

    private fun syncLikeToActiveReceiver(track: Track, liked: Boolean) {
        val deviceId = activeRemoteTargetId() ?: return
        sendRemoteCommand(
            deviceId = deviceId,
            command = "set_like",
            payload = JSONObject()
                .put("track", track.toRemoteTrackJson())
                .put("liked", liked),
            quiet = true,
        )
    }

    private fun syncPlaylistAddToActiveReceiver(track: Track, playlist: Playlist?) {
        val deviceId = activeRemoteTargetId() ?: return
        val playlistId = playlist?.id?.takeIf { it.isNotBlank() } ?: return
        sendRemoteCommand(
            deviceId = deviceId,
            command = "add_to_playlist",
            payload = JSONObject()
                .put("track", track.toRemoteTrackJson())
                .put("playlistId", playlistId)
                .put("playlistTitle", playlist.title),
            quiet = true,
        )
    }

    private fun selectedRemoteDevice(): RemoteDevice? {
        val state = _uiState.value
        return state.remoteDevices.firstOrNull { it.deviceId == state.selectedPlaybackDeviceId }
    }

    private fun activePlayerTrack(): Track? =
        activeMobilePlaybackTrack(
            localTrack = _uiState.value.currentTrack,
            selectedRemoteDeviceId = _uiState.value.selectedPlaybackDeviceId,
            selectedRemoteTrack = selectedRemoteDevice()?.currentTrack,
        )

    private fun unavailableRemoteTarget() {
        _uiState.value = _uiState.value.copy(message = "The selected Spice Connect device is unavailable. Refreshing devices.")
        refreshSpiceConnect()
    }

    private fun initializeLibraryAndHome() {
        viewModelScope.launch {
            libraryRepository.migrateLegacySnapshotsIfNeeded()
            val session = _uiState.value.accountSession
            if (session != null) {
                runCatching { refreshCloudTaste(session) }
                    .onSuccess { summary ->
                        _uiState.value = _uiState.value.copy(lastSync = summary)
                    }
            }
            loadHome()
        }
    }

    private fun scheduleHistorySync() {
        val session = _uiState.value.accountSession ?: return
        autoHistorySyncJob?.cancel()
        autoHistorySyncJob = viewModelScope.launch {
            delay(AUTO_HISTORY_SYNC_DEBOUNCE_MS)
            if (libraryRepository.pendingHistoryTrackIds().isEmpty()) return@launch
            runCatching { syncCloudHistory(session) }
                .onSuccess { summary ->
                    _uiState.value = _uiState.value.copy(lastSync = summary)
                }
        }
    }

    private fun scheduleTasteSync() {
        val session = _uiState.value.accountSession ?: return
        autoTasteSyncJob?.cancel()
        autoTasteSyncJob = viewModelScope.launch {
            delay(AUTO_TASTE_SYNC_DEBOUNCE_MS)
            if (libraryRepository.pendingLikedTrackIds().isEmpty()) return@launch
            runCatching { refreshCloudTaste(session) }
                .onSuccess { summary ->
                    _uiState.value = _uiState.value.copy(lastSync = summary)
                    loadHome()
                }
        }
    }

    private fun observeLibrary() {
        viewModelScope.launch {
            combine(
                libraryRepository.likedTracks,
                libraryRepository.historyTracks,
                libraryRepository.playlists,
                libraryRepository.downloads,
            ) { liked, history, playlists, downloads ->
                LibrarySnapshot(liked, history, playlists, downloads)
            }
                .collect { snapshot ->
                    _uiState.value = _uiState.value.copy(
                        likedTracks = snapshot.liked,
                        historyTracks = snapshot.history,
                        playlists = snapshot.playlists,
                        downloads = snapshot.downloads,
                    )
                }
        }
    }

    private fun syncLibrary(session: AccountSession) {
        if (_uiState.value.syncLoading) return

        autoHistorySyncJob?.cancel()
        autoTasteSyncJob?.cancel()
        _uiState.value = _uiState.value.copy(syncLoading = true, message = null)
        viewModelScope.launch {
            runCatching {
                refreshCloudLibrary(session).summary
            }.onSuccess { summary ->
                _uiState.value = _uiState.value.copy(
                    syncLoading = false,
                    lastSync = summary,
                    message = "Synced ${summary.likedCount} liked tracks, ${summary.historyCount} history items, and ${summary.playlistCount} playlists.",
                )
                pullAdaptiveTaste(session)
                loadHome()
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    syncLoading = false,
                    message = error.message ?: "Cloud sync failed.",
                )
            }
        }
    }

    private fun loadPendingAccountInvites(session: AccountSession, silent: Boolean = false) {
        if (!silent) {
            _uiState.value = _uiState.value.copy(accountInvitesLoading = true)
        }
        viewModelScope.launch {
            runCatching { api.fetchPendingPlaylistInvites(session.token) }
                .onSuccess { invites ->
                    _uiState.value = _uiState.value.copy(
                        pendingAccountInvites = invites,
                        accountInvitesLoading = false,
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        accountInvitesLoading = false,
                        message = if (silent) {
                            _uiState.value.message
                        } else {
                            error.message ?: "Could not load playlist invites."
                        },
                    )
                }
        }
    }

    private fun loadProfileSummary(session: AccountSession) {
        _uiState.value = _uiState.value.copy(profileLoading = true)
        viewModelScope.launch {
            runCatching { api.fetchProfileSummary(session.token, session.account.id) }
                .onSuccess { summary ->
                    val updatedSession = session.copy(
                        account = session.account.copy(
                            username = summary.profile.username,
                            displayName = summary.profile.displayName,
                            avatarUrl = summary.profile.avatarUrl,
                        ),
                    )
                    sessionStore.save(updatedSession)
                    _uiState.value = _uiState.value.copy(
                        accountSession = updatedSession,
                        profileSummary = summary,
                        profileLoading = false,
                    )
                }
                .onFailure { error ->
                    applyAccountBlockFromApiError(error)
                    _uiState.value = _uiState.value.copy(profileLoading = false)
                }
        }
    }

    private fun hasRemoteAccess(): Boolean = hasSpiceConnectAccess(
        hasAccountSession = _uiState.value.accountSession != null,
        hasPairedCredential = activePairedCredential() != null,
    )

    private fun shouldStartSpiceConnect(): Boolean = shouldStartSpiceConnect(
        enabled = _uiState.value.spiceConnectEnabled,
        hasAccountSession = _uiState.value.accountSession != null,
        hasPairedCredential = _uiState.value.pairedDeviceCredential != null,
    )

    private fun activePairedCredential(): PairedDeviceCredential? {
        val credential = _uiState.value.pairedDeviceCredential ?: return null
        if (credential.deviceId != remoteDeviceId || credential.isExpired()) {
            clearPairedCredential("Paired-device access expired. Enter a new pairing code.")
            return null
        }
        return credential
    }

    private fun clearPairedCredential(message: String) {
        pairedCredentialStore.clear()
        clearPendingSpiceConnectHandoff()
        preparedSpiceConnectHandoffs.clear()
        clearOptimisticRemoteState()
        val state = _uiState.value
        val accountFallback = state.accountSession != null
        if (!accountFallback) {
            connectJob?.cancel()
            connectRealtimeJob?.cancel()
            connectRefreshJob?.cancel()
            disposeSpiceConnectLanTransport()
            connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
        }
        _uiState.value = state.copy(
            pairedDeviceCredential = null,
            pairingCode = "",
            pairingLoading = false,
            remoteDevices = if (accountFallback) state.remoteDevices else emptyList(),
            selectedPlaybackDeviceId = if (accountFallback) state.selectedPlaybackDeviceId else "",
            connectLoading = false,
            connectStatus = if (accountFallback) "Using the signed-in Spice account for Connect." else "",
            message = message,
        )
    }

    private suspend fun <T> withRemoteAccess(block: suspend (token: String) -> T): T {
        val pairedCredential = activePairedCredential()
        val accountToken = _uiState.value.accountSession?.token
        if (pairedCredential != null) {
            try {
                return block(pairedCredential.accessToken)
            } catch (error: SpiceApiException) {
                if (error.statusCode != 401) throw error
                clearPairedCredential("Paired-device access was revoked or expired.")
                if (!accountToken.isNullOrBlank()) return block(accountToken)
                throw SpiceApiException("Pairing expired or was revoked. Enter a new pairing code.", 401, cause = error)
            }
        }
        if (!accountToken.isNullOrBlank()) return block(accountToken)
        throw SpiceApiException("Sign in or pair this phone to use Spice Connect.", 401)
    }

    private fun startSpiceConnect() {
        connectJob?.cancel()
        connectRealtimeJob?.cancel()
        connectRefreshJob?.cancel()
        resetSpiceConnectLanTransport()
        clearPendingSpiceConnectHandoff()
        preparedSpiceConnectHandoffs.clear()
        connectRealtimeAvailable.set(false)
        while (connectRealtimeWakeups.tryReceive().isSuccess) {
            // Drop wakeups from a credential or receiver generation that ended.
        }
        connectJob = viewModelScope.launch {
            var nextDeviceSnapshotAtMs = 0L
            var nextDeviceHeartbeatAtMs = 0L
            var lastPublishedFingerprint: String? = null
            var publishedAccessIdentity: String? = null
            var pendingWakeup: SpiceConnectRealtimeWakeup? = null
            while (true) {
                if (!hasRemoteAccess()) return@launch
                val receivedStateUpdate = pendingWakeup == SpiceConnectRealtimeWakeup.State
                pendingWakeup = null
                runCatching {
                    withRemoteAccess { token ->
                        val activeAccessIdentity = spiceConnectAccessIdentity(token)
                        if (requiresSpiceConnectDeviceRegistration(publishedAccessIdentity, activeAccessIdentity)) {
                            publishSpiceConnectDevice(token)
                            publishedAccessIdentity = activeAccessIdentity
                            nextDeviceSnapshotAtMs = 0L
                            val registrationTimeMs = SystemClock.elapsedRealtime()
                            lastPublishedFingerprint = spiceConnectDeviceFingerprint()
                            nextDeviceHeartbeatAtMs = registrationTimeMs + SPICE_CONNECT_DEVICE_SYNC_INTERVAL_MS
                        }
                        val commands = try {
                            api.fetchRemoteCommands(token, remoteDeviceId)
                        } catch (error: SpiceApiException) {
                            if (!shouldResetSpiceConnectDeviceRegistration(error.statusCode)) throw error
                            publishedAccessIdentity = null
                            publishSpiceConnectDevice(token)
                            publishedAccessIdentity = activeAccessIdentity
                            lastPublishedFingerprint = spiceConnectDeviceFingerprint()
                            nextDeviceHeartbeatAtMs =
                                SystemClock.elapsedRealtime() + SPICE_CONNECT_DEVICE_SYNC_INTERVAL_MS
                            try {
                                api.fetchRemoteCommands(token, remoteDeviceId)
                            } catch (retryError: SpiceApiException) {
                                if (shouldResetSpiceConnectDeviceRegistration(retryError.statusCode)) {
                                    publishedAccessIdentity = null
                                }
                                throw retryError
                            }
                        }
                        applyRemoteCommands(commands)

                        if (commands.isNotEmpty()) {
                            // MediaController callbacks settle asynchronously after a remote command.
                            delay(SPICE_CONNECT_COMMAND_STATE_SETTLE_MS)
                        }

                        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
                        val currentFingerprint = spiceConnectDeviceFingerprint()
                        if (
                            commands.isNotEmpty() ||
                            currentFingerprint != lastPublishedFingerprint ||
                            nowElapsedRealtimeMs >= nextDeviceHeartbeatAtMs
                        ) {
                            publishSpiceConnectDevice(token)
                            lastPublishedFingerprint = spiceConnectDeviceFingerprint()
                            nextDeviceHeartbeatAtMs = nowElapsedRealtimeMs + SPICE_CONNECT_DEVICE_SYNC_INTERVAL_MS
                        }

                        val isControllingRemoteDevice = activeRemoteTargetId()?.let { targetDeviceId ->
                            targetDeviceId !in _uiState.value.lanConnectedDeviceIds
                        } == true
                        val shouldSyncDevices = shouldSyncSpiceConnectDevices(
                            nowElapsedRealtimeMs = nowElapsedRealtimeMs,
                            nextDeviceSyncAtMs = nextDeviceSnapshotAtMs,
                            receivedCommands = commands.isNotEmpty(),
                            receivedStateUpdate = receivedStateUpdate,
                            isControllingRemoteDevice = isControllingRemoteDevice,
                        )
                        if (shouldSyncDevices) {
                            val devices = api.fetchRemoteDevices(token)
                            applyRemoteDeviceSnapshot(devices)
                            nextDeviceSnapshotAtMs = nextSpiceConnectDeviceSyncAt(
                                nowElapsedRealtimeMs = nowElapsedRealtimeMs,
                                receivedCommands = commands.isNotEmpty(),
                                isControllingRemoteDevice = isControllingRemoteDevice,
                            )
                        }
                    }
                }.onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        connectStatus = error.message ?: _uiState.value.connectStatus,
                    )
                }
                val fallbackDelayMs = if (connectRealtimeAvailable.get()) {
                    SPICE_CONNECT_REALTIME_FALLBACK_POLL_INTERVAL_MS
                } else {
                    SPICE_CONNECT_COMMAND_POLL_INTERVAL_MS
                }
                pendingWakeup = withTimeoutOrNull(fallbackDelayMs) {
                    connectRealtimeWakeups.receive()
                }
            }
        }
        startSpiceConnectRealtime()
    }

    private fun startSpiceConnectRealtime() {
        connectRealtimeJob?.cancel()
        connectRealtimeJob = viewModelScope.launch {
            var reconnectDelayMs = SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS
            while (hasRemoteAccess()) {
                try {
                    val receivedEvent = withRemoteAccess { token ->
                        api.awaitRemoteEvent(token, remoteDeviceId) {
                            connectRealtimeAvailable.set(true)
                            // Poll once after LISTEN is established so a command
                            // queued during connection setup cannot wait for the
                            // periodic fallback tick.
                            connectRealtimeWakeups.trySend(SpiceConnectRealtimeWakeup.Command)
                        }
                    }
                    reconnectDelayMs = SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS
                    when (receivedEvent) {
                        SpiceConnectRealtimeEvent.Command -> {
                            connectRealtimeWakeups.trySend(SpiceConnectRealtimeWakeup.Command)
                            continue
                        }
                        SpiceConnectRealtimeEvent.State -> {
                            connectRealtimeWakeups.trySend(SpiceConnectRealtimeWakeup.State)
                            continue
                        }
                        SpiceConnectRealtimeEvent.Ready -> Unit
                        null -> {
                            connectRealtimeAvailable.set(false)
                            delay(SPICE_CONNECT_REALTIME_RECONNECT_MIN_MS)
                        }
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    connectRealtimeAvailable.set(false)
                    // The durable command poll remains active while the stream
                    // reconnects or when the deployment cannot provide it.
                    delay(reconnectDelayMs)
                    reconnectDelayMs = (reconnectDelayMs * 2)
                        .coerceAtMost(SPICE_CONNECT_REALTIME_RECONNECT_MAX_MS)
                }
            }
            connectRealtimeAvailable.set(false)
        }
    }

    fun downloadTrackOnSelectedReceiver(track: Track) {
        val deviceId = activeRemoteTargetId()
        if (deviceId == null) {
            _uiState.value = _uiState.value.copy(message = "Choose a Spice Connect receiver first.")
            return
        }
        val receiverName = selectedRemoteDevice()?.displayName ?: "the selected receiver"
        sendRemoteCommand(
            deviceId = deviceId,
            command = "download",
            payload = JSONObject().put("track", track.toRemoteTrackJson()),
            onSuccess = {
                _uiState.value = _uiState.value.copy(message = "Asked $receiverName to download ${track.title}.")
            },
        )
    }

    private fun resetSpiceConnectLanTransport() {
        disposeSpiceConnectLanTransport()
        if (!shouldStartSpiceConnect()) return
        val transport = runCatching {
            SpiceConnectLanTransport(
                context = getApplication(),
                localDeviceId = remoteDeviceId,
                scope = viewModelScope,
                sendSignal = { targetDeviceId, signal ->
                    runCatching {
                        withRemoteAccess { token ->
                            api.sendRemoteCommand(
                                token = token,
                                targetDeviceId = targetDeviceId,
                                sourceDeviceId = remoteDeviceId,
                                command = SPICE_CONNECT_LAN_SIGNAL_COMMAND,
                                payload = signal.toJson(),
                            )
                        }
                    }.onFailure { error ->
                        Log.w(SPICE_CONNECT_LOG_TAG, "Could not send LAN negotiation to $targetDeviceId", error)
                    }.isSuccess
                },
                onCommand = { command ->
                    // A verified live channel is not a durable queue. Use the
                    // receipt time so harmless phone/desktop clock skew cannot
                    // make a direct command appear stale.
                    applyRemoteCommands(
                        listOf(command.copy(createdAt = spiceConnectLanTimestamp())),
                    )
                    delay(SPICE_CONNECT_COMMAND_STATE_SETTLE_MS)
                    broadcastSpiceConnectLanState(force = true)
                },
                onState = ::applySpiceConnectLanState,
                onPeersChanged = ::applySpiceConnectLanPeers,
                onDiagnostic = { message -> Log.w(SPICE_CONNECT_LOG_TAG, message) },
            )
        }.getOrElse { error ->
            Log.w(SPICE_CONNECT_LOG_TAG, "Same-network Spice Connect is unavailable; cloud fallback remains active", error)
            _uiState.value = _uiState.value.copy(
                lanConnectedDeviceIds = emptySet(),
                connectStatus = "Same-network connection is unavailable; Spice Connect will use cloud fallback.",
            )
            return
        }
        spiceConnectLanTransport = transport
        lastSpiceConnectLanFingerprint = null
        broadcastSpiceConnectLanState(force = true)
        _uiState.value.selectedPlaybackDeviceId.takeIf(String::isNotBlank)?.let { selectedDeviceId ->
            viewModelScope.launch { transport.ensureConnection(selectedDeviceId) }
        }
    }

    private fun disposeSpiceConnectLanTransport() {
        spiceConnectLanTransport?.dispose()
        spiceConnectLanTransport = null
        lastSpiceConnectLanFingerprint = null
        if (_uiState.value.lanConnectedDeviceIds.isNotEmpty()) {
            _uiState.value = _uiState.value.copy(lanConnectedDeviceIds = emptySet())
        }
    }

    private fun applySpiceConnectLanPeers(connectedDeviceIds: Set<String>) {
        val state = _uiState.value
        val previousConnectedDeviceIds = state.lanConnectedDeviceIds
        val selectedDeviceId = state.selectedPlaybackDeviceId
        val selectedDeviceName = state.remoteDevices
            .firstOrNull { it.deviceId == selectedDeviceId }
            ?.displayName
            ?: "the selected device"
        _uiState.value = state.copy(
            lanConnectedDeviceIds = connectedDeviceIds,
            connectStatus = when {
                selectedDeviceId in connectedDeviceIds ->
                    "Same-network direct link active with $selectedDeviceName."
                selectedDeviceId in previousConnectedDeviceIds ->
                    "Same-network link ended; commands will use cloud fallback."
                else -> state.connectStatus
            },
        )
    }

    private fun applySpiceConnectLanState(peerDeviceId: String, incoming: RemoteDevice) {
        val state = _uiState.value
        val existing = state.remoteDevices.firstOrNull { it.deviceId == peerDeviceId } ?: return
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        val merged = incoming.copy(
            displayName = existing.displayName,
            lastSeenSeconds = 0L,
            rememberedUntil = existing.rememberedUntil,
            isOnline = true,
            observedAtElapsedRealtimeMs = nowElapsedRealtimeMs,
        )
        if (remoteSnapshotAcknowledgesOptimisticState(merged, existing)) {
            clearOptimisticRemoteState(peerDeviceId)
        }
        _uiState.value = state.copy(
            remoteDevices = state.remoteDevices.map { device ->
                if (device.deviceId == peerDeviceId) merged else device
            },
            connectStatus = if (state.selectedPlaybackDeviceId == peerDeviceId) {
                "Same-network direct link active with ${existing.displayName}."
            } else {
                state.connectStatus
            },
        )
    }

    private fun broadcastSpiceConnectLanStateIfChanged() {
        val fingerprint = spiceConnectDeviceFingerprint()
        if (fingerprint == lastSpiceConnectLanFingerprint) return
        broadcastSpiceConnectLanState(fingerprint = fingerprint)
    }

    private fun broadcastSpiceConnectLanState(
        force: Boolean = false,
        fingerprint: String = spiceConnectDeviceFingerprint(),
    ) {
        val transport = spiceConnectLanTransport ?: return
        if (!force && fingerprint == lastSpiceConnectLanFingerprint) return
        val playback = currentSpiceConnectPlaybackSnapshot()
        transport.broadcastState(
            RemoteDevice(
                deviceId = remoteDeviceId,
                displayName = "Spice Android",
                currentTrack = playback.track,
                queue = _uiState.value.playbackQueue.take(80),
                queueIndex = _uiState.value.queueIndex.coerceAtLeast(0),
                isPlaying = playback.isPlaying,
                shuffleEnabled = playback.player.shuffleEnabled,
                repeatMode = playback.player.repeatMode,
                progressMs = playback.progressMs,
                durationMs = playback.durationMs,
                volume = playback.player.volume,
                updatedAt = spiceConnectLanTimestamp(),
                isOnline = true,
                observedAtElapsedRealtimeMs = SystemClock.elapsedRealtime(),
            ),
        )
        lastSpiceConnectLanFingerprint = fingerprint
    }

    private fun spiceConnectAccessIdentity(token: String): String {
        val state = _uiState.value
        state.pairedDeviceCredential
            ?.takeIf { it.accessToken == token }
            ?.let { return "pair:${it.ownerUserId}:${it.authorizationId}" }
        state.accountSession
            ?.takeIf { it.token == token }
            ?.let { return "account:${it.account.id}" }
        return "unknown:${token.hashCode()}"
    }

    private suspend fun publishSpiceConnectDevice(token: String) {
        val playback = currentSpiceConnectPlaybackSnapshot()
        broadcastSpiceConnectLanState(force = true)
        api.updateRemoteDevice(
            token = token,
            deviceId = remoteDeviceId,
            displayName = "Spice Android",
            currentTrack = playback.track,
            isPlaying = playback.isPlaying,
            shuffleEnabled = playback.player.shuffleEnabled,
            repeatMode = playback.player.repeatMode,
            progressMs = playback.progressMs,
            durationMs = playback.durationMs,
            volume = playback.player.volume,
            queue = _uiState.value.playbackQueue,
            queueIndex = _uiState.value.queueIndex.coerceAtLeast(0),
        )
    }

    private fun spiceConnectDeviceFingerprint(): String {
        val state = _uiState.value
        val playback = currentSpiceConnectPlaybackSnapshot()
        return listOf(
            state.currentTrack?.id.orEmpty(),
            state.playbackQueue.joinToString(",") { it.id },
            state.queueIndex,
            playback.isPlaying,
            playback.player.shuffleEnabled,
            playback.player.repeatMode,
            playback.player.volume,
            playback.progressMs / SPICE_CONNECT_PROGRESS_REPORT_BUCKET_MS,
            playback.durationMs,
        ).joinToString("|")
    }

    private fun currentSpiceConnectPlaybackSnapshot(): SpiceConnectPlaybackSnapshot {
        val track = _uiState.value.currentTrack
        val player = playerState.value
        val playerMatchesTrack = track != null && player.mediaId == track.id
        return SpiceConnectPlaybackSnapshot(
            track = track,
            player = player,
            isPlaying = playerMatchesTrack && player.isPlaying,
            progressMs = if (playerMatchesTrack) player.positionMs else 0L,
            durationMs = if (playerMatchesTrack && player.durationMs > 0L) {
                player.durationMs
            } else {
                track?.durationMs ?: 0L
            },
        )
    }

    private suspend fun applyIncomingSpiceConnectHandoff(command: RemoteCommand): Boolean {
        val track = command.payloadTrack ?: return false
        val queue = normalizeQueue(command.payloadQueue, track)
        val requestedIndex = command.payloadQueueIndex.takeIf { it in queue.indices }
        val trackIndex = queue.indexOfFirst { it.queueKey() == track.queueKey() }.takeIf { it >= 0 }
        selectPlaybackDevice(null)
        command.volume?.let(playerConnection::setVolume)
        command.shuffleEnabled?.let(playerConnection::setShuffle)
        command.repeatMode?.let(playerConnection::setRepeatMode)
        playQueueIndex(queue, requestedIndex ?: trackIndex ?: 0)
        playJob?.join()
        command.seekPositionMs?.let(playerConnection::seekTo)
        if (command.shouldPlay == false) playerConnection.pause()
        return true
    }

    private suspend fun applyIncomingLikeCommand(command: RemoteCommand) {
        val track = command.payloadTrack ?: return
        val liked = command.liked ?: return
        libraryRepository.setLiked(track, liked)
        val session = _uiState.value.accountSession
        if (session == null) {
            _uiState.value = _uiState.value.copy(
                message = if (liked) "Liked ${track.title} from Spice Connect." else "Unliked ${track.title} from Spice Connect.",
            )
            return
        }
        runCatching { api.setTrackLiked(session.token, track, liked) }
            .onSuccess { libraryRepository.markLikeMutationSynced(track.id) }
            .onFailure {
                libraryRepository.markLikeMutationPending(track.id)
                scheduleTasteSync()
            }
        _uiState.value = _uiState.value.copy(
            message = if (liked) "Liked ${track.title} from Spice Connect." else "Unliked ${track.title} from Spice Connect.",
        )
    }

    private fun enqueueRemoteLibraryMutation(block: suspend () -> Unit) {
        viewModelScope.launch {
            remoteLibraryMutationMutex.withLock { block() }
        }
    }

    private suspend fun applyIncomingPlaylistAddCommand(command: RemoteCommand) {
        val track = command.payloadTrack ?: return
        val normalizedTitle = command.playlistTitle.trim()
        val playlist = findPortableSpiceConnectPlaylist(
            _uiState.value.playlists,
            command.playlistId,
            normalizedTitle,
        )
            ?: normalizedTitle.takeIf { it.isNotEmpty() }?.let { libraryRepository.createPlaylist(it) }
        if (playlist == null) {
            _uiState.value = _uiState.value.copy(
                message = "The selected playlist is not available on this device.",
            )
            return
        }
        if (playlist.shared) {
            val session = _uiState.value.accountSession
            if (session == null || playlist.shareRole !in setOf("owner", "editor")) {
                _uiState.value = _uiState.value.copy(message = "This device cannot edit ${playlist.title}.")
                return
            }
            runCatching {
                api.addSharedPlaylistTrack(session.token, playlist.id, track)
                refreshCloudLibrary(session)
            }.onSuccess {
                _uiState.value = _uiState.value.copy(message = "Added ${track.title} to ${playlist.title} from Spice Connect.")
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(message = error.message ?: "Could not update ${playlist.title}.")
            }
            return
        }
        val added = libraryRepository.addTrackToPlaylist(playlist.id, track)
        _uiState.value = _uiState.value.copy(
            message = if (added) {
                "Added ${track.title} to ${playlist.title} from Spice Connect."
            } else {
                "${track.title} is already in ${playlist.title}."
            },
        )
    }

    private suspend fun applyRemoteCommands(commands: List<RemoteCommand>) {
        commands.forEach { command ->
            if (appliedRemoteCommandIds.contains(command.id)) {
                Log.i(SPICE_CONNECT_LOG_TAG, "Ignoring redelivered ${command.command} (${command.id})")
                return@forEach
            }
            Log.i(SPICE_CONNECT_LOG_TAG, "Applying ${command.command} (${command.id}) on $remoteDeviceId")
            if (command.command == "connect" && command.connected == false) {
                if (_uiState.value.incomingRemoteControllerDeviceId == command.sourceDeviceId) {
                    _uiState.value = _uiState.value.copy(incomingRemoteControllerDeviceId = "")
                }
            } else if (
                command.sourceDeviceId.isNotBlank() &&
                command.command !in setOf("handoff_ready", "handoff_complete", "handoff_cancel", SPICE_CONNECT_LAN_SIGNAL_COMMAND)
            ) {
                _uiState.value = _uiState.value.copy(
                    incomingRemoteControllerDeviceId = command.sourceDeviceId,
                )
            }
            when (command.command) {
                "toggle" -> playerConnection.toggle()
                "pause" -> playerConnection.pause()
                "play" -> if (!playerState.value.isPlaying && _uiState.value.currentTrack != null) playerConnection.toggle()
                "next" -> playNextLocally()
                "previous" -> playPreviousLocally()
                "seek" -> command.seekPositionMs?.let(playerConnection::seekTo)
                "volume" -> command.volume?.let(playerConnection::setVolume)
                "shuffle" -> command.shuffleEnabled?.let(playerConnection::setShuffle)
                "repeat" -> command.repeatMode?.let(playerConnection::setRepeatMode)
                "play_track" -> command.payloadTrack?.let { track ->
                    val queue = normalizeQueue(command.payloadQueue, track)
                    val requestedIndex = command.payloadQueueIndex.takeIf { it in queue.indices }
                    val trackIndex = queue.indexOfFirst { it.queueKey() == track.queueKey() }.takeIf { it >= 0 }
                    playQueueIndex(queue, requestedIndex ?: trackIndex ?: 0)
                }
                "play_queue_index" -> {
                    val state = _uiState.value
                    command.payloadQueueIndex.takeIf { it in state.playbackQueue.indices }?.let { queueIndex ->
                        playQueueIndex(state.playbackQueue, queueIndex)
                    }
                }
                "set_like" -> enqueueRemoteLibraryMutation { applyIncomingLikeCommand(command) }
                "add_to_playlist" -> enqueueRemoteLibraryMutation { applyIncomingPlaylistAddCommand(command) }
                "download" -> command.payloadTrack?.let { track ->
                    _uiState.value = _uiState.value.copy(
                        pendingRemoteDownloadTrack = track,
                        message = "Spice Connect requested a download for ${track.title}.",
                    )
                }
                "handoff_prepare" -> {
                    val transferId = normalizeSpiceConnectTransferId(command.transferId)
                    if (transferId.isNotEmpty()) {
                        val nowElapsedMs = SystemClock.elapsedRealtime()
                        preparedSpiceConnectHandoffs.entries.removeAll {
                            it.value.expiresAtElapsedMs <= nowElapsedMs
                        }
                        preparedSpiceConnectHandoffs[transferId] = PreparedSpiceConnectHandoff(
                            transferId = transferId,
                            sourceDeviceId = command.sourceDeviceId,
                            expiresAtElapsedMs = nowElapsedMs + SPICE_CONNECT_HANDOFF_ACCEPT_TIMEOUT_MS,
                        )
                        _uiState.value = _uiState.value.copy(
                            connectStatus = "Another device is preparing to move playback here.",
                        )
                        sendRemoteCommand(
                            deviceId = command.sourceDeviceId,
                            command = "handoff_ready",
                            payload = JSONObject().put("transferId", transferId),
                            quiet = true,
                        )
                    }
                }
                "handoff_ready" -> {
                    val currentPlayer = playerState.value
                    val sourceWasPlaying = currentPlayer.isPlaying || currentPlayer.isBuffering
                    val accepted = acceptSpiceConnectHandoffReady(
                        pending = pendingSpiceConnectHandoff,
                        transferId = normalizeSpiceConnectTransferId(command.transferId),
                        sourceDeviceId = command.sourceDeviceId,
                        sourceWasPlaying = sourceWasPlaying,
                    )
                    if (accepted != null) {
                        pendingSpiceConnectHandoff = accepted
                        handoffAcceptTimeoutJob?.cancel()
                        handoffAcceptTimeoutJob = null

                        val state = _uiState.value
                        val track = state.currentTrack
                        if (track == null) {
                            clearPendingSpiceConnectHandoff()
                            sendRemoteCommand(
                                deviceId = accepted.targetDeviceId,
                                command = "handoff_cancel",
                                payload = JSONObject()
                                    .put("transferId", accepted.transferId)
                                    .put("reason", "source_track_missing"),
                                quiet = true,
                            )
                        } else {
                            val queue = normalizeQueue(state.playbackQueue, track).take(80)
                            val queueIndex = state.queueIndex.coerceIn(0, queue.lastIndex.coerceAtLeast(0))
                            if (sourceWasPlaying) playerConnection.pause()
                            patchRemoteDevice(accepted.targetDeviceId) {
                                it.copy(
                                    currentTrack = track,
                                    queue = queue,
                                    queueIndex = queueIndex,
                                    isPlaying = sourceWasPlaying,
                                    progressMs = currentPlayer.positionMs,
                                    durationMs = currentPlayer.durationMs.takeIf { value -> value > 0 }
                                        ?: track.durationMs,
                                    volume = currentPlayer.volume,
                                    shuffleEnabled = currentPlayer.shuffleEnabled,
                                    repeatMode = currentPlayer.repeatMode,
                                )
                            }
                            _uiState.value = _uiState.value.copy(
                                connectStatus = "${accepted.targetName} accepted the transfer. Starting it there now...",
                            )
                            sendRemoteCommand(
                                deviceId = accepted.targetDeviceId,
                                command = "handoff_commit",
                                payload = JSONObject()
                                    .put("transferId", accepted.transferId)
                                    .put("track", track.toRemoteTrackJson())
                                    .put("queue", JSONArray(queue.map { it.toRemoteTrackJson() }))
                                    .put("queueIndex", queueIndex)
                                    .put("progress", currentPlayer.positionMs / 1000.0)
                                    .put("volume", currentPlayer.volume.coerceIn(0, 100))
                                    .put("isPlaying", sourceWasPlaying)
                                    .put("shuffleEnabled", currentPlayer.shuffleEnabled)
                                    .put("repeatMode", currentPlayer.repeatMode.remoteValue()),
                                onSuccess = {
                                    if (pendingSpiceConnectHandoff == accepted) {
                                        handoffCompleteTimeoutJob?.cancel()
                                        handoffCompleteTimeoutJob = viewModelScope.launch {
                                            delay(SPICE_CONNECT_HANDOFF_COMPLETE_TIMEOUT_MS)
                                            if (pendingSpiceConnectHandoff != accepted) return@launch
                                            clearPendingSpiceConnectHandoff()
                                            _uiState.value = _uiState.value.copy(
                                                connectStatus = "${accepted.targetName} accepted the transfer but did not confirm playback. This phone remains paused to prevent double playback.",
                                                message = "Transfer confirmation timed out. Press Play here to recover.",
                                            )
                                        }
                                    }
                                },
                                onFailure = {
                                    if (pendingSpiceConnectHandoff == accepted) {
                                        clearPendingSpiceConnectHandoff()
                                        sendRemoteCommand(
                                            deviceId = accepted.targetDeviceId,
                                            command = "handoff_cancel",
                                            payload = JSONObject()
                                                .put("transferId", accepted.transferId)
                                                .put("reason", "commit_failed"),
                                            quiet = true,
                                        )
                                        _uiState.value = _uiState.value.copy(
                                            connectStatus = "Transfer delivery to ${accepted.targetName} could not be confirmed. This phone remains paused to prevent double playback.",
                                            message = "Transfer delivery is uncertain. Press Play here to recover.",
                                        )
                                    }
                                },
                                quiet = true,
                            )
                        }
                    }
                }
                "handoff_commit" -> {
                    val transferId = normalizeSpiceConnectTransferId(command.transferId)
                    val prepared = preparedSpiceConnectHandoffs[transferId]
                    if (
                        transferId.isNotEmpty() &&
                        acceptsPreparedSpiceConnectCommit(
                            prepared = prepared,
                            transferId = transferId,
                            sourceDeviceId = command.sourceDeviceId,
                            nowElapsedMs = SystemClock.elapsedRealtime(),
                        )
                    ) {
                        preparedSpiceConnectHandoffs.remove(transferId)
                        val applied = runCatching {
                            applyIncomingSpiceConnectHandoff(command)
                        }.getOrDefault(false)
                        if (applied) {
                            sendRemoteCommand(
                                deviceId = command.sourceDeviceId,
                                command = "handoff_complete",
                                payload = JSONObject().put("transferId", transferId),
                                quiet = true,
                            )
                            _uiState.value = _uiState.value.copy(
                                connectStatus = "Playback was accepted from another device.",
                            )
                        } else {
                            sendRemoteCommand(
                                deviceId = command.sourceDeviceId,
                                command = "handoff_cancel",
                                payload = JSONObject()
                                    .put("transferId", transferId)
                                    .put("reason", "destination_playback_failed"),
                                quiet = true,
                            )
                        }
                    } else if (transferId.isNotEmpty()) {
                        sendRemoteCommand(
                            deviceId = command.sourceDeviceId,
                            command = "handoff_cancel",
                            payload = JSONObject()
                                .put("transferId", transferId)
                                .put("reason", "transfer_not_prepared"),
                            quiet = true,
                        )
                    }
                }
                "handoff_complete" -> {
                    val transferId = normalizeSpiceConnectTransferId(command.transferId)
                    val pending = pendingSpiceConnectHandoff
                    if (completesSpiceConnectHandoff(pending, transferId, command.sourceDeviceId)) {
                        val targetName = pending?.targetName ?: "the other device"
                        clearPendingSpiceConnectHandoff()
                        _uiState.value = _uiState.value.copy(
                            connectStatus = "Playback moved to $targetName and was confirmed there.",
                            message = "Playback moved to $targetName.",
                        )
                    }
                }
                "handoff_cancel" -> {
                    val transferId = normalizeSpiceConnectTransferId(command.transferId)
                    preparedSpiceConnectHandoffs.remove(transferId)
                    val pending = pendingSpiceConnectHandoff
                    if (
                        pending != null &&
                        pending.transferId == transferId &&
                        pending.targetDeviceId == command.sourceDeviceId
                    ) {
                        val shouldResume = shouldResumeSpiceConnectSource(
                            pending,
                            destinationConfirmedNoPlayback = true,
                        )
                        val targetName = pending.targetName
                        clearPendingSpiceConnectHandoff()
                        if (shouldResume && !playerState.value.isPlaying) playerConnection.toggle()
                        _uiState.value = _uiState.value.copy(
                            connectStatus = "$targetName could not accept the transfer. Playback is available on this phone.",
                        )
                    }
                }
                "handoff" -> applyIncomingSpiceConnectHandoff(command)
                "connect" -> Unit
                SPICE_CONNECT_LAN_SIGNAL_COMMAND -> {
                    val createdAtMs = parseSpiceConnectLanTimestamp(command.createdAt)
                    if (createdAtMs != null && createdAtMs >= clientBootedAtMs) {
                        spiceConnectLanTransport?.handleSignal(command.sourceDeviceId, command.payloadJson)
                    }
                }
            }
            appliedRemoteCommandIds.markIfNew(command.id)
            persistAppliedRemoteCommandIds()
        }
    }

    private fun applyRemoteDeviceSnapshot(
        devices: List<RemoteDevice>,
        loading: Boolean = _uiState.value.connectLoading,
        status: String = _uiState.value.connectStatus,
    ) {
        val state = _uiState.value
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        val observedDeviceIds = devices.mapTo(mutableSetOf()) { it.deviceId }
        optimisticallyForgottenRemoteDeviceIds.removeAll { it !in observedDeviceIds }
        val observedDevices = devices
            .filterNot { it.deviceId in optimisticallyForgottenRemoteDeviceIds }
            .map { device ->
            device.copy(observedAtElapsedRealtimeMs = nowElapsedRealtimeMs)
        }
        if (optimisticRemoteStateUntilElapsedMs <= nowElapsedRealtimeMs) {
            clearOptimisticRemoteState()
        }
        val optimisticDevice = optimisticRemoteDeviceId?.let { deviceId ->
            state.remoteDevices.firstOrNull { it.deviceId == deviceId }
        }
        val reconciledDevices = if (optimisticDevice != null) {
            observedDevices.map { device ->
                if (device.deviceId == optimisticDevice.deviceId) {
                    when {
                        remoteSnapshotAcknowledgesOptimisticState(device, optimisticDevice) -> {
                            clearOptimisticRemoteState(device.deviceId)
                            device
                        }
                        optimisticRemoteTrackChanged &&
                            device.currentTrack?.queueKey() == optimisticDevice.currentTrack?.queueKey() -> {
                            optimisticRemoteTrackChanged = false
                            optimisticDevice.copy(
                                currentTrack = device.currentTrack ?: optimisticDevice.currentTrack,
                                queue = device.queue.ifEmpty { optimisticDevice.queue },
                                queueIndex = device.queueIndex,
                                durationMs = device.durationMs.takeIf { it > 0L }
                                    ?: optimisticDevice.durationMs,
                                updatedAt = device.updatedAt,
                            )
                        }
                        else -> optimisticDevice.copy(
                            updatedAt = device.updatedAt,
                        )
                    }
                } else {
                    device
                }
            }
        } else {
            observedDevices
        }
        val selectedId = state.selectedPlaybackDeviceId
        val selectedStillExists = selectedId.isBlank() || reconciledDevices.any { it.deviceId == selectedId }
        if (!selectedStillExists) {
            clearOptimisticRemoteState(selectedId)
            connectPreferences.edit().remove(KEY_SELECTED_PLAYBACK_DEVICE_ID).apply()
        }
        _uiState.value = state.copy(
            remoteDevices = reconciledDevices,
            selectedPlaybackDeviceId = selectedId.takeIf { selectedStillExists }.orEmpty(),
            connectLoading = loading,
            connectStatus = if (selectedStillExists) status else "Selected device went offline; using this phone.",
            message = if (selectedStillExists) state.message else "Selected Spice Connect device went offline. Playback controls are local again.",
        )
    }

    private fun remoteSnapshotAcknowledgesOptimisticState(
        observed: RemoteDevice,
        optimistic: RemoteDevice,
    ): Boolean {
        val progressDifference = kotlin.math.abs(observed.progressMs - optimistic.progressMs)
        return observed.currentTrack?.queueKey() == optimistic.currentTrack?.queueKey() &&
            observed.isPlaying == optimistic.isPlaying &&
            observed.shuffleEnabled == optimistic.shuffleEnabled &&
            observed.repeatMode == optimistic.repeatMode &&
            observed.volume == optimistic.volume &&
            (observed.queue.isEmpty() || observed.queueIndex == optimistic.queueIndex) &&
            progressDifference <= SPICE_CONNECT_PROGRESS_REPORT_BUCKET_MS * 2
    }

    private suspend fun refreshCloudLibrary(session: AccountSession): CloudLibraryRefresh =
        cloudLibrarySyncMutex.withLock {
            val likesSyncRevision = libraryRepository.likesSyncRevision()
            val historySyncRevision = libraryRepository.historySyncRevision()
            val localLiked = libraryRepository.likedSnapshot()
            val localHistory = libraryRepository.historySnapshot()
            val localPlaylists = libraryRepository.playlistSnapshot()
            val pendingLikedTrackIds = libraryRepository.pendingLikedTrackIds()
            val pendingHistoryTrackIds = libraryRepository.pendingHistoryTrackIds()
            val result = api.syncLibrary(
                token = session.token,
                liked = localLiked,
                history = localHistory,
                playlists = localPlaylists,
                pendingLikedTrackIds = pendingLikedTrackIds,
                initialLikesReconciliation = libraryRepository.needsInitialLikesReconciliation(),
                pendingHistoryTrackIds = pendingHistoryTrackIds,
                initialHistoryReconciliation = libraryRepository.needsInitialHistoryReconciliation(),
            )
            val syncedLikes = libraryRepository.replaceSyncedLikedTracks(
                result.likedTracks,
                likesSyncRevision,
            )
            val syncedHistory = libraryRepository.replaceSyncedHistoryTracks(
                result.historyTracks,
                historySyncRevision,
            )
            libraryRepository.replacePlaylists(result.playlists)
            CloudLibraryRefresh(
                result.summary.copy(likedCount = syncedLikes.size, historyCount = syncedHistory.size),
                result.playlists,
            )
        }

    private suspend fun refreshCloudTaste(session: AccountSession): LibrarySyncSummary =
        cloudLibrarySyncMutex.withLock {
            val likesSyncRevision = libraryRepository.likesSyncRevision()
            val historySyncRevision = libraryRepository.historySyncRevision()
            val pendingLikedTrackIds = libraryRepository.pendingLikedTrackIds()
            val pendingHistoryTrackIds = libraryRepository.pendingHistoryTrackIds()
            val result = api.syncTaste(
                token = session.token,
                liked = libraryRepository.likedSnapshot(),
                history = libraryRepository.historySnapshot(),
                pendingLikedTrackIds = pendingLikedTrackIds,
                initialLikesReconciliation = libraryRepository.needsInitialLikesReconciliation(),
                pendingHistoryTrackIds = pendingHistoryTrackIds,
                initialHistoryReconciliation = libraryRepository.needsInitialHistoryReconciliation(),
            )
            val syncedLikes = libraryRepository.replaceSyncedLikedTracks(
                result.likedTracks,
                likesSyncRevision,
            )
            val syncedHistory = libraryRepository.replaceSyncedHistoryTracks(
                result.historyTracks,
                historySyncRevision,
            )
            result.summary.copy(
                likedCount = syncedLikes.size,
                historyCount = syncedHistory.size,
                playlistCount = libraryRepository.playlistSnapshot().size,
            )
        }

    private suspend fun syncCloudHistory(session: AccountSession): LibrarySyncSummary =
        cloudLibrarySyncMutex.withLock {
            val historySyncRevision = libraryRepository.historySyncRevision()
            val pendingHistoryTrackIds = libraryRepository.pendingHistoryTrackIds()
            val history = api.syncHistory(
                token = session.token,
                history = libraryRepository.historySnapshot(),
                pendingHistoryTrackIds = pendingHistoryTrackIds,
                initialHistoryReconciliation = libraryRepository.needsInitialHistoryReconciliation(),
            )
            val syncedHistory = libraryRepository.replaceSyncedHistoryTracks(history, historySyncRevision)
            LibrarySyncSummary(
                likedCount = libraryRepository.likedSnapshot().size,
                historyCount = syncedHistory.size,
                playlistCount = libraryRepository.playlistSnapshot().size,
            )
        }

    private fun findSyncedPlaylist(local: Playlist, remotePlaylists: List<Playlist>): Playlist? {
        val localTrackIds = local.tracks.map { it.id }
        return remotePlaylists.firstOrNull { it.id == local.id }
            ?: remotePlaylists.firstOrNull { remote ->
                remote.title == local.title && remote.tracks.map { it.id } == localTrackIds
            }
    }

    private fun openShareTextIntent(subject: String, text: String) {
        val shareIntent = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, subject)
            .putExtra(Intent.EXTRA_TEXT, text)
        val chooser = Intent.createChooser(shareIntent, "Share playlist")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        getApplication<Application>().startActivity(chooser)
    }

    private fun loadHome() {
        homeLoadJob?.cancel()
        _uiState.value = _uiState.value.copy(homeLoading = true, message = null)
        homeLoadJob = viewModelScope.launch {
            runCatching {
                val history = libraryRepository.historySnapshot()
                val liked = libraryRepository.likedSnapshot()
                val seeds = buildMobileRecommendationSeeds(history, liked)
                val recommendationBatches = coroutineScope {
                    seeds.map { seed ->
                        async {
                            runCatching {
                                MobileRecommendationBatch(seed, api.search(seed.query, 14))
                            }.getOrNull()
                        }
                    }.awaitAll().filterNotNull()
                }
                val personalized = mobileRecommendationSections(
                    recommendationBatches,
                    history,
                    liked,
                    trackPriorityFor = { key -> libraryRepository.trackPriority(key) },
                )
                val fallbackQueries = buildList {
                    add("Quick Picks" to "Top Hits 2026")
                    if (personalized.isEmpty()) {
                        add("Lofi & Chill" to "Chill Study Lofi Beats")
                        add("Workout Energy" to "Workout Gym Power")
                    }
                }
                val fallback = coroutineScope {
                    fallbackQueries.map { (title, query) ->
                        async {
                            runCatching { FeedSection(title, api.search(query, 10)) }.getOrNull()
                        }
                    }.awaitAll().filterNotNull()
                }
                (personalized + fallback).filter { it.tracks.isNotEmpty() }
            }.onSuccess { sections ->
                val listenerFavorites = _uiState.value.accountSession?.let { session ->
                    runCatching {
                        api.fetchListenersLikeYou(session.token)
                            .let { parsed -> parseListenerFavorites(parsed) }
                            .take(10)
                            .let { tracks -> if (tracks.isEmpty()) null else FeedSection("Listeners like you", tracks) }
                    }.getOrNull()
                }
                val finalSections = if (listenerFavorites != null) {
                    listOf(listenerFavorites) + sections.filter { section -> section.title != listenerFavorites.title }
                } else {
                    sections
                }
                _uiState.value = _uiState.value.copy(
                    homeSections = finalSections,
                    homeLoading = false,
                    message = if (finalSections.isEmpty()) "Home feed is unavailable right now." else _uiState.value.message,
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    homeLoading = false,
                    message = error.message ?: "Home feed failed to load.",
                )
            }
        }
    }

    private suspend fun downloadSource(track: Track): DownloadSource =
        DownloadSource(api.resolvePlayable(track, _uiState.value.quality).stream.url)

    private suspend fun downloadOneTrack(track: Track, progressPrefix: String = ""): DownloadedTrack {
        val processId = MediaDownloadClient.newProcessId()
        activeDownloadProcessId = processId
        _uiState.value = _uiState.value.copy(
            downloadProgress = listOf(progressPrefix, "Resolving a direct audio stream")
                .filter(String::isNotBlank)
                .joinToString(": "),
        )
        val source = downloadSource(track)
        _uiState.value = _uiState.value.copy(
            downloadProgress = listOf(progressPrefix, "Direct stream ready; starting download")
                .filter(String::isNotBlank)
                .joinToString(": "),
        )
        val result = withContext(Dispatchers.IO) {
            val progressHandler: (xyz.spiceapp.mobile.data.download.DownloadProgress) -> Unit = { progress ->
                val status = when {
                    progress.progress.isFinite() && progress.progress >= 0f ->
                        "Downloading ${progress.progress.toInt().coerceIn(0, 100)}%"
                    progress.line.contains("ExtractAudio", ignoreCase = true) ||
                        progress.line.contains("ffmpeg", ignoreCase = true) ->
                        "Converting to MP3"
                    progress.line == xyz.spiceapp.mobile.data.download.DOWNLOAD_TIMEOUT_ERROR ->
                        progress.line
                    else -> "Downloading audio"
                }
                _uiState.value = _uiState.value.copy(
                    downloadProgress = listOf(progressPrefix, status).filter(String::isNotBlank).joinToString(": "),
                )
            }
            downloadClient.downloadAudio(track, source.url, processId, progress = progressHandler)
        }
        if (result.exitCode != 0) {
            throw IllegalStateException(
                "Download failed: ${result.errorOutput.ifBlank { result.output }.take(160)}",
            )
        }
        if (result.outputFilePath.isBlank() || result.outputFileName.isBlank()) {
            throw IllegalStateException("Download finished, but Android did not return the saved audio file.")
        }
        return libraryRepository.addDownload(
            track = track,
            savedLocation = result.outputFilePath,
            fileName = result.outputFileName,
            bytes = result.outputBytes,
            mimeType = "audio/mpeg",
        )
    }

    private fun loadRemoteDeviceId(): String {
        connectPreferences.getString(KEY_REMOTE_DEVICE_ID, null)?.let { return it }
        val id = "spice-android-${UUID.randomUUID()}"
        connectPreferences.edit().putString(KEY_REMOTE_DEVICE_ID, id).apply()
        return id
    }

    private fun loadSelectedPlaybackDeviceId(): String =
        connectPreferences.getString(KEY_SELECTED_PLAYBACK_DEVICE_ID, "").orEmpty()

    private fun loadAppliedRemoteCommandIds(): List<String> = runCatching {
        val payload = JSONArray(
            connectPreferences.getString(KEY_APPLIED_REMOTE_COMMAND_IDS, "[]").orEmpty(),
        )
        buildList {
            for (index in 0 until payload.length()) {
                payload.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
            }
        }
    }.getOrDefault(emptyList())

    private suspend fun persistAppliedRemoteCommandIds() {
        val payload = JSONArray(appliedRemoteCommandIds.snapshot()).toString()
        val persisted = withContext(Dispatchers.IO) {
            connectPreferences.edit()
                .putString(KEY_APPLIED_REMOTE_COMMAND_IDS, payload)
                .commit()
        }
        if (!persisted) {
            Log.w(SPICE_CONNECT_LOG_TAG, "Could not persist the applied command-ID history")
        }
    }

    private fun startDownloadIntent(download: DownloadedTrack, action: String) {
        val uri = downloadUri(download)
        if (uri == null) {
            _uiState.value = _uiState.value.copy(message = "That downloaded file is missing.")
            return
        }
        val intent = Intent(action)
            .setDataAndType(uri, download.mimeType)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching {
            getApplication<Application>().startActivity(intent)
        }.onFailure { error ->
            _uiState.value = _uiState.value.copy(message = error.message ?: "No app can open this download.")
        }
    }

    private fun downloadUri(download: DownloadedTrack): Uri? {
        if (download.filePath.startsWith("content://")) {
            val uri = Uri.parse(download.filePath)
            val exists = runCatching {
                getApplication<Application>().contentResolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
            }.getOrDefault(false)
            return uri.takeIf { exists }
        }
        val file = File(download.filePath)
        if (!file.exists()) return null
        return FileProvider.getUriForFile(
            getApplication(),
            "${getApplication<Application>().packageName}.fileprovider",
            file,
        )
    }

    private fun mimeTypeForAudioFile(file: File): String =
        when (file.extension.lowercase()) {
            "m4a", "mp4" -> "audio/mp4"
            "mp3" -> "audio/mpeg"
            "opus" -> "audio/opus"
            "ogg" -> "audio/ogg"
            "webm" -> "audio/webm"
            else -> "audio/*"
        }

    private fun normalizeQueue(queue: List<Track>, selected: Track): List<Track> {
        val normalized = queue
            .ifEmpty { listOf(selected) }
            .filter { it.id.isNotBlank() }
        return if (normalized.any { it.queueKey() == selected.queueKey() }) {
            normalized
        } else {
            listOf(selected) + normalized
        }
    }

    private fun nextQueuePlan(state: SpiceUiState, allowWrap: Boolean): PlannedQueueIndex? {
        val queue = state.playbackQueue
        if (queue.isEmpty()) return null
        if (playerState.value.shuffleEnabled) {
            historyTraversalIndex(queue, step = 1)?.let { (cursor, index) ->
                return PlannedQueueIndex(index, cursor)
            }
            if (queue.size > 1) {
                return planMobileShuffleQueueIndex(
                    queueIndices = queue.indices.toList(),
                    currentIndex = state.queueIndex,
                    playedTrackKeys = shuffleCycleTrackKeys,
                    roundPlayCount = shuffleRoundPlayCount,
                    allowWrap = allowWrap,
                    trackKeyForIndex = { index -> queue[index].queueKey() },
                    priorityForIndex = { index ->
                        libraryRepository.trackPriority(queue[index].queueKey())
                    },
                    randomUnit = Random.nextDouble(),
                )?.let { plan ->
                    PlannedQueueIndex(
                        queueIndex = plan.queueIndex,
                        startsNewShuffleRound = plan.startsNewRound,
                    )
                }
            }
        }
        val next = state.queueIndex + 1
        return when {
            next in queue.indices -> PlannedQueueIndex(next)
            allowWrap -> PlannedQueueIndex(0)
            else -> null
        }
    }

    private fun List<Track>.replaceAt(index: Int, track: Track): List<Track> =
        mapIndexed { itemIndex, item -> if (itemIndex == index) track else item }

    private fun Track.queueKey(): String = "$sourceId:$id"

    private fun RepeatMode.next(): RepeatMode = when (this) {
        RepeatMode.Off -> RepeatMode.All
        RepeatMode.All -> RepeatMode.One
        RepeatMode.One -> RepeatMode.Off
    }

    private fun RepeatMode.remoteValue(): String = when (this) {
        RepeatMode.Off -> "none"
        RepeatMode.All -> "all"
        RepeatMode.One -> "one"
    }

    override fun onCleared() {
        playJob?.cancel()
        downloadJob?.cancel()
        connectJob?.cancel()
        connectRealtimeJob?.cancel()
        connectRefreshJob?.cancel()
        handoffAcceptTimeoutJob?.cancel()
        handoffCompleteTimeoutJob?.cancel()
        updateCheckJob?.cancel()
        updateDownloadJob?.cancel()
        autoHistorySyncJob?.cancel()
        homeLoadJob?.cancel()
        transitionPreparationJob?.cancel()
        autoTasteSyncJob?.cancel()
        appUpdateClient.cancelActiveRequest()
        disposeSpiceConnectLanTransport()
        playerConnection.release()
        super.onCleared()
    }

    private companion object {
        const val KEY_REMOTE_DEVICE_ID = "remote_device_id"
        const val KEY_SPICE_CONNECT_ENABLED = "spice_connect_enabled"
        const val KEY_SELECTED_PLAYBACK_DEVICE_ID = "selected_playback_device_id"
        const val KEY_APPLIED_REMOTE_COMMAND_IDS = "applied_remote_command_ids"
        const val MAX_APPLIED_REMOTE_COMMAND_IDS = 160
        const val MAX_PLAYBACK_HISTORY_ENTRIES = 512
        const val APP_UPDATE_DOWNLOAD_POLL_INTERVAL_MS = 1_000L
        const val MAX_MISSING_APP_UPDATE_DOWNLOAD_CHECKS = 3
        const val AUTO_HISTORY_SYNC_DEBOUNCE_MS = 90_000L
        const val AUTO_TASTE_SYNC_DEBOUNCE_MS = 30_000L
        const val SEARCH_DEBOUNCE_MS = 400L
    }
}

private data class LibrarySnapshot(
    val liked: List<Track>,
    val history: List<Track>,
    val playlists: List<Playlist>,
    val downloads: List<DownloadedTrack>,
)

private data class CloudLibraryRefresh(
    val summary: LibrarySyncSummary,
    val playlists: List<Playlist>,
)

private data class PreparedMobileTransition(
    val outgoingTrackKey: String,
    val nextTrackKey: String,
    val queue: List<Track>,
    val nextIndex: Int,
    val historyCursorTarget: Int?,
    val startsNewShuffleRound: Boolean,
    val playback: ResolvedPlayback,
)

private data class PlannedQueueIndex(
    val queueIndex: Int,
    val historyCursorTarget: Int? = null,
    val startsNewShuffleRound: Boolean = false,
)

private data class PendingMobileDeparture(
    val trackKey: String,
    val feedback: MobileTrackFeedback,
)

private data class SharePlaylistResult(
    val summary: LibrarySyncSummary,
    val playlistTitle: String,
)

private data class PendingInviteActionResult(
    val summary: LibrarySyncSummary,
    val pendingInvites: List<PendingPlaylistInvite>,
)

private data class MemberSheetResult(
    val playlist: Playlist,
    val members: PlaylistMembersSummary,
    val tracks: SharedPlaylistTracks,
)

private data class SharedTrackEditResult(
    val summary: LibrarySyncSummary,
    val tracks: SharedPlaylistTracks?,
)

private data class DownloadSource(
    val url: String,
)

private data class SpiceConnectPlaybackSnapshot(
    val track: Track?,
    val player: PlayerUiState,
    val isPlaying: Boolean,
    val progressMs: Long,
    val durationMs: Long,
)
