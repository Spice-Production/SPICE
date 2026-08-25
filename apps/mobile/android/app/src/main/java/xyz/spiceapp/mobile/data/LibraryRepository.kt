package xyz.spiceapp.mobile.data

import android.content.Context
import android.net.Uri
import androidx.room.withTransaction
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import xyz.spiceapp.mobile.MobileTrackFeedback
import xyz.spiceapp.mobile.encodeMobileTrackPriorities
import xyz.spiceapp.mobile.parseMobileTrackPriorities
import xyz.spiceapp.mobile.updateMobileTrackPriorityPayload
import xyz.spiceapp.mobile.data.local.DownloadEntity
import xyz.spiceapp.mobile.data.local.DownloadRow
import xyz.spiceapp.mobile.data.local.HistoryTrackEntity
import xyz.spiceapp.mobile.data.local.LikedTrackEntity
import xyz.spiceapp.mobile.data.local.PlaylistEntity
import xyz.spiceapp.mobile.data.local.PlaylistTrackEntity
import xyz.spiceapp.mobile.data.local.PlaylistTrackRow
import xyz.spiceapp.mobile.data.local.SpiceDatabase
import xyz.spiceapp.mobile.data.local.toEntity
import xyz.spiceapp.mobile.data.local.toTrack
import xyz.spiceapp.mobile.model.AccentTheme
import xyz.spiceapp.mobile.model.DownloadedTrack
import xyz.spiceapp.mobile.model.Playlist
import xyz.spiceapp.mobile.model.SearchProvider
import xyz.spiceapp.mobile.model.StreamQuality
import xyz.spiceapp.mobile.model.Track
import java.io.File
import java.util.UUID

class LibraryRepository(context: Context) {
    private val appContext = context.applicationContext
    private val database = SpiceDatabase.get(context)
    private val dao = database.libraryDao()
    private val preferences = context.getSharedPreferences("spice_native_library", Context.MODE_PRIVATE)
    private var trackPriorityPayload = preferences.getString(KEY_TRACK_PRIORITIES, "[]").orEmpty()
    private val trackPriorities = parseMobileTrackPriorities(trackPriorityPayload)
    private val likesMutex = Mutex()
    private val historyMutex = Mutex()

    val likedTracks: Flow<List<Track>> = dao.observeLikedTracks().map { tracks ->
        tracks.map { it.toTrack() }
    }

    val historyTracks: Flow<List<Track>> = dao.observeHistoryTracks().map { tracks ->
        tracks.map { it.toTrack() }
    }

    val playlists: Flow<List<Playlist>> = dao.observePlaylistRows().map(::playlistRowsToPlaylists)

    val downloads: Flow<List<DownloadedTrack>> = dao.observeDownloads().map { rows ->
        rows.map(::downloadRowToModel)
    }

    suspend fun likedSnapshot(): List<Track> = likesMutex.withLock {
        dao.likedTracks().map { it.toTrack() }
    }

    suspend fun historySnapshot(): List<Track> = historyMutex.withLock {
        dao.historyTracks().map { it.toTrack() }
    }

    suspend fun playlistSnapshot(): List<Playlist> = playlistRowsToPlaylists(dao.playlistRows())

    suspend fun downloadsSnapshot(): List<DownloadedTrack> = dao.downloads().map(::downloadRowToModel)

    suspend fun migrateLegacySnapshotsIfNeeded() {
        if (preferences.getBoolean(KEY_ROOM_MIGRATED_V1, false)) return

        val liked = readLegacyTracks(KEY_LEGACY_LIKED)
        val history = readLegacyTracks(KEY_LEGACY_HISTORY)
        val now = System.currentTimeMillis()

        database.withTransaction {
            liked.forEachIndexed { index, track ->
                dao.upsertTrack(track.toEntity(now - index))
                dao.upsertLikedTrack(LikedTrackEntity(track.id, now - index))
            }
            history.take(50).forEachIndexed { index, track ->
                dao.upsertTrack(track.toEntity(now - index))
                dao.upsertHistoryTrack(HistoryTrackEntity(track.id, now - index))
            }
            dao.trimHistory()
        }

        preferences.edit().putBoolean(KEY_ROOM_MIGRATED_V1, true).apply()
    }

    suspend fun addToHistory(track: Track) = historyMutex.withLock {
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.upsertTrack(track.toEntity(now))
            dao.upsertHistoryTrack(HistoryTrackEntity(track.id, now))
            dao.trimHistory()
        }
        val pendingIds = pendingHistoryTrackIds().toMutableSet().apply { add(track.id) }
        preferences.edit()
            .putString(KEY_PENDING_HISTORY_IDS, JSONArray(pendingIds.toList()).toString())
            .putLong(KEY_HISTORY_SYNC_REVISION, historySyncRevision() + 1L)
            .apply()
    }

    suspend fun replaceLikedTracks(tracks: List<Track>) = likesMutex.withLock {
        replaceLikedTracksLocked(tracks)
    }

    suspend fun replaceSyncedLikedTracks(tracks: List<Track>, syncRevision: Long): List<Track> =
        likesMutex.withLock {
            val reconciled = if (likesSyncRevision() == syncRevision) {
                tracks
            } else {
                mergeSyncLikes(
                    remote = tracks,
                    local = dao.likedTracks().map { it.toTrack() },
                    pendingLocalTrackIds = pendingLikedTrackIds(),
                )
            }
            replaceLikedTracksLocked(reconciled)
            markLikesSyncedLocked(syncRevision)
            reconciled
        }

    private suspend fun replaceLikedTracksLocked(tracks: List<Track>) {
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.clearLikedTracks()
            tracks.forEachIndexed { index, track ->
                val timestamp = now - index
                dao.upsertTrack(track.toEntity(timestamp))
                dao.upsertLikedTrack(LikedTrackEntity(track.id, timestamp))
            }
        }
    }

    suspend fun replaceHistoryTracks(tracks: List<Track>) = historyMutex.withLock {
        replaceHistoryTracksLocked(tracks)
    }

    suspend fun replaceSyncedHistoryTracks(tracks: List<Track>, syncRevision: Long): List<Track> =
        historyMutex.withLock {
            val reconciled = if (historySyncRevision() == syncRevision) {
                tracks
            } else {
                mergeSyncHistory(
                    remote = tracks,
                    local = dao.historyTracks().map { it.toTrack() },
                    pendingLocalTrackIds = pendingHistoryTrackIds(),
                )
            }
            replaceHistoryTracksLocked(reconciled)
            markHistorySyncedLocked(syncRevision)
            reconciled
        }

    private suspend fun replaceHistoryTracksLocked(tracks: List<Track>) {
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.clearHistoryTracks()
            tracks.take(50).forEachIndexed { index, track ->
                val timestamp = now - index
                dao.upsertTrack(track.toEntity(timestamp))
                dao.upsertHistoryTrack(HistoryTrackEntity(track.id, timestamp))
            }
            dao.trimHistory()
        }
    }

    suspend fun createPlaylist(title: String? = null): Playlist {
        val now = System.currentTimeMillis()
        val index = dao.maxPlaylistSortIndex() + 1
        val playlist = Playlist(
            id = UUID.randomUUID().toString(),
            title = title?.trim().takeUnless { it.isNullOrEmpty() } ?: "New Playlist ${index + 1}",
            isPublic = true,
        )
        dao.upsertPlaylist(playlist.toEntity(index, now))
        return playlist
    }

    suspend fun addTrackToPlaylist(playlistId: String, track: Track): Boolean {
        val now = System.currentTimeMillis()
        return database.withTransaction {
            if (dao.playlistHasTrack(playlistId, track.id)) {
                false
            } else {
                dao.upsertTrack(track.toEntity(now))
                dao.upsertPlaylistTrack(
                    PlaylistTrackEntity(
                        playlistId = playlistId,
                        trackId = track.id,
                        position = dao.maxPlaylistTrackPosition(playlistId) + 1,
                    ),
                )
                true
            }
        }
    }

    suspend fun addDownload(
        track: Track,
        savedLocation: String,
        fileName: String,
        bytes: Long,
        mimeType: String = "audio/mpeg",
    ): DownloadedTrack {
        val now = System.currentTimeMillis()
        val download = DownloadedTrack(
            id = UUID.randomUUID().toString(),
            track = track,
            filePath = savedLocation,
            fileName = fileName,
            mimeType = mimeType,
            bytes = bytes.coerceAtLeast(0),
            downloadedAt = now,
        )

        database.withTransaction {
            dao.upsertTrack(track.toEntity(now))
            dao.upsertDownload(download.toEntity())
        }

        return download
    }

    suspend fun removeDownload(download: DownloadedTrack): Boolean {
        dao.deleteDownload(download.id)
        return if (download.filePath.startsWith("content://")) {
            appContext.contentResolver.delete(Uri.parse(download.filePath), null, null) >= 0
        } else {
            File(download.filePath).deleteIfExists()
        }
    }

    suspend fun replacePlaylists(playlists: List<Playlist>) {
        val now = System.currentTimeMillis()
        database.withTransaction {
            dao.clearPlaylists()
            playlists.forEachIndexed { playlistIndex, playlist ->
                dao.upsertPlaylist(playlist.toEntity(playlistIndex, now - playlistIndex))
                playlist.tracks.forEachIndexed { trackIndex, track ->
                    dao.upsertTrack(track.toEntity(now - trackIndex))
                    dao.upsertPlaylistTrack(
                        PlaylistTrackEntity(
                            playlistId = playlist.id,
                            trackId = track.id,
                            position = trackIndex,
                        ),
                    )
                }
            }
        }
    }

    suspend fun toggleLike(track: Track): Boolean = likesMutex.withLock {
        val now = System.currentTimeMillis()
        val liked = database.withTransaction {
            val isLiked = dao.isLiked(track.id)
            dao.upsertTrack(track.toEntity(now))
            if (isLiked) {
                dao.deleteLikedTrack(track.id)
                false
            } else {
                dao.upsertLikedTrack(LikedTrackEntity(track.id, now))
                true
            }
        }
        markLikeMutationPendingLocked(track.id)
        liked
    }

    suspend fun setLiked(track: Track, liked: Boolean, markPending: Boolean = true) =
        likesMutex.withLock {
            val now = System.currentTimeMillis()
            database.withTransaction {
                dao.upsertTrack(track.toEntity(now))
                if (liked) {
                    dao.upsertLikedTrack(LikedTrackEntity(track.id, now))
                } else {
                    dao.deleteLikedTrack(track.id)
                }
            }
            if (markPending) {
                markLikeMutationPendingLocked(track.id)
            }
        }

    suspend fun isLiked(trackId: String): Boolean = likesMutex.withLock {
        dao.isLiked(trackId)
    }

    suspend fun markLikeMutationPending(trackId: String) = likesMutex.withLock {
        markLikeMutationPendingLocked(trackId)
    }

    suspend fun markLikeMutationSynced(trackId: String) = likesMutex.withLock {
        val pendingIds = pendingLikedTrackIds().toMutableSet().apply { remove(trackId) }
        preferences.edit()
            .putBoolean(KEY_LIKES_SYNC_INITIALIZED, true)
            .putString(KEY_PENDING_LIKED_IDS, JSONArray(pendingIds.toList()).toString())
            .apply()
    }

    private fun markLikeMutationPendingLocked(trackId: String) {
        val pendingIds = pendingLikedTrackIds().toMutableSet().apply { add(trackId) }
        preferences.edit()
            .putString(KEY_PENDING_LIKED_IDS, JSONArray(pendingIds.toList()).toString())
            .putLong(KEY_LIKES_SYNC_REVISION, likesSyncRevision() + 1L)
            .apply()
    }

    fun quality(): StreamQuality = runCatching {
        StreamQuality.valueOf(preferences.getString(KEY_QUALITY, StreamQuality.Standard.name).orEmpty())
    }.getOrDefault(StreamQuality.Standard)

    fun setQuality(quality: StreamQuality) {
        preferences.edit().putString(KEY_QUALITY, quality.name).apply()
    }

    fun searchProvider(): SearchProvider = runCatching {
        SearchProvider.valueOf(preferences.getString(KEY_SEARCH_PROVIDER, SearchProvider.All.name).orEmpty())
    }.getOrDefault(SearchProvider.All)

    fun setSearchProvider(provider: SearchProvider) {
        preferences.edit().putString(KEY_SEARCH_PROVIDER, provider.name).apply()
    }

    fun crossfadeDurationMs(): Long =
        preferences.getLong(KEY_CROSSFADE_DURATION_MS, 0L).coerceIn(0L, MAX_CROSSFADE_DURATION_MS)

    fun setCrossfadeDurationMs(durationMs: Long) {
        preferences.edit()
            .putLong(KEY_CROSSFADE_DURATION_MS, durationMs.coerceIn(0L, MAX_CROSSFADE_DURATION_MS))
            .apply()
    }

    fun smartQueueEnabled(): Boolean = preferences.getBoolean(KEY_SMART_QUEUE_ENABLED, true)

    fun setSmartQueueEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_SMART_QUEUE_ENABLED, enabled).apply()
    }

    fun trackPriority(trackKey: String): Int = synchronized(TRACK_PRIORITY_LOCK) {
        refreshTrackPrioritiesLocked()
        trackPriorities[trackKey] ?: 0
    }

    internal fun recordTrackFeedback(trackKey: String, feedback: MobileTrackFeedback): Int {
        if (trackKey.isBlank()) return 0
        return synchronized(TRACK_PRIORITY_LOCK) {
            val latestPayload = preferences.getString(KEY_TRACK_PRIORITIES, "[]").orEmpty()
            val update = updateMobileTrackPriorityPayload(latestPayload, trackKey, feedback)
            trackPriorityPayload = update.payload
            trackPriorities.clear()
            trackPriorities.putAll(parseMobileTrackPriorities(update.payload))
            preferences.edit().putString(KEY_TRACK_PRIORITIES, update.payload).apply()
            update.updatedScore
        }
    }

    /** Raw adaptive priority payload for cloud taste sync. */
    fun trackPriorityPayload(): String = synchronized(TRACK_PRIORITY_LOCK) {
        refreshTrackPrioritiesLocked()
        trackPriorityPayload
    }

    /** Replaces the adaptive priority payload with a cloud copy. */
    fun replaceTrackPriorities(payload: String) {
        val parsed = parseMobileTrackPriorities(payload)
        synchronized(TRACK_PRIORITY_LOCK) {
            trackPriorityPayload = encodeMobileTrackPriorities(parsed)
            preferences.edit().putString(KEY_TRACK_PRIORITIES, trackPriorityPayload).apply()
            trackPriorities.clear()
            trackPriorities.putAll(parsed)
        }
    }

    fun tasteSyncedAt(): Long = preferences.getLong(KEY_TASTE_ADAPTIVE_SYNCED_AT, 0L)

    fun markTasteSyncedAt(timestampMs: Long) {
        preferences.edit().putLong(KEY_TASTE_ADAPTIVE_SYNCED_AT, timestampMs.coerceAtLeast(0L)).apply()
    }

    private fun refreshTrackPrioritiesLocked() {
        val latestPayload = preferences.getString(KEY_TRACK_PRIORITIES, "[]").orEmpty()
        if (latestPayload == trackPriorityPayload) return
        trackPriorityPayload = latestPayload
        trackPriorities.clear()
        trackPriorities.putAll(parseMobileTrackPriorities(latestPayload))
    }

    fun pendingHistoryTrackIds(): Set<String> = runCatching {
        val array = JSONArray(preferences.getString(KEY_PENDING_HISTORY_IDS, "[]"))
        buildSet {
            for (index in 0 until array.length()) {
                array.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
            }
        }
    }.getOrDefault(emptySet())

    fun pendingLikedTrackIds(): Set<String> = runCatching {
        val array = JSONArray(preferences.getString(KEY_PENDING_LIKED_IDS, "[]"))
        buildSet {
            for (index in 0 until array.length()) {
                array.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
            }
        }
    }.getOrDefault(emptySet())

    fun needsInitialLikesReconciliation(): Boolean =
        !preferences.getBoolean(KEY_LIKES_SYNC_INITIALIZED, false)

    fun likesSyncRevision(): Long = preferences.getLong(KEY_LIKES_SYNC_REVISION, 0L)

    private fun markLikesSyncedLocked(syncRevision: Long) {
        preferences.edit()
            .putBoolean(KEY_LIKES_SYNC_INITIALIZED, true)
            .apply {
                if (likesSyncRevision() == syncRevision) {
                    remove(KEY_PENDING_LIKED_IDS)
                }
            }
            .apply()
    }

    fun needsInitialHistoryReconciliation(): Boolean =
        !preferences.getBoolean(KEY_HISTORY_SYNC_INITIALIZED, false)

    fun historySyncRevision(): Long = preferences.getLong(KEY_HISTORY_SYNC_REVISION, 0L)

    private fun markHistorySyncedLocked(syncRevision: Long) {
        preferences.edit()
            .putBoolean(KEY_HISTORY_SYNC_INITIALIZED, true)
            .apply {
                if (historySyncRevision() == syncRevision) {
                    remove(KEY_PENDING_HISTORY_IDS)
                }
            }
            .apply()
    }

    fun accentTheme(): AccentTheme = runCatching {
        AccentTheme.valueOf(preferences.getString(KEY_ACCENT_THEME, AccentTheme.MidnightVelvet.name).orEmpty())
    }.getOrDefault(AccentTheme.MidnightVelvet)

    fun setAccentTheme(theme: AccentTheme) {
        preferences.edit().putString(KEY_ACCENT_THEME, theme.name).apply()
    }

    private fun readLegacyTracks(key: String): List<Track> = runCatching {
        val array = JSONArray(preferences.getString(key, "[]"))
        buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id").trim()
                val title = item.optString("title").trim()
                if (id.isEmpty() || title.isEmpty()) continue
                add(
                    Track(
                        id = id,
                        title = title,
                        artist = item.optString("artist", "Unknown artist"),
                        album = item.optString("album"),
                        durationMs = item.optLong("durationMs", 0),
                        artworkUrl = item.optString("artworkUrl"),
                        sourceId = item.optString("sourceId", "youtube_music"),
                    ),
                )
            }
        }
    }.getOrDefault(emptyList())

    private fun playlistRowsToPlaylists(rows: List<PlaylistTrackRow>): List<Playlist> =
        rows.groupBy { it.playlistId }.values.map { playlistRows ->
            val first = playlistRows.first()
            Playlist(
                id = first.playlistId,
                title = first.playlistTitle,
                description = first.playlistDescription,
                coverUrl = first.playlistCoverUrl,
                shared = first.playlistShared,
                shareRole = first.playlistShareRole,
                isPublic = first.playlistIsPublic,
                tracks = playlistRows
                    .sortedBy { it.trackPosition ?: Int.MAX_VALUE }
                    .mapNotNull { it.toTrackOrNull() },
            )
        }

    private fun PlaylistTrackRow.toTrackOrNull(): Track? {
        val id = trackId ?: return null
        return Track(
            id = id,
            title = trackTitle ?: "Track",
            artist = trackArtist ?: "Unknown artist",
            album = trackAlbum.orEmpty(),
            durationMs = trackDurationMs ?: 0,
            artworkUrl = trackArtworkUrl.orEmpty(),
            sourceId = trackSourceId ?: "youtube_music",
        )
    }

    private fun downloadRowToModel(row: DownloadRow): DownloadedTrack =
        DownloadedTrack(
            id = row.downloadId,
            track = Track(
                id = row.trackId,
                title = row.trackTitle,
                artist = row.trackArtist,
                album = row.trackAlbum,
                durationMs = row.trackDurationMs,
                artworkUrl = row.trackArtworkUrl,
                sourceId = row.trackSourceId,
                localUri = if (row.filePath.startsWith("content://")) {
                    row.filePath
                } else {
                    Uri.fromFile(File(row.filePath)).toString()
                },
            ),
            filePath = row.filePath,
            fileName = row.fileName,
            mimeType = row.mimeType,
            bytes = row.bytes,
            downloadedAt = row.downloadedAt,
        )

    private fun DownloadedTrack.toEntity(): DownloadEntity =
        DownloadEntity(
            id = id,
            trackId = track.id,
            filePath = filePath,
            fileName = fileName,
            mimeType = mimeType,
            bytes = bytes,
            downloadedAt = downloadedAt,
        )

    private fun File.deleteIfExists(): Boolean =
        if (!exists()) true else delete()

    private fun Playlist.toEntity(sortIndex: Int, updatedAt: Long): PlaylistEntity =
        PlaylistEntity(
            id = id,
            title = title,
            description = description,
            coverUrl = coverUrl,
            shared = shared,
            shareRole = shareRole,
            isPublic = isPublic,
            sortIndex = sortIndex,
            updatedAt = updatedAt,
        )

    private companion object {
        val TRACK_PRIORITY_LOCK = Any()
        const val KEY_LEGACY_HISTORY = "history"
        const val KEY_LEGACY_LIKED = "liked"
        const val KEY_ACCENT_THEME = "accent_theme"
        const val KEY_QUALITY = "quality"
        const val KEY_SEARCH_PROVIDER = "search_provider"
        const val KEY_CROSSFADE_DURATION_MS = "crossfade_duration_ms"
        const val KEY_SMART_QUEUE_ENABLED = "smart_queue_enabled"
        const val KEY_TRACK_PRIORITIES = "track_priorities_v1"
        const val KEY_TASTE_ADAPTIVE_SYNCED_AT = "taste_adaptive_synced_at"
        const val KEY_PENDING_LIKED_IDS = "pending_liked_ids"
        const val KEY_LIKES_SYNC_INITIALIZED = "likes_sync_initialized"
        const val KEY_LIKES_SYNC_REVISION = "likes_sync_revision"
        const val KEY_PENDING_HISTORY_IDS = "pending_history_ids"
        const val KEY_HISTORY_SYNC_INITIALIZED = "history_sync_initialized"
        const val KEY_HISTORY_SYNC_REVISION = "history_sync_revision"
        const val KEY_ROOM_MIGRATED_V1 = "room_migrated_v1"
        const val MAX_CROSSFADE_DURATION_MS = 12_000L
    }
}
