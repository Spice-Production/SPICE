package xyz.spiceapp.mobile.ui

import android.os.SystemClock
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import xyz.spiceapp.mobile.BuildConfig
import xyz.spiceapp.mobile.SpiceUiState
import xyz.spiceapp.mobile.activeTimedLyricIndex
import xyz.spiceapp.mobile.readableMobileReleaseNotes
import xyz.spiceapp.mobile.formatSpiceConnectPairingCodeInput
import xyz.spiceapp.mobile.isCompleteSpiceConnectPairingCode
import xyz.spiceapp.mobile.normalizeSpiceConnectPairingCodeInput
import xyz.spiceapp.mobile.projectedSpiceConnectProgressMs
import xyz.spiceapp.mobile.parseTimedLyrics
import xyz.spiceapp.mobile.sanitizeSpiceConnectPairingCodeEdit
import xyz.spiceapp.mobile.spiceConnectDeviceStatus
import xyz.spiceapp.mobile.data.update.AppUpdateUiState
import xyz.spiceapp.mobile.model.AccentTheme
import xyz.spiceapp.mobile.model.AccountBlock
import xyz.spiceapp.mobile.model.AppScreen
import xyz.spiceapp.mobile.model.AuthMode
import xyz.spiceapp.mobile.model.DownloadedTrack
import xyz.spiceapp.mobile.model.FeedSection
import xyz.spiceapp.mobile.model.LibraryTab
import xyz.spiceapp.mobile.model.LyricsPayload
import xyz.spiceapp.mobile.model.PendingPlaylistInvite
import xyz.spiceapp.mobile.model.Playlist
import xyz.spiceapp.mobile.model.PlaylistInvitePreview
import xyz.spiceapp.mobile.model.PlaylistMember
import xyz.spiceapp.mobile.model.PlaylistMembersSummary
import xyz.spiceapp.mobile.model.RemoteDevice
import xyz.spiceapp.mobile.model.RepeatMode
import xyz.spiceapp.mobile.model.SearchProvider
import xyz.spiceapp.mobile.model.SharedPlaylistTrack
import xyz.spiceapp.mobile.model.SharedPlaylistTracks
import xyz.spiceapp.mobile.model.StreamQuality
import xyz.spiceapp.mobile.model.Track
import xyz.spiceapp.mobile.playback.PlayerUiState
import java.text.DateFormat
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpiceApp(
    uiState: SpiceUiState,
    playerState: PlayerUiState,
    onScreenSelected: (AppScreen) -> Unit,
    onSearchQueryChanged: (String) -> Unit,
    onSearch: (String) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
    onQueueTrackSelected: (Track, List<Track>, Int) -> Unit,
    onTogglePlayback: () -> Unit,
    onPlayNext: () -> Unit,
    onPlayPrevious: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onToggleShuffle: () -> Unit,
    onCycleRepeat: () -> Unit,
    onStopPlayback: () -> Unit,
    onToggleLike: (Track) -> Unit,
    onAccentSelected: (AccentTheme) -> Unit,
    onQualitySelected: (StreamQuality) -> Unit,
    onSearchProviderSelected: (SearchProvider) -> Unit,
    onCrossfadeDurationSelected: (Long) -> Unit,
    onSmartQueueEnabled: (Boolean) -> Unit,
    onLibraryTabSelected: (LibraryTab) -> Unit,
    onCreatePlaylist: () -> Unit,
    onAddCurrentTrackToPlaylist: (String) -> Unit,
    onAddTrackToPlaylist: (String, Track) -> Unit,
    onSharePlaylist: (Playlist) -> Unit,
    onAcceptPlaylistInvite: () -> Unit,
    onDismissPlaylistInvite: () -> Unit,
    onRefreshPendingInvites: () -> Unit,
    onAcceptPendingInvite: (PendingPlaylistInvite) -> Unit,
    onRejectPendingInvite: (PendingPlaylistInvite) -> Unit,
    onOpenPlaylistMembers: (Playlist) -> Unit,
    onDismissPlaylistMembers: () -> Unit,
    onMemberInviteUsernameChanged: (String) -> Unit,
    onInvitePlaylistMember: () -> Unit,
    onRemovePlaylistMember: (String) -> Unit,
    onLeaveSharedPlaylist: () -> Unit,
    onRemoveSharedPlaylistTrack: (SharedPlaylistTrack) -> Unit,
    onRefreshSharedPlaylistTracks: () -> Unit,
    onAuthModeSelected: (AuthMode) -> Unit,
    onAuthEmailChanged: (String) -> Unit,
    onAuthPasswordChanged: (String) -> Unit,
    onAuthUsernameChanged: (String) -> Unit,
    onSubmitAccount: () -> Unit,
    onAuthVerificationCodeChanged: (String) -> Unit,
    onSubmitEmailVerification: () -> Unit,
    onResendEmailVerification: () -> Unit,
    onCancelEmailVerification: () -> Unit,
    onPairingCodeChanged: (String) -> Unit,
    onClaimPairingCode: () -> Unit,
    onDisconnectPairedDevice: () -> Unit,
    onSignOut: () -> Unit,
    onOpenProfileEditor: () -> Unit,
    onDismissProfileEditor: () -> Unit,
    onProfileDisplayNameChanged: (String) -> Unit,
    onProfileUsernameChanged: (String) -> Unit,
    onProfileAvatarUrlChanged: (String) -> Unit,
    onProfileBioChanged: (String) -> Unit,
    onProfilePrivateChanged: (Boolean) -> Unit,
    onSaveProfile: () -> Unit,
    onSyncNow: () -> Unit,
    onSpiceConnectEnabled: (Boolean) -> Unit,
    onRefreshSpiceConnect: () -> Unit,
    onPlaybackDeviceSelected: (String?) -> Unit,
    onForgetPlaybackDevice: (String) -> Unit,
    onRemoteVolumeChanged: (Int) -> Unit,
    onHandoffPlayback: () -> Unit,
    onTestEngine: () -> Unit,
    onDownloadTrack: (Track) -> Unit,
    onDownloadTrackToReceiver: (Track) -> Unit,
    onDownloadPlaylist: (Playlist) -> Unit,
    onCancelDownload: () -> Unit,
    onLoadLyrics: () -> Unit,
    onDismissLyrics: () -> Unit,
    onOpenDownload: (DownloadedTrack) -> Unit,
    onShareDownload: (DownloadedTrack) -> Unit,
    onRemoveDownload: (DownloadedTrack) -> Unit,
    onRetryHome: () -> Unit,
    onDownloadAppUpdate: () -> Unit,
    onCancelAppUpdateDownload: () -> Unit,
    onDismissAppUpdate: () -> Unit,
    onInstallAppUpdate: (String, String) -> Unit,
    onOpenAppUpdateReleasePage: () -> Unit,
    onClearMessage: () -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var showPlayer by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }
    var showProfile by remember { mutableStateOf(false) }
    var showNotifications by remember { mutableStateOf(false) }
    val selectedRemoteDevice = uiState.remoteDevices.firstOrNull {
        it.deviceId == uiState.selectedPlaybackDeviceId
    }
    val isRemotePlayback = uiState.selectedPlaybackDeviceId.isNotBlank()
    val activeTrack = if (isRemotePlayback) selectedRemoteDevice?.currentTrack else uiState.currentTrack
    val remotePlayer = rememberRemotePlayerUiState(selectedRemoteDevice)
    val activePlayer = if (isRemotePlayback) {
        remotePlayer
    } else {
        playerState
    }
    val activeQueue = if (isRemotePlayback) selectedRemoteDevice?.queue.orEmpty() else uiState.playbackQueue
    val activeQueueSize = activeQueue.size
    val activeQueueIndex = if (isRemotePlayback) selectedRemoteDevice?.queueIndex ?: -1 else uiState.queueIndex
    val message = uiState.message ?: playerState.error.takeUnless { isRemotePlayback }

    val accountBlock = uiState.accountBlock
    if (accountBlock != null) {
        AccountBlockScreen(
            block = accountBlock,
            onSignOut = onSignOut,
        )
        return
    }

    LaunchedEffect(message) {
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            onClearMessage()
        }
    }

    LaunchedEffect(showPlayer, activeTrack) {
        if (showPlayer && activeTrack == null) showPlayer = false
    }

    LaunchedEffect(uiState.lyricsTrackId, activeTrack?.id) {
        if (uiState.lyricsTrackId == null) return@LaunchedEffect
        if (activeTrack == null) onDismissLyrics()
        else if (activeTrack.id != uiState.lyricsTrackId) onLoadLyrics()
    }

    Scaffold(
        containerColor = SpiceBackground,
        topBar = {
            SpiceTopBar(
                uiState = uiState,
                onNotificationsClick = { showNotifications = true },
                onProfileClick = { showProfile = true },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            Column(Modifier.background(SpiceBackground).imePadding().navigationBarsPadding()) {
                if (uiState.currentTrack != null || isRemotePlayback) {
                    MiniPlayer(
                        track = activeTrack,
                        player = activePlayer,
                        resolving = !isRemotePlayback && uiState.resolvingTrackId == activeTrack?.id,
                        queueSize = activeQueueSize,
                        queueIndex = activeQueueIndex,
                        uiState = uiState,
                        selectedRemoteDevice = selectedRemoteDevice,
                        remotePlayback = isRemotePlayback,
                        onOpen = { showPlayer = true },
                        onToggle = onTogglePlayback,
                        onSeekTo = onSeekTo,
                        onShuffle = onToggleShuffle,
                        onRepeat = onCycleRepeat,
                        onRefreshDevices = onRefreshSpiceConnect,
                        onDeviceSelected = onPlaybackDeviceSelected,
                        onForgetDevice = onForgetPlaybackDevice,
                    )
                }
                SpiceNavigation(uiState.screen, onScreenSelected)
            }
        },
    ) { padding ->
        when (uiState.screen) {
            AppScreen.Home -> HomeScreen(uiState, padding, onTrackSelected, onSearch, onRetryHome)
            AppScreen.Search -> SearchScreen(
                uiState = uiState,
                contentPadding = padding,
                onQueryChanged = onSearchQueryChanged,
                onSearch = onSearch,
                onTrackSelected = onTrackSelected,
            )
            AppScreen.Library -> LibraryScreen(
                uiState = uiState,
                contentPadding = padding,
                onTabSelected = onLibraryTabSelected,
                onCreatePlaylist = onCreatePlaylist,
                onAddCurrentTrackToPlaylist = onAddCurrentTrackToPlaylist,
                onSharePlaylist = onSharePlaylist,
                onOpenPlaylistMembers = onOpenPlaylistMembers,
                onCancelDownload = onCancelDownload,
                onOpenDownload = onOpenDownload,
                onShareDownload = onShareDownload,
                onRemoveDownload = onRemoveDownload,
                onTrackSelected = onTrackSelected,
                onDownloadPlaylist = onDownloadPlaylist,
            )
            AppScreen.Settings -> SettingsScreen(
                uiState = uiState,
                contentPadding = padding,
                onAuthModeSelected = onAuthModeSelected,
                onAuthEmailChanged = onAuthEmailChanged,
                onAuthPasswordChanged = onAuthPasswordChanged,
                onAuthUsernameChanged = onAuthUsernameChanged,
                onSubmitAccount = onSubmitAccount,
                onAuthVerificationCodeChanged = onAuthVerificationCodeChanged,
                onSubmitEmailVerification = onSubmitEmailVerification,
                onResendEmailVerification = onResendEmailVerification,
                onCancelEmailVerification = onCancelEmailVerification,
                onPairingCodeChanged = onPairingCodeChanged,
                onClaimPairingCode = onClaimPairingCode,
                onDisconnectPairedDevice = onDisconnectPairedDevice,
                onSignOut = onSignOut,
                onAccentSelected = onAccentSelected,
                onQualitySelected = onQualitySelected,
                onSearchProviderSelected = onSearchProviderSelected,
                onCrossfadeDurationSelected = onCrossfadeDurationSelected,
                onSmartQueueEnabled = onSmartQueueEnabled,
                onOpenProfileEditor = onOpenProfileEditor,
                onSyncNow = onSyncNow,
                onSpiceConnectEnabled = onSpiceConnectEnabled,
                onRefreshPendingInvites = onRefreshPendingInvites,
                onAcceptPendingInvite = onAcceptPendingInvite,
                onRejectPendingInvite = onRejectPendingInvite,
                onTestEngine = onTestEngine,
            )
        }
    }

    if (showPlayer && activeTrack != null) {
        FullPlayer(
            track = activeTrack,
            player = activePlayer,
            liked = uiState.likedTracks.any { it.id == activeTrack.id },
            uiState = uiState,
            selectedRemoteDevice = selectedRemoteDevice,
            remotePlayback = isRemotePlayback,
            onDismiss = { showPlayer = false },
            onToggle = onTogglePlayback,
            onNext = onPlayNext,
            onPrevious = onPlayPrevious,
            onSeekTo = onSeekTo,
            onShuffle = onToggleShuffle,
            onRepeat = onCycleRepeat,
            queueSize = activeQueueSize,
            queueIndex = activeQueueIndex,
            onStop = onStopPlayback,
            onLike = { onToggleLike(activeTrack) },
            onLyrics = onLoadLyrics,
            downloadTrackId = uiState.downloadTrackId,
            downloadProgress = uiState.downloadProgress,
            onDownload = { onDownloadTrack(activeTrack) },
            onDownloadToReceiver = { onDownloadTrackToReceiver(activeTrack) },
            onCancelDownload = onCancelDownload,
            onRefreshDevices = onRefreshSpiceConnect,
            onDeviceSelected = onPlaybackDeviceSelected,
            onForgetDevice = onForgetPlaybackDevice,
            onRemoteVolumeChanged = onRemoteVolumeChanged,
            onHandoffPlayback = onHandoffPlayback,
            onAddTrackToPlaylist = onAddTrackToPlaylist,
            onOpenQueue = {
                showPlayer = false
                showQueue = true
            },
        )
    }

    if (showQueue) {
        QueueSheet(
            queue = activeQueue,
            queueIndex = activeQueueIndex,
            receiverName = selectedRemoteDevice?.displayName.takeIf { isRemotePlayback },
            onTrackSelected = { track, index ->
                onQueueTrackSelected(track, activeQueue, index)
                showQueue = false
            },
            onDismiss = { showQueue = false },
        )
    }

    if (showProfile) {
        ProfileSheet(
            uiState = uiState,
            onDismiss = { showProfile = false },
            onEditProfile = {
                showProfile = false
                onOpenProfileEditor()
            },
            onOpenSettings = {
                showProfile = false
                onScreenSelected(AppScreen.Settings)
            },
        )
    }

    if (showNotifications) {
        NotificationsSheet(
            uiState = uiState,
            onDismiss = { showNotifications = false },
            onOpenSettings = {
                showNotifications = false
                onScreenSelected(AppScreen.Settings)
            },
            onAcceptPendingInvite = onAcceptPendingInvite,
            onRejectPendingInvite = onRejectPendingInvite,
        )
    }

    if (uiState.lyricsTrackId != null) {
        LyricsSheet(
            track = activeTrack,
            positionMs = activePlayer.positionMs,
            loading = uiState.lyricsLoading,
            lyrics = uiState.lyricsPayload,
            onDismiss = onDismissLyrics,
        )
    }

    if (uiState.profileEditOpen) {
        ProfileEditorSheet(
            uiState = uiState,
            onDismiss = onDismissProfileEditor,
            onDisplayNameChanged = onProfileDisplayNameChanged,
            onUsernameChanged = onProfileUsernameChanged,
            onAvatarUrlChanged = onProfileAvatarUrlChanged,
            onBioChanged = onProfileBioChanged,
            onPrivateChanged = onProfilePrivateChanged,
            onSave = onSaveProfile,
        )
    }

    uiState.pendingInvitePreview?.let { preview ->
        PlaylistInviteDialog(
            preview = preview,
            signedIn = uiState.accountSession != null,
            loading = uiState.inviteLoading,
            onAccept = onAcceptPlaylistInvite,
            onDismiss = onDismissPlaylistInvite,
            onOpenSettings = {
                onDismissPlaylistInvite()
                onScreenSelected(AppScreen.Settings)
            },
        )
    }

    uiState.activeMemberPlaylist?.let { playlist ->
        PlaylistMembersSheet(
            playlist = playlist,
            members = uiState.playlistMembers,
            sharedTracks = uiState.sharedPlaylistTracks,
            currentUserId = uiState.accountSession?.account?.id.orEmpty(),
            inviteUsername = uiState.memberInviteUsername,
            loading = uiState.membersLoading,
            actionLoading = uiState.memberActionLoading,
            trackActionLoading = uiState.sharedTrackActionLoading,
            onDismiss = onDismissPlaylistMembers,
            onInviteUsernameChanged = onMemberInviteUsernameChanged,
            onInvite = onInvitePlaylistMember,
            onRemoveMember = onRemovePlaylistMember,
            onLeave = onLeaveSharedPlaylist,
            onRemoveTrack = onRemoveSharedPlaylistTrack,
            onRefreshTracks = onRefreshSharedPlaylistTracks,
        )
    }

    if (uiState.appUpdate.update != null && !uiState.appUpdate.dismissed) {
        AppUpdateDialog(
            state = uiState.appUpdate,
            onDownload = onDownloadAppUpdate,
            onCancelDownload = onCancelAppUpdateDownload,
            onInstall = onInstallAppUpdate,
            onOpenReleasePage = onOpenAppUpdateReleasePage,
            onDismiss = onDismissAppUpdate,
        )
    }
}

@Composable
private fun AccountBlockScreen(
    block: AccountBlock,
    onSignOut: () -> Unit,
) {
    val banned = block.isBanned
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SpiceBackground)
            .padding(horizontal = 32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(
                shape = CircleShape,
                color = if (banned) Color(0x26EF4444) else Color(0x26F59E0B),
                modifier = Modifier.size(64.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(text = if (banned) "⛔" else "⏱", fontSize = 28.sp)
                }
            }
            Spacer(Modifier.height(18.dp))
            Text(
                text = if (banned) "Account Banned" else "Account Temporarily Timed Out",
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = if (banned) {
                    "This account has been banned and can no longer sign in or use SPICE services."
                } else {
                    "This account is temporarily timed out. SPICE services will be restored when the timeout ends."
                },
                color = SpiceTextMuted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                textAlign = TextAlign.Center,
            )
            if (block.reason.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Reason: ${block.reason}",
                    color = SpiceTextMuted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                )
            }
            if (block.expiresAt.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Access returns ${readableBlockExpiry(block.expiresAt)}",
                    color = SpiceTextMuted,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onSignOut) {
                Text("Sign Out")
            }
        }
    }
}

private fun readableBlockExpiry(value: String): String {
    val normalized = value.trim()
    if (normalized.isEmpty()) return "later"
    val parsed = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss",
    ).firstNotNullOfOrNull { pattern ->
        val position = ParsePosition(0)
        runCatching {
            SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
                isLenient = false
            }.parse(normalized, position).takeIf {
                position.index == normalized.length && position.errorIndex < 0
            }
        }.getOrNull()
    }
    if (parsed == null) return "later"
    return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(parsed)
}

@Composable
private fun AppUpdateDialog(
    state: AppUpdateUiState,
    onDownload: () -> Unit,
    onCancelDownload: () -> Unit,
    onInstall: (String, String) -> Unit,
    onOpenReleasePage: () -> Unit,
    onDismiss: () -> Unit,
) {
    val update = state.update ?: return
    val downloadedPath = state.downloadedApkPath
    val fraction = if (state.totalBytes > 0L) {
        (state.downloadedBytes.toFloat() / state.totalBytes.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val readableNotes = remember(update.releaseNotes) {
        readableMobileReleaseNotes(update.releaseNotes)
    }
    AlertDialog(
        onDismissRequest = { if (!state.downloading) onDismiss() },
        title = { Text("SPICE ${update.version} is available") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 430.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    when {
                        state.downloading -> "Downloading the signed Android update..."
                        downloadedPath != null -> "The signed update is ready. Android will ask you to confirm installation."
                        else -> "Do you want to update to the newest SPICE release?"
                    },
                )
                if (state.downloading) {
                    LinearProgressIndicator(
                        progress = { fraction },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        "${formatFileSize(state.downloadedBytes)} / ${formatFileSize(state.totalBytes)}",
                        color = SpiceTextMuted,
                        fontSize = 12.sp,
                    )
                }
                state.error?.let { error ->
                    Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                }
                readableNotes
                    .takeIf(String::isNotEmpty)
                    ?.let { notes ->
                        Text(
                            "Full changelog",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            "Scroll to read every change in this release.",
                            color = SpiceTextMuted,
                            fontSize = 12.sp,
                        )
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = SpiceSurfaceHigh,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                notes,
                                color = SpiceTextMuted,
                                fontSize = 12.sp,
                                lineHeight = 18.sp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                            )
                        }
                    }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    when {
                        state.downloading -> onCancelDownload()
                        downloadedPath != null -> onInstall(downloadedPath, update.version)
                        else -> onDownload()
                    }
                },
            ) {
                Text(
                    when {
                        state.downloading -> "Cancel download"
                        downloadedPath != null -> "Install update"
                        state.error != null -> "Retry download"
                        else -> "Download update"
                    },
                )
            }
        },
        dismissButton = if (state.downloading) {
            null
        } else {
            {
                Row {
                    if (state.error != null) {
                        TextButton(onClick = onOpenReleasePage) { Text("Official release") }
                    }
                    TextButton(onClick = onDismiss) { Text("Later") }
                }
            }
        },
    )
}

private fun formatFileSize(bytes: Long): String = when {
    bytes <= 0L -> "0 MB"
    bytes >= 1024L * 1024L -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    bytes >= 1024L -> String.format("%.1f KB", bytes / 1024.0)
    else -> "$bytes B"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SpiceTopBar(
    uiState: SpiceUiState,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit,
) {
    TopAppBar(
        title = {
            Column {
                Text("SPICE MUSIC", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(uiState.screen.label, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            }
        },
        actions = {
            RoundTopAction(
                onClick = onNotificationsClick,
                showDot = uiState.pendingAccountInvites.isNotEmpty() || uiState.downloadTrackId != null,
                contentDescription = "Notifications",
            ) {
                Icon(Icons.Rounded.Notifications, null, tint = Color.White)
            }
            ProfileAvatarButton(uiState, onProfileClick)
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = SpiceBackground),
    )
}

@Composable
private fun RoundTopAction(
    onClick: () -> Unit,
    showDot: Boolean,
    contentDescription: String,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = Modifier.padding(end = 8.dp).size(42.dp).clickable { onClick() },
        shape = CircleShape,
        color = SpiceSurfaceHigh,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.1f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            content()
            if (showDot) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(9.dp),
                ) {}
            }
        }
    }
}

@Composable
private fun ProfileAvatarButton(uiState: SpiceUiState, onClick: () -> Unit) {
    val session = uiState.accountSession
    val profile = uiState.profileSummary?.profile
    val avatarUrl = profile?.avatarUrl?.takeIf { it.isNotBlank() } ?: session?.account?.avatarUrl
    val displayName = profile?.displayName?.takeIf { it.isNotBlank() }
        ?: session?.account?.displayName?.takeIf { it.isNotBlank() }
        ?: session?.account?.email?.substringBefore("@")
    val initials = profileInitials(displayName ?: session?.account?.email, session?.account?.id)
    val borderColor = if (session == null) SpiceTextMuted.copy(alpha = 0.45f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)

    Surface(
        modifier = Modifier.padding(end = 12.dp).size(42.dp).clickable { onClick() },
        shape = CircleShape,
        color = SpiceSurfaceHigh,
        border = BorderStroke(1.dp, borderColor),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = displayName ?: "Profile",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                )
            } else {
                Surface(shape = CircleShape, color = if (session == null) SpiceSurface else MaterialTheme.colorScheme.primary, modifier = Modifier.fillMaxSize()) {
                Box(contentAlignment = Alignment.Center) {
                        Text(initials, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

private fun profileInitials(email: String?, id: String?): String {
    val source = email?.takeIf { it.isNotBlank() } ?: id.orEmpty()
    val base = source.substringBefore("@").replace(Regex("""[^A-Za-z0-9]+"""), " ").trim()
    return base
        .split(Regex("""\s+"""))
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifBlank { "S" }
        .take(2)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileSheet(
    uiState: SpiceUiState,
    onDismiss: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val session = uiState.accountSession
    val profile = uiState.profileSummary?.profile
    val displayName = profile?.displayName?.takeIf { it.isNotBlank() }
        ?: session?.account?.displayName?.takeIf { it.isNotBlank() }
        ?: session?.account?.email?.substringBefore("@")
        ?: "Spice Listener"
    val username = profile?.username?.takeIf { it.isNotBlank() }
        ?: session?.account?.username?.takeIf { it.isNotBlank() }
    val avatarUrl = profile?.avatarUrl?.takeIf { it.isNotBlank() } ?: session?.account?.avatarUrl
    val stats = uiState.profileSummary?.stats

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = SpiceSurface) {
        LazyColumn(
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(72.dp)) {
                        if (!avatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = avatarUrl,
                                contentDescription = displayName,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize().clip(CircleShape),
                            )
                        } else {
                            Box(contentAlignment = Alignment.Center) {
                                Text(profileInitials(displayName, session?.account?.id), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                            }
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text(displayName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(username?.let { "@$it" } ?: session?.account?.email.orEmpty(), color = SpiceTextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (uiState.profileLoading) {
                            Text("Refreshing profile...", color = SpiceTextMuted, fontSize = 12.sp)
                        }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ProfileStatCard("Played", (stats?.songsPlayed ?: uiState.historyTracks.size).toString(), Modifier.weight(1f))
                    ProfileStatCard("Liked", (stats?.likedCount ?: uiState.likedTracks.size).toString(), Modifier.weight(1f))
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ProfileStatCard("Playlists", (stats?.playlistsCount ?: uiState.playlists.size).toString(), Modifier.weight(1f))
                    ProfileStatCard("Downloads", uiState.downloads.size.toString(), Modifier.weight(1f))
                }
            }
            if (!profile?.bio.isNullOrBlank()) {
                item {
                    Text(profile.bio, color = SpiceTextMuted)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = onEditProfile, enabled = session != null, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.Edit, null)
                        Text("Edit", modifier = Modifier.padding(start = 8.dp))
                    }
                    TextButton(onClick = onOpenSettings, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.Settings, null)
                        Text("Account", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
            item {
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("Close")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileEditorSheet(
    uiState: SpiceUiState,
    onDismiss: () -> Unit,
    onDisplayNameChanged: (String) -> Unit,
    onUsernameChanged: (String) -> Unit,
    onAvatarUrlChanged: (String) -> Unit,
    onBioChanged: (String) -> Unit,
    onPrivateChanged: (Boolean) -> Unit,
    onSave: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = Modifier.imePadding(),
        containerColor = SpiceSurface,
    ) {
        LazyColumn(
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text("Edit Spice profile", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Saved to your Spice account profile.", color = SpiceTextMuted, fontSize = 13.sp)
            }
            item {
                OutlinedTextField(
                    value = uiState.profileEditDisplayName,
                    onValueChange = onDisplayNameChanged,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Display name") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(8.dp),
                )
            }
            item {
                OutlinedTextField(
                    value = uiState.profileEditUsername,
                    onValueChange = onUsernameChanged,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Username") },
                    supportingText = { Text("3-20 letters, numbers, or underscores.") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(8.dp),
                )
            }
            item {
                OutlinedTextField(
                    value = uiState.profileEditAvatarUrl,
                    onValueChange = onAvatarUrlChanged,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Profile picture URL") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(8.dp),
                )
            }
            item {
                OutlinedTextField(
                    value = uiState.profileEditBio,
                    onValueChange = onBioChanged,
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 4,
                    label = { Text("Bio") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSave() }),
                    shape = RoundedCornerShape(8.dp),
                )
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Private profile", fontWeight = FontWeight.SemiBold)
                        Text("Hide bio, stats, and playlists from other listeners.", color = SpiceTextMuted, fontSize = 12.sp)
                    }
                    Switch(checked = uiState.profileEditPrivate, onCheckedChange = onPrivateChanged)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TextButton(onClick = onDismiss, enabled = !uiState.profileEditLoading, modifier = Modifier.weight(1f)) {
                        Text("Cancel")
                    }
                    Button(onClick = onSave, enabled = !uiState.profileEditLoading, modifier = Modifier.weight(1f)) {
                        if (uiState.profileEditLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Rounded.Check, null)
                        }
                        Text("Save", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileStatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Text(label, color = SpiceTextMuted, fontSize = 12.sp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationsSheet(
    uiState: SpiceUiState,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit,
    onAcceptPendingInvite: (PendingPlaylistInvite) -> Unit,
    onRejectPendingInvite: (PendingPlaylistInvite) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = SpiceSurface) {
        LazyColumn(
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text("Notifications", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            if (uiState.downloadTrackId != null) {
                item {
                    StatusNotice("Download", uiState.downloadProgress ?: "Preparing download...")
                }
            }
            if (uiState.pendingAccountInvites.isEmpty() && uiState.downloadTrackId == null) {
                item { Text("No notifications right now.", color = SpiceTextMuted) }
            }
            items(uiState.pendingAccountInvites, key = { it.playlistId }) { invite ->
                Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(invite.playlistTitle, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Playlist invite from ${invite.ownerDisplayName.ifBlank { invite.ownerUsername.ifBlank { invite.ownerId } }}", color = SpiceTextMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { onRejectPendingInvite(invite) }, modifier = Modifier.weight(1f), enabled = !uiState.accountInvitesLoading) {
                                Icon(Icons.Rounded.Close, null)
                                Text("Reject", modifier = Modifier.padding(start = 6.dp))
                            }
                            Button(onClick = { onAcceptPendingInvite(invite) }, modifier = Modifier.weight(1f), enabled = !uiState.accountInvitesLoading) {
                                Icon(Icons.Rounded.Check, null)
                                Text("Accept", modifier = Modifier.padding(start = 6.dp))
                            }
                        }
                    }
                }
            }
            item {
                TextButton(onClick = onOpenSettings, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.Settings, null)
                    Text("Open account settings", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusNotice(title: String, body: String) {
    Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh)) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(body, color = SpiceTextMuted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun HomeScreen(
    uiState: SpiceUiState,
    contentPadding: PaddingValues,
    onTrackSelected: (Track, List<Track>) -> Unit,
    onSearch: (String) -> Unit,
    onRetry: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 20.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item {
            Column(Modifier.padding(horizontal = 18.dp)) {
                Text("Welcome back", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Native playback, your library, and Spice Connect-ready foundations.", color = SpiceTextMuted)
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Pop Hits", "Lofi Chill", "Workout").forEach { category ->
                        AssistChip(onClick = { onSearch(category) }, label = { Text(category) })
                    }
                }
            }
        }

        if (uiState.historyTracks.isNotEmpty()) {
            item { TrackSection(FeedSection("Recently Played", uiState.historyTracks.take(10)), onTrackSelected) }
        }

        if (uiState.homeLoading) {
            item {
                Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }
        } else if (uiState.homeSections.isEmpty()) {
            item {
                EmptyState("Home feed unavailable", "Retry the Spice search API.", onRetry)
            }
        } else {
            items(uiState.homeSections, key = { it.title }) { section ->
                TrackSection(section, onTrackSelected)
            }
        }
    }
}

@Composable
private fun ProviderBadge(label: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = SpiceSurfaceHigh,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.1f)),
    ) {
        Text(label, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), fontSize = 13.sp)
    }
}

@Composable
private fun TrackSection(section: FeedSection, onTrackSelected: (Track, List<Track>) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            section.title,
            modifier = Modifier.padding(horizontal = 18.dp),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(section.tracks, key = { section.title + it.id }) { track ->
                TrackCard(track) { selected -> onTrackSelected(selected, section.tracks) }
            }
        }
    }
}

@Composable
private fun TrackCard(track: Track, onTrackSelected: (Track) -> Unit) {
    Column(
        modifier = Modifier.width(148.dp).clickable { onTrackSelected(track) },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            AsyncImage(
                model = track.artworkUrl,
                contentDescription = track.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)),
            )
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp).size(36.dp),
            ) {
                Icon(Icons.Rounded.PlayArrow, null, modifier = Modifier.padding(8.dp), tint = Color.White)
            }
        }
        Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
        Text(trackSubtitle(track), maxLines = 1, overflow = TextOverflow.Ellipsis, color = SpiceTextMuted, fontSize = 13.sp)
    }
}

@Composable
private fun SearchScreen(
    uiState: SpiceUiState,
    contentPadding: PaddingValues,
    onQueryChanged: (String) -> Unit,
    onSearch: (String) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 18.dp,
            end = 18.dp,
            top = contentPadding.calculateTopPadding() + 10.dp,
            bottom = contentPadding.calculateBottomPadding() + 20.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = onQueryChanged,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Search Spice Music") },
                leadingIcon = { Icon(Icons.Rounded.Search, null) },
                trailingIcon = {
                    IconButton(onClick = { onSearch(uiState.searchQuery) }, enabled = uiState.searchQuery.isNotBlank()) {
                        Icon(Icons.Rounded.Search, "Search")
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch(uiState.searchQuery) }),
                shape = RoundedCornerShape(8.dp),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProviderBadge("Hybrid")
                ProviderBadge("YouTube + SoundCloud")
            }
        }
        if (uiState.searchResults.isEmpty() && !uiState.searchLoading) {
            item {
                Text("Browse", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Pop Hits", "Hip-Hop", "Rock Charts", "Lofi Chill", "Electronic", "Jazz Beats")
                        .chunked(2)
                        .forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { category ->
                                    Card(
                                        onClick = { onSearch(category) },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(8.dp),
                                        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
                                    ) {
                                        Text(category, modifier = Modifier.padding(18.dp), fontWeight = FontWeight.SemiBold)
                                    }
                                }
                                if (row.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                }
            }
        }
        if (uiState.searchLoading) {
            item { Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        } else {
            items(uiState.searchResults, key = { it.id }) { track ->
                TrackRow(track) { selected -> onTrackSelected(selected, uiState.searchResults) }
            }
        }
    }
}

@Composable
private fun LibraryScreen(
    uiState: SpiceUiState,
    contentPadding: PaddingValues,
    onTabSelected: (LibraryTab) -> Unit,
    onCreatePlaylist: () -> Unit,
    onAddCurrentTrackToPlaylist: (String) -> Unit,
    onSharePlaylist: (Playlist) -> Unit,
    onOpenPlaylistMembers: (Playlist) -> Unit,
    onCancelDownload: () -> Unit,
    onOpenDownload: (DownloadedTrack) -> Unit,
    onShareDownload: (DownloadedTrack) -> Unit,
    onRemoveDownload: (DownloadedTrack) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
    onDownloadPlaylist: (Playlist) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = contentPadding.calculateTopPadding()),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Your Library", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            FilledIconButton(onClick = onCreatePlaylist) { Icon(Icons.Rounded.Add, "Create playlist") }
        }
        PrimaryTabRow(selectedTabIndex = uiState.libraryTab.ordinal, containerColor = SpiceBackground) {
            LibraryTab.entries.forEach { tab ->
                Tab(
                    selected = uiState.libraryTab == tab,
                    onClick = { onTabSelected(tab) },
                    text = { Text(tab.label) },
                )
            }
        }
        when (uiState.libraryTab) {
            LibraryTab.Playlists -> PlaylistList(
                playlists = uiState.playlists,
                currentTrack = uiState.currentTrack,
                bottomPadding = contentPadding.calculateBottomPadding(),
                onCreatePlaylist = onCreatePlaylist,
                onAddCurrentTrackToPlaylist = onAddCurrentTrackToPlaylist,
                onSharePlaylist = onSharePlaylist,
                onOpenPlaylistMembers = onOpenPlaylistMembers,
                onTrackSelected = onTrackSelected,
                sharingPlaylistId = uiState.sharingPlaylistId,
                downloadPlaylistId = uiState.downloadPlaylistId,
                downloadPlaylistCompleted = uiState.downloadPlaylistCompleted,
                downloadPlaylistTotal = uiState.downloadPlaylistTotal,
                onDownloadPlaylist = onDownloadPlaylist,
                onCancelDownload = onCancelDownload,
            )
            LibraryTab.Liked -> TrackList(uiState.likedTracks, contentPadding.calculateBottomPadding(), onTrackSelected, "No liked tracks")
            LibraryTab.History -> TrackList(uiState.historyTracks, contentPadding.calculateBottomPadding(), onTrackSelected, "No listening history")
            LibraryTab.Downloads -> DownloadList(
                downloads = uiState.downloads,
                activeTrackId = uiState.downloadTrackId,
                activeProgress = uiState.downloadProgress,
                bottomPadding = contentPadding.calculateBottomPadding(),
                onCancelDownload = onCancelDownload,
                onOpenDownload = onOpenDownload,
                onShareDownload = onShareDownload,
                onRemoveDownload = onRemoveDownload,
                onTrackSelected = onTrackSelected,
            )
        }
    }
}

@Composable
private fun PlaylistList(
    playlists: List<Playlist>,
    currentTrack: Track?,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onCreatePlaylist: () -> Unit,
    onAddCurrentTrackToPlaylist: (String) -> Unit,
    onSharePlaylist: (Playlist) -> Unit,
    onOpenPlaylistMembers: (Playlist) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
    sharingPlaylistId: String?,
    downloadPlaylistId: String?,
    downloadPlaylistCompleted: Int,
    downloadPlaylistTotal: Int,
    onDownloadPlaylist: (Playlist) -> Unit,
    onCancelDownload: () -> Unit,
) {
    if (playlists.isEmpty()) {
        EmptyState(
            title = "No playlists yet",
            body = "Create a local playlist, then sync it to your Spice account.",
            onAction = onCreatePlaylist,
            actionLabel = "Create playlist",
        )
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(18.dp, 12.dp, 18.dp, bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(playlists, key = { it.id }) { playlist ->
            PlaylistCard(
                playlist = playlist,
                currentTrack = currentTrack,
                onAddCurrentTrackToPlaylist = onAddCurrentTrackToPlaylist,
                onSharePlaylist = onSharePlaylist,
                onOpenPlaylistMembers = onOpenPlaylistMembers,
                onTrackSelected = onTrackSelected,
                sharing = sharingPlaylistId == playlist.id,
                downloading = downloadPlaylistId == playlist.id,
                downloadCompleted = downloadPlaylistCompleted,
                downloadTotal = downloadPlaylistTotal,
                onDownloadPlaylist = onDownloadPlaylist,
                onCancelDownload = onCancelDownload,
            )
        }
    }
}

@Composable
private fun PlaylistCard(
    playlist: Playlist,
    currentTrack: Track?,
    onAddCurrentTrackToPlaylist: (String) -> Unit,
    onSharePlaylist: (Playlist) -> Unit,
    onOpenPlaylistMembers: (Playlist) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
    sharing: Boolean,
    downloading: Boolean,
    downloadCompleted: Int,
    downloadTotal: Int,
    onDownloadPlaylist: (Playlist) -> Unit,
    onCancelDownload: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onOpenPlaylistMembers(playlist) },
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(playlist.title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${playlist.tracks.size} tracks" + if (playlist.shared) " - shared" else "",
                        color = SpiceTextMuted,
                        fontSize = 13.sp,
                    )
                }
            }
            val canInvite = !playlist.shared || playlist.shareRole == "owner"
            val canEditTracks = !playlist.shared || playlist.shareRole in setOf("owner", "editor")
            if (playlist.tracks.isNotEmpty()) {
                OutlinedButton(
                    onClick = { if (downloading) onCancelDownload() else onDownloadPlaylist(playlist) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(if (downloading) Icons.Rounded.Close else Icons.Rounded.Download, null)
                    Text(
                        if (downloading) "Stop $downloadCompleted/$downloadTotal" else "Download all ${playlist.tracks.size}",
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
            if ((currentTrack != null && canEditTracks) || canInvite || playlist.shared) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (currentTrack != null && canEditTracks) {
                        TextButton(
                            onClick = { onAddCurrentTrackToPlaylist(playlist.id) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Rounded.Add, null)
                            Text("Add", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (canInvite) {
                        TextButton(
                            onClick = { onSharePlaylist(playlist) },
                            enabled = !sharing,
                            modifier = Modifier.weight(1f),
                        ) {
                            if (sharing) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Rounded.Share, null)
                            }
                            Text(if (sharing) "Linking" else "Share", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                    if (playlist.shared || canInvite) {
                        TextButton(
                            onClick = { onOpenPlaylistMembers(playlist) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Rounded.Group, null)
                            Text("People", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                }
            }
            if (playlist.tracks.isEmpty()) {
                Text("Play a track, then add it here.", color = SpiceTextMuted, fontSize = 13.sp)
            } else {
                playlist.tracks.take(3).forEach { track ->
                    TrackRow(track) { selected -> onTrackSelected(selected, playlist.tracks) }
                }
            }
        }
    }
}

@Composable
private fun TrackList(
    tracks: List<Track>,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onTrackSelected: (Track, List<Track>) -> Unit,
    empty: String,
) {
    if (tracks.isEmpty()) {
        EmptyState(empty, "Play or like a track to add it here.", null)
    } else {
        LazyColumn(
            contentPadding = PaddingValues(18.dp, 12.dp, 18.dp, bottomPadding + 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(tracks, key = { it.id }) { track ->
                TrackRow(track) { selected -> onTrackSelected(selected, tracks) }
            }
        }
    }
}

@Composable
private fun Artwork(track: Track, modifier: Modifier) {
    AsyncImage(
        model = track.artworkUrl,
        contentDescription = track.title,
        contentScale = ContentScale.Crop,
        modifier = modifier.clip(RoundedCornerShape(6.dp)),
    )
}

@Composable
private fun DownloadList(
    downloads: List<DownloadedTrack>,
    activeTrackId: String?,
    activeProgress: String?,
    bottomPadding: androidx.compose.ui.unit.Dp,
    onCancelDownload: () -> Unit,
    onOpenDownload: (DownloadedTrack) -> Unit,
    onShareDownload: (DownloadedTrack) -> Unit,
    onRemoveDownload: (DownloadedTrack) -> Unit,
    onTrackSelected: (Track, List<Track>) -> Unit,
) {
    if (downloads.isEmpty() && activeTrackId == null) {
        EmptyState(
            title = "No downloads yet",
            body = "Use the full player or playlist download button. Files are saved in Music/Spice and play here without a connection.",
            onAction = null,
        )
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(18.dp, 12.dp, 18.dp, bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (activeTrackId != null) {
            item {
                ActiveDownloadCard(
                    progress = activeProgress.orEmpty(),
                    onCancelDownload = onCancelDownload,
                )
            }
        }
        items(downloads, key = { it.id }) { download ->
            DownloadCard(
                download = download,
                onOpenDownload = onOpenDownload,
                onShareDownload = onShareDownload,
                onRemoveDownload = onRemoveDownload,
                onPlay = { onTrackSelected(download.track, downloads.map { it.track }) },
            )
        }
    }
}

@Composable
private fun ActiveDownloadCard(
    progress: String,
    onCancelDownload: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp)
            Column(Modifier.weight(1f)) {
                Text("Download in progress", fontWeight = FontWeight.Bold)
                Text(progress.ifBlank { "Preparing download..." }, color = SpiceTextMuted, fontSize = 13.sp, maxLines = 2)
            }
            TextButton(onClick = onCancelDownload) {
                Icon(Icons.Rounded.Close, null)
                Text("Cancel", modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

@Composable
private fun DownloadCard(
    download: DownloadedTrack,
    onOpenDownload: (DownloadedTrack) -> Unit,
    onShareDownload: (DownloadedTrack) -> Unit,
    onRemoveDownload: (DownloadedTrack) -> Unit,
    onPlay: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onPlay),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Artwork(download.track, Modifier.size(54.dp))
                Column(Modifier.weight(1f)) {
                    Text(download.track.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(download.track.artist, color = SpiceTextMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(download.fileName + " - " + formatBytes(download.bytes), color = SpiceTextMuted, fontSize = 12.sp, maxLines = 1)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { onOpenDownload(download) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.AutoMirrored.Rounded.OpenInNew, null)
                    Text("Open", modifier = Modifier.padding(start = 6.dp))
                }
                TextButton(onClick = { onShareDownload(download) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Share, null)
                    Text("Share", modifier = Modifier.padding(start = 6.dp))
                }
                IconButton(onClick = { onRemoveDownload(download) }) {
                    Icon(Icons.Rounded.Delete, "Remove download")
                }
            }
        }
    }
}

@Composable
private fun TrackRow(track: Track, onTrackSelected: (Track) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onTrackSelected(track) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = track.artworkUrl,
            contentDescription = track.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(58.dp).clip(RoundedCornerShape(6.dp)),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
            Text(trackSubtitle(track), maxLines = 1, overflow = TextOverflow.Ellipsis, color = SpiceTextMuted, fontSize = 13.sp)
        }
        IconButton(onClick = { onTrackSelected(track) }) { Icon(Icons.Rounded.PlayArrow, "Play ${track.title}") }
    }
}

@Composable
private fun SettingsScreen(
    uiState: SpiceUiState,
    contentPadding: PaddingValues,
    onAuthModeSelected: (AuthMode) -> Unit,
    onAuthEmailChanged: (String) -> Unit,
    onAuthPasswordChanged: (String) -> Unit,
    onAuthUsernameChanged: (String) -> Unit,
    onSubmitAccount: () -> Unit,
    onAuthVerificationCodeChanged: (String) -> Unit,
    onSubmitEmailVerification: () -> Unit,
    onResendEmailVerification: () -> Unit,
    onCancelEmailVerification: () -> Unit,
    onPairingCodeChanged: (String) -> Unit,
    onClaimPairingCode: () -> Unit,
    onDisconnectPairedDevice: () -> Unit,
    onSignOut: () -> Unit,
    onAccentSelected: (AccentTheme) -> Unit,
    onQualitySelected: (StreamQuality) -> Unit,
    onSearchProviderSelected: (SearchProvider) -> Unit,
    onCrossfadeDurationSelected: (Long) -> Unit,
    onSmartQueueEnabled: (Boolean) -> Unit,
    onOpenProfileEditor: () -> Unit,
    onSyncNow: () -> Unit,
    onSpiceConnectEnabled: (Boolean) -> Unit,
    onRefreshPendingInvites: () -> Unit,
    onAcceptPendingInvite: (PendingPlaylistInvite) -> Unit,
    onRejectPendingInvite: (PendingPlaylistInvite) -> Unit,
    onTestEngine: () -> Unit,
) {
    var selectedTab by remember { mutableStateOf(SettingsTab.General) }

    LazyColumn(
        contentPadding = PaddingValues(
            start = 18.dp,
            end = 18.dp,
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 20.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(SettingsTab.entries) { tab ->
                    AssistChip(
                        onClick = { selectedTab = tab },
                        label = { Text(tab.label, maxLines = 1) },
                        leadingIcon = if (selectedTab == tab) {
                            { Icon(Icons.Rounded.Check, null, Modifier.size(16.dp)) }
                        } else {
                            null
                        },
                    )
                }
            }
        }
        when (selectedTab) {
            SettingsTab.General -> {
                item {
                    AccentSection(
                        selected = uiState.accentTheme,
                        onSelected = onAccentSelected,
                    )
                }
                item { HorizontalDivider() }
                item {
                    SearchProviderSection(
                        selected = uiState.searchProvider,
                        onSelected = onSearchProviderSelected,
                    )
                }
                item { HorizontalDivider() }
                item {
                    AccountSection(
                        uiState = uiState,
                        onAuthModeSelected = onAuthModeSelected,
                        onAuthEmailChanged = onAuthEmailChanged,
                        onAuthPasswordChanged = onAuthPasswordChanged,
                        onAuthUsernameChanged = onAuthUsernameChanged,
                        onSubmitAccount = onSubmitAccount,
                        onAuthVerificationCodeChanged = onAuthVerificationCodeChanged,
                        onSubmitEmailVerification = onSubmitEmailVerification,
                        onResendEmailVerification = onResendEmailVerification,
                        onCancelEmailVerification = onCancelEmailVerification,
                        onSignOut = onSignOut,
                        onOpenProfileEditor = onOpenProfileEditor,
                        onSyncNow = onSyncNow,
                        onRefreshPendingInvites = onRefreshPendingInvites,
                        onAcceptPendingInvite = onAcceptPendingInvite,
                        onRejectPendingInvite = onRejectPendingInvite,
                    )
                }
                item { HorizontalDivider() }
                item {
                    SpiceConnectAvailabilitySection(
                        uiState = uiState,
                        onEnabledChange = onSpiceConnectEnabled,
                    )
                }
                item { HorizontalDivider() }
                item {
                    SecurePairingSection(
                        uiState = uiState,
                        onPairingCodeChanged = onPairingCodeChanged,
                        onClaimPairingCode = onClaimPairingCode,
                        onDisconnectPairedDevice = onDisconnectPairedDevice,
                    )
                }
                if (BuildConfig.DEBUG) {
                    item { HorizontalDivider() }
                    item {
                        Button(onClick = onTestEngine, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Rounded.PlayArrow, null)
                            Text("Test native audio", modifier = Modifier.padding(start = 8.dp))
                        }
                        Text(
                            "Plays a bundled 30-second test tone through Media3.",
                            color = SpiceTextMuted,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            }
            SettingsTab.Playback -> item {
                PlaybackSettingsSection(
                    uiState = uiState,
                    onQualitySelected = onQualitySelected,
                    onCrossfadeDurationSelected = onCrossfadeDurationSelected,
                    onSmartQueueEnabled = onSmartQueueEnabled,
                )
            }
            SettingsTab.Terms -> item { TermsSection() }
            SettingsTab.Licenses -> item { LicenseSection() }
        }
    }
}

@Composable
private fun SearchProviderSection(
    selected: SearchProvider,
    onSelected: (SearchProvider) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Rounded.Search, null)
            Text("Search sources", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Text(
            "Choose whether music searches combine providers or stay on YouTube or SoundCloud.",
            color = SpiceTextMuted,
            fontSize = 13.sp,
        )
        SearchProvider.entries.forEach { provider ->
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onSelected(provider) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = selected == provider, onClick = { onSelected(provider) })
                Text(provider.label, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun PlaybackSettingsSection(
    uiState: SpiceUiState,
    onQualitySelected: (StreamQuality) -> Unit,
    onCrossfadeDurationSelected: (Long) -> Unit,
    onSmartQueueEnabled: (Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Rounded.Album, null)
            Text("Playback", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Text(
            "Mobile-safe versions of SPICE's desktop playback controls. These settings stay on this phone and apply immediately.",
            color = SpiceTextMuted,
            fontSize = 13.sp,
        )

        Card(colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh)) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Audio quality", fontWeight = FontWeight.Bold)
                Text("Choose the best available stream or reduce mobile data use.", color = SpiceTextMuted, fontSize = 12.sp)
                StreamQuality.entries.forEach { quality ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onQualitySelected(quality) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = uiState.quality == quality, onClick = { onQualitySelected(quality) })
                        Column(Modifier.weight(1f)) {
                            Text(quality.label, fontWeight = FontWeight.SemiBold, maxLines = 1)
                            Text(
                                when (quality) {
                                    StreamQuality.High -> "Best available bitrate"
                                    StreamQuality.Standard -> "Balanced quality and reliability"
                                    StreamQuality.DataSaver -> "Lowest available bitrate"
                                },
                                color = SpiceTextMuted,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh)) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Smart queue", fontWeight = FontWeight.Bold)
                        Text(
                            "Keep playing your Recommended Next mix after the current queue ends.",
                            color = SpiceTextMuted,
                            fontSize = 12.sp,
                        )
                    }
                    Switch(checked = uiState.smartQueueEnabled, onCheckedChange = onSmartQueueEnabled)
                }
                HorizontalDivider()
                Text("Crossfade transition", fontWeight = FontWeight.Bold)
                Text(
                    "Overlaps the end of one locally played queue track with the next. It uses weighted shuffle too, but safely falls back to an exact cut for Spice Connect, repeat-one, unknown durations, or tracks that cannot be prepared in time.",
                    color = SpiceTextMuted,
                    fontSize = 12.sp,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf(0L, 3_000L, 5_000L, 8_000L, 12_000L)) { durationMs ->
                        val selected = uiState.crossfadeDurationMs == durationMs
                        AssistChip(
                            onClick = { onCrossfadeDurationSelected(durationMs) },
                            label = { Text(if (durationMs == 0L) "Off" else "${durationMs / 1_000}s") },
                            leadingIcon = if (selected) ({ Icon(Icons.Rounded.Check, null, Modifier.size(16.dp)) }) else null,
                        )
                    }
                }
            }
        }

    }
}

@Composable
private fun AccentSection(selected: AccentTheme, onSelected: (AccentTheme) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Rounded.Palette, null)
            Text("Global Accent Colors", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Text(
            "Select a dynamic accent theme for highlights, controls, and your home-screen app icon.",
            color = SpiceTextMuted,
            fontSize = 13.sp,
        )
        AccentTheme.entries.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { theme ->
                    AccentCard(
                        theme = theme,
                        selected = selected == theme,
                        onSelected = onSelected,
                        modifier = Modifier.weight(1f),
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun AccentCard(
    theme: AccentTheme,
    selected: Boolean,
    onSelected: (AccentTheme) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = { onSelected(theme) },
        modifier = modifier.height(64.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Black),
        border = BorderStroke(
            width = if (selected) 2.dp else 1.dp,
            color = if (selected) theme.toColor() else Color.White.copy(alpha = 0.08f),
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = theme.toColor(),
                modifier = Modifier.size(28.dp),
                shadowElevation = if (selected) 8.dp else 0.dp,
            ) {}
            Text(theme.label, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
    }
}

@Composable
private fun SpiceConnectAvailabilitySection(
    uiState: SpiceUiState,
    onEnabledChange: (Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Spice Connect",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "Off by default. Enable it only when you want this phone to appear as a receiver or control another Spice device.",
                    color = SpiceTextMuted,
                    fontSize = 13.sp,
                )
            }
            Switch(
                checked = uiState.spiceConnectEnabled,
                onCheckedChange = onEnabledChange,
            )
        }
    }
}

@Composable
private fun AccountSection(
    uiState: SpiceUiState,
    onAuthModeSelected: (AuthMode) -> Unit,
    onAuthEmailChanged: (String) -> Unit,
    onAuthPasswordChanged: (String) -> Unit,
    onAuthUsernameChanged: (String) -> Unit,
    onSubmitAccount: () -> Unit,
    onAuthVerificationCodeChanged: (String) -> Unit,
    onSubmitEmailVerification: () -> Unit,
    onResendEmailVerification: () -> Unit,
    onCancelEmailVerification: () -> Unit,
    onSignOut: () -> Unit,
    onOpenProfileEditor: () -> Unit,
    onSyncNow: () -> Unit,
    onRefreshPendingInvites: () -> Unit,
    onAcceptPendingInvite: (PendingPlaylistInvite) -> Unit,
    onRejectPendingInvite: (PendingPlaylistInvite) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Spice account", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        val session = uiState.accountSession

        if (session != null) {
            StatusRow("Signed in", session.account.email.ifBlank { session.account.id }, SpiceCyan)
            StatusRow("Cloud sync", if (uiState.syncLoading) "Syncing" else "Ready", SpiceCyan)
            uiState.lastSync?.let { summary ->
                Text(
                    "Synced ${summary.likedCount} liked tracks, ${summary.historyCount} history items, and ${summary.playlistCount} playlists.",
                    color = SpiceTextMuted,
                    fontSize = 13.sp,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onSyncNow, enabled = !uiState.syncLoading && !uiState.accountLoading, modifier = Modifier.weight(1f)) {
                    if (uiState.syncLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Rounded.Refresh, null)
                    }
                    Text("Sync", modifier = Modifier.padding(start = 8.dp))
                }
                TextButton(onClick = onSignOut, enabled = !uiState.syncLoading && !uiState.accountLoading) {
                    Text("Sign out")
                }
            }
            TextButton(onClick = onOpenProfileEditor, enabled = !uiState.profileEditLoading, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Rounded.Edit, null)
                Text("Edit Spice profile", modifier = Modifier.padding(start = 8.dp))
            }
            PendingInviteSection(
                invites = uiState.pendingAccountInvites,
                loading = uiState.accountInvitesLoading,
                onRefresh = onRefreshPendingInvites,
                onAccept = onAcceptPendingInvite,
                onReject = onRejectPendingInvite,
            )
            return
        }

        val verification = uiState.emailVerification
        if (verification != null) {
            Text(
                "Enter the six-digit code sent to ${verification.email}. The code expires after 10 minutes.",
                color = SpiceTextMuted,
                fontSize = 13.sp,
            )
            OutlinedTextField(
                value = uiState.authVerificationCode,
                onValueChange = onAuthVerificationCodeChanged,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Verification code") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onSubmitEmailVerification() }),
                shape = RoundedCornerShape(8.dp),
            )
            Button(
                onClick = onSubmitEmailVerification,
                enabled = !uiState.accountLoading && uiState.authVerificationCode.length == 6,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (uiState.accountLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Rounded.Check, null)
                }
                Text("Verify and sign in", modifier = Modifier.padding(start = 8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onResendEmailVerification,
                    enabled = !uiState.accountLoading,
                    modifier = Modifier.weight(1f),
                ) { Text("Resend code") }
                TextButton(
                    onClick = onCancelEmailVerification,
                    enabled = !uiState.accountLoading,
                    modifier = Modifier.weight(1f),
                ) { Text("Start again") }
            }
            return
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AuthMode.entries.forEach { mode ->
                if (uiState.authMode == mode) {
                    Button(onClick = { onAuthModeSelected(mode) }, modifier = Modifier.weight(1f)) {
                        Text(mode.label)
                    }
                } else {
                    TextButton(onClick = { onAuthModeSelected(mode) }, modifier = Modifier.weight(1f)) {
                        Text(mode.label)
                    }
                }
            }
        }
        OutlinedTextField(
            value = uiState.authEmail,
            onValueChange = onAuthEmailChanged,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            shape = RoundedCornerShape(8.dp),
        )
        if (uiState.authMode == AuthMode.SignUp) {
            OutlinedTextField(
                value = uiState.authUsername,
                onValueChange = onAuthUsernameChanged,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Username") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                shape = RoundedCornerShape(8.dp),
            )
        }
        OutlinedTextField(
            value = uiState.authPassword,
            onValueChange = onAuthPasswordChanged,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSubmitAccount() }),
            shape = RoundedCornerShape(8.dp),
        )
        Button(
            onClick = onSubmitAccount,
            enabled = !uiState.accountLoading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (uiState.accountLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Rounded.LibraryMusic, null)
            }
            Text(uiState.authMode.label, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun SecurePairingSection(
    uiState: SpiceUiState,
    onPairingCodeChanged: (String) -> Unit,
    onClaimPairingCode: () -> Unit,
    onDisconnectPairedDevice: () -> Unit,
) {
    val credential = uiState.pairedDeviceCredential
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Devices, null, tint = SpiceCyan)
            Text(
                "Secure phone pairing",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        if (credential != null) {
            StatusRow("Paired", credential.displayName, SpiceCyan)
            Text("Owner: ${credential.ownerUserId}", color = SpiceTextMuted, fontSize = 13.sp)
            Text("Authorization: ${credential.authorizationId}", color = SpiceTextMuted, fontSize = 13.sp)
            Text("Device: ${credential.deviceId}", color = SpiceTextMuted, fontSize = 13.sp)
            Text("Expires: ${credential.expiresAt}", color = SpiceTextMuted, fontSize = 13.sp)
            Text(
                "This scoped credential is stored separately from your Spice account session and is removed automatically if the server rejects or expires it.",
                color = SpiceTextMuted,
                fontSize = 13.sp,
            )
            TextButton(
                onClick = onDisconnectPairedDevice,
                enabled = !uiState.pairingLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Rounded.Delete, null)
                Text("Remove pairing from this phone", modifier = Modifier.padding(start = 8.dp))
            }
        } else {
            Text(
                "Create a phone code on an already signed-in Spice device, then enter it here. Codes expire after five minutes.",
                color = SpiceTextMuted,
                fontSize = 13.sp,
            )
            StablePairingCodeField(
                value = uiState.pairingCode,
                onValueChange = onPairingCodeChanged,
                onDone = onClaimPairingCode,
            )
            Button(
                onClick = onClaimPairingCode,
                enabled = !uiState.pairingLoading && isCompleteSpiceConnectPairingCode(uiState.pairingCode),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (uiState.pairingLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Rounded.Devices, null)
                }
                Text("Pair this phone", modifier = Modifier.padding(start = 8.dp))
            }
            Text(
                "Pairing grants only Spice Connect device access for 30 days. It does not sign this phone into the owner's cloud account.",
                color = SpiceTextMuted,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun StablePairingCodeField(
    value: String,
    onValueChange: (String) -> Unit,
    onDone: () -> Unit,
) {
    var editValue by remember {
        val normalized = normalizeSpiceConnectPairingCodeInput(value)
        mutableStateOf(TextFieldValue(normalized, TextRange(normalized.length)))
    }
    LaunchedEffect(value) {
        val normalized = normalizeSpiceConnectPairingCodeInput(value)
        if (normalized != editValue.text) {
            editValue = TextFieldValue(normalized, TextRange(normalized.length))
        }
    }
    OutlinedTextField(
        value = editValue,
        onValueChange = { proposed ->
            val sanitized = sanitizeSpiceConnectPairingCodeEdit(
                value = proposed.text,
                selectionStart = proposed.selection.start,
                selectionEnd = proposed.selection.end,
            )
            editValue = TextFieldValue(
                text = sanitized.text,
                selection = TextRange(sanitized.selectionStart, sanitized.selectionEnd),
            )
            onValueChange(sanitized.text)
        },
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Pairing code" },
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
        visualTransformation = StablePairingCodeVisualTransformation,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Done,
        ),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        shape = RoundedCornerShape(8.dp),
    )
}

private object StablePairingCodeVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val normalizedLength = normalizeSpiceConnectPairingCodeInput(text.text).length
        return TransformedText(
            text = AnnotatedString(formatSpiceConnectPairingCodeInput(text.text)),
            offsetMapping = object : OffsetMapping {
                override fun originalToTransformed(offset: Int): Int {
                    val safeOffset = offset.coerceIn(0, normalizedLength)
                    return if (safeOffset <= 4) safeOffset else safeOffset + 1
                }

                override fun transformedToOriginal(offset: Int): Int {
                    val rawOffset = if (offset.coerceAtLeast(0) <= 4) offset else offset - 1
                    return rawOffset.coerceIn(0, normalizedLength)
                }
            },
        )
    }
}

@Composable
private fun PendingInviteSection(
    invites: List<PendingPlaylistInvite>,
    loading: Boolean,
    onRefresh: () -> Unit,
    onAccept: (PendingPlaylistInvite) -> Unit,
    onReject: (PendingPlaylistInvite) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Playlist invites", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = onRefresh, enabled = !loading) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Rounded.Refresh, null)
                }
                Text("Refresh", modifier = Modifier.padding(start = 6.dp))
            }
        }
        if (invites.isEmpty() && !loading) {
            Text("No pending playlist invites.", color = SpiceTextMuted, fontSize = 13.sp)
        }
        invites.forEach { invite ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(invite.playlistTitle, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "From ${invite.ownerDisplayName.ifBlank { invite.ownerUsername.ifBlank { invite.ownerId } }}",
                        color = SpiceTextMuted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { onReject(invite) }, enabled = !loading, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Rounded.Close, null)
                            Text("Reject", modifier = Modifier.padding(start = 6.dp))
                        }
                        Button(onClick = { onAccept(invite) }, enabled = !loading, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Rounded.Check, null)
                            Text("Accept", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistInviteDialog(
    preview: PlaylistInvitePreview,
    signedIn: Boolean,
    loading: Boolean,
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Playlist invite") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(preview.playlist.title, fontWeight = FontWeight.Bold)
                Text("${preview.playlist.tracks.size} tracks", color = SpiceTextMuted)
                if (preview.role.isNotBlank()) {
                    Text("Role: ${preview.role}", color = SpiceTextMuted, fontSize = 13.sp)
                }
                if (!signedIn) {
                    Text("Sign in to your Spice account before accepting.", color = SpiceTextMuted, fontSize = 13.sp)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = if (signedIn) onAccept else onOpenSettings,
                enabled = !loading,
            ) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Rounded.Check, null)
                }
                Text(if (signedIn) "Accept" else "Sign in", modifier = Modifier.padding(start = 6.dp))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !loading) {
                Text("Close")
            }
        },
        containerColor = SpiceSurface,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlaylistMembersSheet(
    playlist: Playlist,
    members: PlaylistMembersSummary?,
    sharedTracks: SharedPlaylistTracks?,
    currentUserId: String,
    inviteUsername: String,
    loading: Boolean,
    actionLoading: Boolean,
    trackActionLoading: Boolean,
    onDismiss: () -> Unit,
    onInviteUsernameChanged: (String) -> Unit,
    onInvite: () -> Unit,
    onRemoveMember: (String) -> Unit,
    onLeave: () -> Unit,
    onRemoveTrack: (SharedPlaylistTrack) -> Unit,
    onRefreshTracks: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isOwner = !playlist.shared || playlist.shareRole == "owner"
    val canEditTracks = sharedTracks?.role in setOf("owner", "editor")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = SpiceSurface,
    ) {
        LazyColumn(
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text("Manage playlist", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(playlist.title, color = SpiceTextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (loading || members == null) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 3.dp)
                        Text("Loading members...", color = SpiceTextMuted, fontSize = 13.sp)
                    }
                }
            } else {
                item {
                    Text(
                        "${members.members.size}/${members.maxMembers} invited members",
                        color = SpiceTextMuted,
                        fontSize = 13.sp,
                    )
                }
                item {
                    PlaylistMemberRow(member = members.owner, label = "Owner", actionLoading = actionLoading)
                }
                if (members.members.isEmpty()) {
                    item {
                        Text("No other members yet.", color = SpiceTextMuted, fontSize = 13.sp)
                    }
                } else {
                    items(members.members, key = { it.userId }) { member ->
                        PlaylistMemberRow(
                            member = member,
                            label = member.role.ifBlank { "Member" },
                            actionLoading = actionLoading,
                            onRemove = if (isOwner) {
                                { onRemoveMember(member.userId) }
                            } else {
                                null
                            },
                        )
                    }
                }
            }
            item { HorizontalDivider() }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Tracks", fontWeight = FontWeight.Bold)
                        Text(
                            "${sharedTracks?.tracks?.size ?: playlist.tracks.size} tracks",
                            color = SpiceTextMuted,
                            fontSize = 13.sp,
                        )
                    }
                    TextButton(onClick = onRefreshTracks, enabled = !trackActionLoading) {
                        if (trackActionLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Rounded.Refresh, null)
                        }
                        Text("Refresh", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
            if (sharedTracks == null) {
                item {
                    Text("No track details are loaded yet.", color = SpiceTextMuted, fontSize = 13.sp)
                }
            } else if (sharedTracks.tracks.isEmpty()) {
                item {
                    Text("No tracks in this playlist yet.", color = SpiceTextMuted, fontSize = 13.sp)
                }
            } else {
                items(sharedTracks.tracks, key = { it.position }) { sharedTrack ->
                    val canRemoveTrack = sharedTracks.role == "owner" ||
                        (sharedTracks.role == "editor" && sharedTrack.addedBy?.userId == currentUserId)
                    SharedPlaylistTrackRow(
                        item = sharedTrack,
                        actionLoading = trackActionLoading,
                        onRemove = if (canEditTracks && canRemoveTrack) {
                            { onRemoveTrack(sharedTrack) }
                        } else {
                            null
                        },
                    )
                }
            }
            if (!loading && members != null && isOwner) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = inviteUsername,
                            onValueChange = onInviteUsernameChanged,
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text("Username") },
                            leadingIcon = { Icon(Icons.Rounded.Add, null) },
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { onInvite() }),
                            shape = RoundedCornerShape(8.dp),
                        )
                        Button(
                            onClick = onInvite,
                            enabled = !actionLoading && inviteUsername.isNotBlank(),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (actionLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Rounded.Add, null)
                            }
                            Text("Invite member", modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            } else if (!loading && members != null && playlist.shared) {
                item {
                    TextButton(
                        onClick = onLeave,
                        enabled = !actionLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Rounded.Close, null)
                        Text("Leave playlist", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistMemberRow(
    member: PlaylistMember,
    label: String,
    actionLoading: Boolean,
    onRemove: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(34.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(memberInitials(member), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(member.displayName.ifBlank { member.username.ifBlank { member.userId } }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(
                    member.username.takeIf { it.isNotBlank() }?.let { "@$it" },
                    label.replaceFirstChar { it.uppercase() },
                    member.status.takeIf { it.isNotBlank() },
                ).filterNotNull().joinToString(" - "),
                color = SpiceTextMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (onRemove != null) {
            IconButton(onClick = onRemove, enabled = !actionLoading) {
                Icon(Icons.Rounded.Delete, "Remove member")
            }
        }
    }
}

@Composable
private fun SharedPlaylistTrackRow(
    item: SharedPlaylistTrack,
    actionLoading: Boolean,
    onRemove: (() -> Unit)?,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AsyncImage(
            model = item.track.artworkUrl,
            contentDescription = item.track.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)),
        )
        Column(Modifier.weight(1f)) {
            Text(item.track.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(
                    item.track.artist,
                    item.addedBy?.displayName?.takeIf { it.isNotBlank() }?.let { "Added by $it" },
                ).filterNotNull().filter { it.isNotBlank() }.joinToString(" - "),
                color = SpiceTextMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (onRemove != null) {
            IconButton(onClick = onRemove, enabled = !actionLoading) {
                Icon(Icons.Rounded.Delete, "Remove track")
            }
        }
    }
}

private fun memberInitials(member: PlaylistMember): String {
    val source = member.displayName.ifBlank { member.username.ifBlank { member.userId } }
    return source
        .replace(Regex("""[^A-Za-z0-9]+"""), " ")
        .trim()
        .split(Regex("""\s+"""))
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifBlank { "S" }
        .take(2)
}

@Composable
private fun TermsSection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Terms", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(
            "Private sideload build for power users. No Play Store distribution or provider endorsement is implied.",
            color = SpiceTextMuted,
        )
        termsEntries.forEach { term ->
            Text("- $term", color = SpiceTextMuted, fontSize = 13.sp)
        }
        Text(
            "Redistributing the APK means keeping these notices, the source links, and the matching source availability for GPL components.",
            color = MaterialTheme.colorScheme.primary,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun LicenseSection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Licenses", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(
            "Resolver and download components used by the native Android app.",
            color = SpiceTextMuted,
        )
        licenseEntries.forEach { entry -> LicenseCard(entry) }
        Text(
            "This repository provides the app-side integration source. Third-party source and license texts are linked above and documented in the mobile notices.",
            color = SpiceTextMuted,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun LicenseCard(entry: LicenseEntry) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = SpiceSurfaceHigh),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(entry.name, fontWeight = FontWeight.Bold)
            Text(entry.license, color = MaterialTheme.colorScheme.primary, fontSize = 13.sp)
            Text(entry.purpose, color = SpiceTextMuted, fontSize = 13.sp)
            Text(entry.url, color = SpiceCyan, fontSize = 12.sp)
        }
    }
}

@Composable
private fun StatusRow(label: String, value: String, color: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = color, modifier = Modifier.size(8.dp)) {}
        Text(label, modifier = Modifier.padding(start = 10.dp).weight(1f), fontWeight = FontWeight.SemiBold)
        Text(value, color = SpiceTextMuted, fontSize = 13.sp)
    }
}

@Composable
private fun SpiceConnectReceiverMenu(
    uiState: SpiceUiState,
    selectedRemoteDevice: RemoteDevice?,
    onRefresh: () -> Unit,
    onSelected: (String?) -> Unit,
    onForget: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val hasRemoteAccess = uiState.accountSession != null || uiState.pairedDeviceCredential != null
    val targets = uiState.remoteDevices.filter { it.deviceId != uiState.remoteDeviceId }
    val targetLabel = selectedRemoteDevice?.displayName ?: "This phone"
    val incomingController = targets.firstOrNull {
        it.deviceId == uiState.incomingRemoteControllerDeviceId && it.isOnline
    }

    Box(modifier) {
        IconButton(
            onClick = {
                expanded = true
                if (hasRemoteAccess) onRefresh()
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            if (uiState.connectLoading && expanded) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    Icons.Rounded.Devices,
                    "Playback device: $targetLabel",
                    tint = if (selectedRemoteDevice != null) MaterialTheme.colorScheme.primary else Color.White,
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            containerColor = SpiceSurfaceHigh,
        ) {
            DropdownMenuItem(
                text = {
                    Column {
                        Text("This phone", fontWeight = FontWeight.SemiBold)
                        Text(
                            incomingController?.let { "Controlled by ${it.displayName}" }
                                ?: "Play and control locally",
                            color = SpiceTextMuted,
                            fontSize = 12.sp,
                        )
                    }
                },
                onClick = {
                    expanded = false
                    onSelected(null)
                },
                leadingIcon = { Icon(Icons.Rounded.Devices, null) },
                trailingIcon = {
                    if (uiState.selectedPlaybackDeviceId.isBlank()) {
                        Icon(Icons.Rounded.Check, "Selected", tint = MaterialTheme.colorScheme.primary)
                    }
                },
            )
            HorizontalDivider()
            when {
                !hasRemoteAccess -> DropdownMenuItem(
                    text = { Text("Sign in or pair to see Spice Connect devices", color = SpiceTextMuted) },
                    onClick = {},
                    enabled = false,
                )
                targets.isEmpty() -> DropdownMenuItem(
                    text = { Text("No other devices available", color = SpiceTextMuted) },
                    onClick = {},
                    enabled = false,
                    leadingIcon = { Icon(Icons.Rounded.Refresh, null) },
                )
                else -> targets.forEach { device ->
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(device.displayName, fontWeight = FontWeight.SemiBold)
                                Text(
                                    spiceConnectDeviceStatus(
                                        isOnline = device.isOnline,
                                        isPlaying = device.isPlaying,
                                        lastSeenSeconds = device.lastSeenSeconds,
                                        trackTitle = device.currentTrack?.title,
                                    ).let { status ->
                                        when {
                                            device.deviceId in uiState.lanConnectedDeviceIds ->
                                                "Same-network direct - $status"
                                            uiState.selectedPlaybackDeviceId == device.deviceId ->
                                                "Cloud fallback - $status"
                                            else -> status
                                        }
                                    },
                                    color = SpiceTextMuted,
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        },
                        onClick = {
                            expanded = false
                            onSelected(device.deviceId)
                        },
                        leadingIcon = { Icon(Icons.Rounded.Devices, null) },
                        trailingIcon = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (uiState.selectedPlaybackDeviceId == device.deviceId) {
                                    Icon(Icons.Rounded.Check, "Selected", tint = MaterialTheme.colorScheme.primary)
                                }
                                IconButton(
                                    onClick = { onForget(device.deviceId) },
                                    modifier = Modifier.size(34.dp),
                                ) {
                                    Icon(Icons.Rounded.Close, "Forget ${device.displayName}")
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

private fun RemoteDevice.toPlayerUiState(nowElapsedRealtimeMs: Long): PlayerUiState = PlayerUiState(
    connected = true,
    mediaId = currentTrack?.id.orEmpty(),
    title = currentTrack?.title.orEmpty(),
    artist = currentTrack?.artist.orEmpty(),
    artworkUrl = currentTrack?.artworkUrl.orEmpty(),
    isPlaying = isPlaying,
    positionMs = projectedSpiceConnectProgressMs(
        progressMs = progressMs,
        durationMs = durationMs,
        isPlaying = isPlaying,
        observedAtElapsedRealtimeMs = observedAtElapsedRealtimeMs,
        nowElapsedRealtimeMs = nowElapsedRealtimeMs,
    ),
    durationMs = durationMs,
    volume = volume,
    shuffleEnabled = shuffleEnabled,
    repeatMode = repeatMode,
)

@Composable
private fun rememberRemotePlayerUiState(device: RemoteDevice?): PlayerUiState {
    var nowElapsedRealtimeMs by remember(device?.deviceId) {
        mutableLongStateOf(SystemClock.elapsedRealtime())
    }
    LaunchedEffect(
        device?.deviceId,
        device?.isPlaying,
        device?.observedAtElapsedRealtimeMs,
        device?.progressMs,
    ) {
        nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        while (device?.isPlaying == true) {
            delay(500L)
            nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        }
    }
    return device?.toPlayerUiState(nowElapsedRealtimeMs) ?: PlayerUiState()
}

@Composable
private fun MiniPlayer(
    track: Track?,
    player: PlayerUiState,
    resolving: Boolean,
    queueSize: Int,
    queueIndex: Int,
    uiState: SpiceUiState,
    selectedRemoteDevice: RemoteDevice?,
    remotePlayback: Boolean,
    onOpen: () -> Unit,
    onToggle: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onShuffle: () -> Unit,
    onRepeat: () -> Unit,
    onRefreshDevices: () -> Unit,
    onDeviceSelected: (String?) -> Unit,
    onForgetDevice: (String) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(enabled = track != null, onClick = onOpen),
        color = SpiceSurfaceHigh,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f)),
    ) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 5.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = track?.artworkUrl,
                    contentDescription = track?.title ?: "No active track",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)),
                )
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        track?.title ?: "No active track",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        if (remotePlayback && track == null) {
                            "${selectedRemoteDevice?.displayName ?: "Spice Connect"} - Choose a track"
                        } else if (resolving) {
                            "Resolving native stream..."
                        } else {
                            listOf(
                                track?.artist.orEmpty(),
                                formatMiniDuration(player.positionMs, player.durationMs.takeIf { it > 0 } ?: track?.durationMs ?: 0),
                                queueLabel(queueSize, queueIndex, compact = true),
                            )
                                .filter { it.isNotBlank() }
                                .joinToString(" - ")
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = SpiceTextMuted,
                        fontSize = 12.sp,
                    )
                }
                SpiceConnectReceiverMenu(
                    uiState = uiState,
                    selectedRemoteDevice = selectedRemoteDevice,
                    onRefresh = onRefreshDevices,
                    onSelected = onDeviceSelected,
                    onForget = onForgetDevice,
                    modifier = Modifier.size(34.dp),
                )
                IconButton(onClick = onShuffle, modifier = Modifier.size(34.dp)) {
                    Icon(
                        Icons.Rounded.Shuffle,
                        "Shuffle",
                        tint = if (player.shuffleEnabled) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
                IconButton(onClick = onRepeat, modifier = Modifier.size(34.dp)) {
                    Icon(
                        if (player.repeatMode == RepeatMode.One) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        "Repeat",
                        tint = if (player.repeatMode != RepeatMode.Off) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
                if (resolving || player.isBuffering) {
                    CircularProgressIndicator(modifier = Modifier.size(30.dp), strokeWidth = 3.dp)
                } else {
                    FilledIconButton(onClick = onToggle, enabled = track != null, modifier = Modifier.size(42.dp)) {
                        Icon(if (player.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Play or pause")
                    }
                }
            }
            Slider(
                value = player.positionMs.coerceAtMost(player.durationMs).toFloat(),
                onValueChange = { onSeekTo(it.toLong()) },
                valueRange = 0f..player.durationMs.coerceAtLeast(1).toFloat(),
                enabled = track != null && player.durationMs > 0,
                modifier = Modifier.fillMaxWidth().height(18.dp),
            )
        }
    }
}

@Composable
private fun SpiceNavigation(selected: AppScreen, onSelected: (AppScreen) -> Unit) {
    NavigationBar(containerColor = SpiceBackground, modifier = Modifier.height(56.dp)) {
        AppScreen.entries.forEach { screen ->
            val icon = when (screen) {
                AppScreen.Home -> Icons.Rounded.Home
                AppScreen.Search -> Icons.Rounded.Search
                AppScreen.Library -> Icons.Rounded.LibraryMusic
                AppScreen.Settings -> Icons.Rounded.Settings
            }
            NavigationBarItem(
                selected = selected == screen,
                onClick = { onSelected(screen) },
                icon = {
                    Icon(
                        icon,
                        screen.label,
                        modifier = Modifier.size(if (screen == AppScreen.Library) 21.dp else 24.dp),
                    )
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FullPlayer(
    track: Track,
    player: PlayerUiState,
    liked: Boolean,
    uiState: SpiceUiState,
    selectedRemoteDevice: RemoteDevice?,
    remotePlayback: Boolean,
    onDismiss: () -> Unit,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onShuffle: () -> Unit,
    onRepeat: () -> Unit,
    queueSize: Int,
    queueIndex: Int,
    onStop: () -> Unit,
    onLike: () -> Unit,
    onLyrics: () -> Unit,
    downloadTrackId: String?,
    downloadProgress: String?,
    onDownload: () -> Unit,
    onDownloadToReceiver: () -> Unit,
    onCancelDownload: () -> Unit,
    onRefreshDevices: () -> Unit,
    onDeviceSelected: (String?) -> Unit,
    onForgetDevice: (String) -> Unit,
    onRemoteVolumeChanged: (Int) -> Unit,
    onHandoffPlayback: () -> Unit,
    onAddTrackToPlaylist: (String, Track) -> Unit,
    onOpenQueue: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var playlistPickerTrack by remember { mutableStateOf<Track?>(null) }
    var showDownloadTarget by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = Modifier.fillMaxHeight(0.96f).imePadding(),
        containerColor = SpiceSurface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().fillMaxHeight().padding(horizontal = 24.dp).padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val downloading = downloadTrackId == track.id
            AsyncImage(
                model = track.artworkUrl,
                contentDescription = track.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(8.dp)),
            )
            Spacer(Modifier.height(20.dp))
            Column(Modifier.fillMaxWidth()) {
                Text(
                    track.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(track.artist, color = SpiceTextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val queueText = queueLabel(queueSize, queueIndex)
                if (queueText.isNotBlank()) {
                    Text(queueText, color = SpiceTextMuted, fontSize = 12.sp)
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                SpiceConnectReceiverMenu(
                    uiState = uiState,
                    selectedRemoteDevice = selectedRemoteDevice,
                    onRefresh = onRefreshDevices,
                    onSelected = onDeviceSelected,
                    onForget = onForgetDevice,
                    modifier = Modifier.size(40.dp),
                )
                IconButton(
                    onClick = { if (remotePlayback) showDownloadTarget = true else onDownload() },
                    enabled = !downloading,
                    modifier = Modifier.size(40.dp),
                ) {
                    if (downloading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Rounded.Download, "Download audio")
                    }
                }
                IconButton(onClick = onLyrics, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Rounded.MusicNote, "Lyrics")
                }
                IconButton(onClick = onOpenQueue, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Open queue")
                }
                IconButton(onClick = { playlistPickerTrack = track }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Rounded.BookmarkBorder, "Save to playlist")
                }
                IconButton(onClick = onLike, modifier = Modifier.size(40.dp)) {
                    Icon(
                        if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        "Like",
                        tint = if (liked) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
            }
            if (selectedRemoteDevice != null && uiState.currentTrack != null) {
                OutlinedButton(
                    onClick = onHandoffPlayback,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) {
                    Icon(Icons.Rounded.Devices, null)
                    Text(
                        "Move phone playback to ${selectedRemoteDevice.displayName}",
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            if (downloading && !downloadProgress.isNullOrBlank()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(downloadProgress, color = SpiceTextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = onCancelDownload, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Rounded.Close, "Cancel download")
                    }
                }
            }
            if (remotePlayback) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.AutoMirrored.Rounded.VolumeUp, "Connected device volume")
                    Slider(
                        value = player.volume.coerceIn(0, 100).toFloat(),
                        onValueChange = { onRemoteVolumeChanged(it.toInt()) },
                        valueRange = 0f..100f,
                        enabled = selectedRemoteDevice?.isOnline != false,
                        modifier = Modifier.weight(1f),
                    )
                    Text("${player.volume.coerceIn(0, 100)}%", color = SpiceTextMuted, fontSize = 12.sp)
                }
            }
            Slider(
                value = player.positionMs.coerceAtMost(player.durationMs).toFloat(),
                onValueChange = { onSeekTo(it.toLong()) },
                valueRange = 0f..player.durationMs.coerceAtLeast(1).toFloat(),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatTime(player.positionMs), color = SpiceTextMuted, fontSize = 12.sp)
                Text(formatTime(player.durationMs), color = SpiceTextMuted, fontSize = 12.sp)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconButton(onClick = onShuffle) {
                    Icon(
                        Icons.Rounded.Shuffle,
                        "Shuffle",
                        tint = if (player.shuffleEnabled) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
                IconButton(onClick = onPrevious) { Icon(Icons.Rounded.SkipPrevious, "Previous track") }
                FilledIconButton(onClick = onToggle, modifier = Modifier.size(64.dp)) {
                    Icon(if (player.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Play or pause", modifier = Modifier.size(34.dp))
                }
                IconButton(onClick = onNext) { Icon(Icons.Rounded.SkipNext, "Next track") }
                IconButton(onClick = onRepeat) {
                    Icon(
                        if (player.repeatMode == RepeatMode.One) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        "Repeat",
                        tint = if (player.repeatMode != RepeatMode.Off) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
            }
            TextButton(onClick = { onStop(); onDismiss() }) {
                Icon(Icons.Rounded.Stop, null)
                Text(if (remotePlayback) "Pause receiver" else "Stop", modifier = Modifier.padding(start = 6.dp))
            }
        }
    }

    playlistPickerTrack?.let { pickerTrack ->
        AlertDialog(
            onDismissRequest = { playlistPickerTrack = null },
            title = { Text("Save to playlist") },
            text = {
                if (uiState.playlists.isEmpty()) {
                    Text("Create a playlist in Library first.", color = SpiceTextMuted)
                } else {
                    Column(
                        modifier = Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        uiState.playlists.forEach { playlist ->
                            val canAdd = !playlist.shared || playlist.shareRole in setOf("owner", "editor")
                            val alreadySaved = playlist.tracks.any {
                                it.id == pickerTrack.id && it.sourceId == pickerTrack.sourceId
                            }
                            TextButton(
                                onClick = {
                                    onAddTrackToPlaylist(playlist.id, pickerTrack)
                                    playlistPickerTrack = null
                                },
                                enabled = canAdd && !alreadySaved,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Rounded.BookmarkBorder, null, Modifier.size(18.dp))
                                Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                    Text(playlist.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        when {
                                            alreadySaved -> "Saved"
                                            canAdd -> "${playlist.tracks.size} tracks"
                                            else -> "View-only shared playlist"
                                        },
                                        color = SpiceTextMuted,
                                        fontSize = 11.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { playlistPickerTrack = null }) { Text("Close") }
            },
        )
    }

    if (showDownloadTarget) {
        AlertDialog(
            onDismissRequest = { showDownloadTarget = false },
            title = { Text("Where should Spice download it?") },
            text = {
                Text(
                    "Save ${track.title} on this phone or ask ${selectedRemoteDevice?.displayName ?: "the selected receiver"} to download it.",
                    color = SpiceTextMuted,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDownloadTarget = false
                        onDownload()
                    },
                ) { Text("This phone") }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showDownloadTarget = false
                        onDownloadToReceiver()
                    },
                ) { Text(selectedRemoteDevice?.displayName ?: "Receiver") }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueSheet(
    queue: List<Track>,
    queueIndex: Int,
    receiverName: String?,
    onTrackSelected: (Track, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = SpiceSurface) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text("Queue", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    receiverName?.let { "Playing on $it" } ?: "Playing on this phone",
                    color = SpiceTextMuted,
                )
            }
            if (queue.isEmpty()) {
                item { Text("The queue is empty.", color = SpiceTextMuted, modifier = Modifier.padding(vertical = 28.dp)) }
            } else {
                itemsIndexed(
                    items = queue,
                    key = { index, track -> "${track.sourceId}:${track.id}:$index" },
                ) { index, track ->
                    val current = index == queueIndex
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (current) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                            )
                            .clickable { onTrackSelected(track, index) }
                            .padding(10.dp)
                            .semantics {
                                contentDescription = if (current) {
                                    "Now playing ${track.title} by ${track.artist}"
                                } else {
                                    "Play ${track.title} by ${track.artist}"
                                }
                            },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        AsyncImage(
                            model = track.artworkUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                track.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                fontWeight = if (current) FontWeight.Bold else FontWeight.Medium,
                                color = if (current) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                track.artist,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = if (current) MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f) else SpiceTextMuted,
                                fontSize = 12.sp,
                            )
                        }
                        Text("${index + 1}", color = SpiceTextMuted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LyricsSheet(
    track: Track?,
    positionMs: Long,
    loading: Boolean,
    lyrics: LyricsPayload?,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val listState = rememberLazyListState()
    val timedLines = remember(lyrics?.syncedLyrics) { parseTimedLyrics(lyrics?.syncedLyrics) }
    val activeLineIndex = activeTimedLyricIndex(timedLines, positionMs)
    LaunchedEffect(activeLineIndex, timedLines.size) {
        if (activeLineIndex >= 0) listState.animateScrollToItem(activeLineIndex + 1)
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = SpiceSurface) {
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(start = 22.dp, end = 22.dp, bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text("Lyrics", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                if (track != null) {
                    Text("${track.title} - ${track.artist}", color = SpiceTextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (loading) {
                item {
                    Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            } else {
                val plainText = lyrics?.plainLyrics?.takeIf { it.isNotBlank() }
                    ?: lyrics?.syncedLyrics?.takeIf { it.isNotBlank() }
                if (timedLines.isNotEmpty()) {
                    itemsIndexed(timedLines) { index, line ->
                        val active = index == activeLineIndex
                        Text(
                            line.text,
                            color = if (active) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                            fontSize = if (active) 17.sp else 15.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (active) MaterialTheme.colorScheme.primaryContainer
                                    else Color.Transparent,
                                )
                                .padding(horizontal = 10.dp, vertical = 8.dp)
                                .semantics {
                                    if (active) contentDescription = "Current lyric: ${line.text}"
                                },
                        )
                    }
                } else if (plainText.isNullOrBlank()) {
                    item { Text("No lyrics found.", color = SpiceTextMuted) }
                } else {
                    items(plainText.lines().filter { it.isNotBlank() }) { line ->
                        Text(cleanLyricLine(line), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(title: String, body: String, onAction: (() -> Unit)?, actionLabel: String = "Retry") {
    Column(
        modifier = Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(if (onAction == null) Icons.Rounded.Album else Icons.Rounded.ErrorOutline, null, modifier = Modifier.size(44.dp), tint = SpiceTextMuted)
        Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Text(body, color = SpiceTextMuted)
        if (onAction != null) {
            TextButton(onClick = onAction) {
                Icon(Icons.Rounded.Refresh, null)
                Text(actionLabel, modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

private fun formatTime(milliseconds: Long): String {
    val totalSeconds = milliseconds.coerceAtLeast(0) / 1000
    return "%d:%02d".format(totalSeconds / 60, totalSeconds % 60)
}

private fun formatMiniDuration(positionMs: Long, durationMs: Long): String =
    if (durationMs > 0) {
        formatTime(positionMs) + " / " + formatTime(durationMs)
    } else {
        ""
    }

private fun queueLabel(queueSize: Int, queueIndex: Int, compact: Boolean = false): String =
    if (queueSize > 1 && queueIndex in 0 until queueSize) {
        if (compact) "Queue ${queueIndex + 1}/$queueSize" else "Queue ${queueIndex + 1} of $queueSize"
    } else {
        ""
    }

private fun cleanLyricLine(line: String): String =
    line.replace(Regex("""^\[[0-9:.]+]\s*"""), "").ifBlank { line }

private fun formatBytes(bytes: Long): String {
    val safeBytes = bytes.coerceAtLeast(0)
    if (safeBytes < 1024) return "$safeBytes B"
    val units = listOf("KB", "MB", "GB")
    var value = safeBytes / 1024.0
    var unitIndex = 0
    while (value >= 1024 && unitIndex < units.lastIndex) {
        value /= 1024.0
        unitIndex += 1
    }
    return "%.1f %s".format(value, units[unitIndex])
}

private fun trackSubtitle(track: Track): String {
    val source = if (track.sourceId.startsWith("soundcloud")) "SoundCloud" else "YouTube"
    return track.artist + " - " + source
}

private enum class SettingsTab(val label: String) {
    General("General"),
    Playback("Playback"),
    Terms("Terms"),
    Licenses("Licenses"),
}

private data class LicenseEntry(
    val name: String,
    val license: String,
    val purpose: String,
    val url: String,
)

private val termsEntries = listOf(
    "Use media providers only through your own rights, accounts, region access, and provider rules.",
    "Downloads are explicit user actions for personal/offline use where you have permission to keep a copy.",
    "Do not use Spice to bypass DRM, access controls, paywalls, bot checks, or copyright restrictions.",
    "Shared playlists expose member names and playlist edits to invited members; only invite people you trust.",
    "This build is provided without warranty, and resolver availability can break when providers change.",
)

private val licenseEntries = listOf(
    LicenseEntry(
        name = "NewPipe Extractor",
        license = "GPL-3.0",
        purpose = "Phone-native YouTube search and audio stream extraction.",
        url = "https://github.com/TeamNewPipe/NewPipeExtractor",
    ),
    LicenseEntry(
        name = "youtubedl-android",
        license = "GPL-3.0",
        purpose = "Embedded Android wrapper for yt-dlp downloads.",
        url = "https://github.com/yausername/youtubedl-android",
    ),
    LicenseEntry(
        name = "yt-dlp",
        license = "Unlicense",
        purpose = "Download engine used by the Android download wrapper.",
        url = "https://github.com/yt-dlp/yt-dlp",
    ),
    LicenseEntry(
        name = "FFmpeg / aria2",
        license = "LGPL/GPL and GPL-2.0-or-later",
        purpose = "Media conversion, metadata embedding, and accelerated transfer support for downloads.",
        url = "https://ffmpeg.org | https://aria2.github.io",
    ),
    LicenseEntry(
        name = "QuickJS Android",
        license = "Apache-2.0 wrapper / MIT engine",
        purpose = "Experimental JavaScript resolver parity bridge.",
        url = "https://github.com/cashapp/quickjs-java",
    ),
    LicenseEntry(
        name = "WebRTC Android SDK",
        license = "BSD-3-Clause",
        purpose = "Same-network Spice Connect data channels.",
        url = "https://github.com/webrtc-sdk/android",
    ),
)
