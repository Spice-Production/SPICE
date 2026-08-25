package xyz.spiceapp.mobile.model

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val durationMs: Long = 0,
    val artworkUrl: String = "",
    val sourceId: String = "youtube_music",
    val localUri: String = "",
)

data class FeedSection(
    val title: String,
    val tracks: List<Track>,
)

data class Playlist(
    val id: String,
    val title: String,
    val description: String = "",
    val coverUrl: String = "",
    val tracks: List<Track> = emptyList(),
    val shared: Boolean = false,
    val shareRole: String = "",
    val isPublic: Boolean = true,
)

data class PlaylistInvite(
    val token: String,
    val inviteUrl: String,
    val expiresAt: String = "",
)

data class PlaylistInvitePreview(
    val token: String,
    val role: String,
    val expiresAt: String = "",
    val playlist: Playlist,
)

data class PendingPlaylistInvite(
    val playlistId: String,
    val playlistTitle: String,
    val ownerId: String,
    val ownerUsername: String = "",
    val ownerDisplayName: String = "",
)

data class PlaylistMember(
    val userId: String,
    val username: String = "",
    val displayName: String = "",
    val avatarUrl: String = "",
    val role: String = "",
    val status: String = "",
    val acceptedAt: String = "",
)

data class PlaylistMembersSummary(
    val playlistId: String,
    val owner: PlaylistMember,
    val members: List<PlaylistMember>,
    val maxMembers: Int,
)

data class SharedPlaylistTrack(
    val position: Int,
    val track: Track,
    val addedBy: PlaylistMember? = null,
)

data class SharedPlaylistTracks(
    val playlistId: String,
    val role: String,
    val tracks: List<SharedPlaylistTrack>,
)

data class DownloadedTrack(
    val id: String,
    val track: Track,
    val filePath: String,
    val fileName: String,
    val mimeType: String,
    val bytes: Long,
    val downloadedAt: Long,
)

data class ResolvedStream(
    val url: String,
    val container: String = "",
    val bitrate: Long = 0,
    val protocol: String = "",
    val contentType: String = "",
    val expiresAt: String = "",
)

data class SpiceAccount(
    val id: String,
    val email: String = "",
    val username: String = "",
    val displayName: String = "",
    val avatarUrl: String = "",
    val accountRole: String = "user",
    val isAdmin: Boolean = false,
    val moderationStatus: String = "active",
    val moderationExpiresAt: String = "",
    val moderationReason: String = "",
)

data class AccountBlock(
    val status: String = "banned",
    val reason: String = "",
    val expiresAt: String = "",
) {
    val isTimeout: Boolean get() = status == "timeout"
    val isBanned: Boolean get() = status == "banned"
}

data class SpiceProfile(
    val id: String = "default",
    val displayName: String = "Spice Listener",
    val username: String = "",
    val avatarUrl: String = "",
    val bio: String = "",
    val gradient: String = "linear-gradient(135deg, #a855f7, #ec4899)",
    val joinedAt: String = "",
    val isPrivate: Boolean = false,
    val songsPlayed: Int = 0,
    val passcode: String = "",
)

data class ProfileStats(
    val songsPlayed: Int = 0,
    val likedCount: Int = 0,
    val playlistsCount: Int = 0,
)

data class ProfileSummary(
    val profile: SpiceProfile,
    val stats: ProfileStats,
)

data class AccountSession(
    val token: String,
    val account: SpiceAccount,
)

data class EmailVerificationChallenge(
    val registrationId: String,
    val email: String,
    val expiresAt: String = "",
)

data class PairedDeviceCredential(
    val accessToken: String,
    val authorizationId: String,
    val ownerUserId: String,
    val expiresAt: String,
    val expiresAtEpochMs: Long,
    val deviceId: String,
    val displayName: String,
) {
    fun isExpired(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        expiresAtEpochMs <= 0L || expiresAtEpochMs <= nowEpochMs
}

data class LibrarySyncSummary(
    val likedCount: Int,
    val historyCount: Int,
    val playlistCount: Int,
)

data class LibrarySyncResult(
    val summary: LibrarySyncSummary,
    val likedTracks: List<Track>,
    val historyTracks: List<Track>,
    val playlists: List<Playlist>,
)

data class LyricsPayload(
    val plainLyrics: String = "",
    val syncedLyrics: String = "",
    val isSynced: Boolean = false,
)

data class RemoteDevice(
    val deviceId: String,
    val displayName: String,
    val currentTrack: Track? = null,
    val queue: List<Track> = emptyList(),
    val queueIndex: Int = 0,
    val isPlaying: Boolean = false,
    val shuffleEnabled: Boolean = false,
    val repeatMode: RepeatMode = RepeatMode.Off,
    val progressMs: Long = 0,
    val durationMs: Long = 0,
    val volume: Int = 70,
    val updatedAt: String = "",
    val lastSeenSeconds: Long = 0L,
    val rememberedUntil: String = "",
    val isOnline: Boolean = true,
    val observedAtElapsedRealtimeMs: Long = 0L,
)

data class RemoteCommand(
    val id: String,
    val sourceDeviceId: String,
    val command: String,
    val createdAt: String = "",
    val payloadJson: String = "{}",
    val payloadTrack: Track? = null,
    val payloadQueue: List<Track> = emptyList(),
    val payloadQueueIndex: Int = 0,
    val seekPositionMs: Long? = null,
    val volume: Int? = null,
    val shuffleEnabled: Boolean? = null,
    val repeatMode: RepeatMode? = null,
    val shouldPlay: Boolean? = null,
    val connected: Boolean? = null,
    val liked: Boolean? = null,
    val playlistId: String = "",
    val playlistTitle: String = "",
    val transferId: String = "",
    val failureReason: String = "",
)

enum class RepeatMode {
    Off,
    All,
    One,
}

enum class AccentTheme(val label: String) {
    NeonSpice("Neon Spice (Pink)"),
    OceanBreeze("Ocean Breeze (Blue)"),
    SolarFire("Solar Fire (Orange)"),
    JadeEmerald("Jade Emerald (Green)"),
    ImperialGold("Imperial Gold (Gold)"),
    CrimsonMoon("Crimson Moon (Red)"),
    MidnightVelvet("Midnight Velvet (Dark Purple)"),
}

enum class AppScreen(val label: String) {
    Home("Home"),
    Search("Search"),
    Library("Library"),
    Settings("Settings"),
}

enum class StreamQuality(val label: String) {
    High("High definition"),
    Standard("Standard"),
    DataSaver("Data saver"),
}

enum class SearchProvider(val label: String) {
    All("YouTube + SoundCloud"),
    YouTube("YouTube only"),
    SoundCloud("SoundCloud only"),
}

enum class AuthMode(val label: String) {
    SignIn("Sign in"),
    SignUp("Create account"),
}

enum class LibraryTab(val label: String) {
    Playlists("Playlists"),
    Liked("Liked"),
    History("History"),
    Downloads("Downloads"),
}
