package xyz.spiceapp.mobile.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import xyz.spiceapp.mobile.BuildConfig
import xyz.spiceapp.mobile.data.provider.NewPipeYouTubeClient
import xyz.spiceapp.mobile.data.provider.SoundCloudDirectClient
import xyz.spiceapp.mobile.model.AccountSession
import xyz.spiceapp.mobile.model.EmailVerificationChallenge
import xyz.spiceapp.mobile.model.LibrarySyncSummary
import xyz.spiceapp.mobile.model.LibrarySyncResult
import xyz.spiceapp.mobile.model.PairedDeviceCredential
import xyz.spiceapp.mobile.model.PendingPlaylistInvite
import xyz.spiceapp.mobile.model.Playlist
import xyz.spiceapp.mobile.model.PlaylistInvite
import xyz.spiceapp.mobile.model.PlaylistInvitePreview
import xyz.spiceapp.mobile.model.PlaylistMember
import xyz.spiceapp.mobile.model.PlaylistMembersSummary
import xyz.spiceapp.mobile.model.LyricsPayload
import xyz.spiceapp.mobile.model.ProfileStats
import xyz.spiceapp.mobile.model.ProfileSummary
import xyz.spiceapp.mobile.model.RemoteCommand
import xyz.spiceapp.mobile.model.RemoteDevice
import xyz.spiceapp.mobile.model.RepeatMode
import xyz.spiceapp.mobile.model.SearchProvider
import xyz.spiceapp.mobile.model.ResolvedStream
import xyz.spiceapp.mobile.model.SharedPlaylistTrack
import xyz.spiceapp.mobile.model.SharedPlaylistTracks
import xyz.spiceapp.mobile.model.SpiceAccount
import xyz.spiceapp.mobile.model.SpiceProfile
import xyz.spiceapp.mobile.model.StreamQuality
import xyz.spiceapp.mobile.model.Track
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale
import kotlin.coroutines.coroutineContext

class SpiceApi(
    cloudBaseUrl: String = BuildConfig.SPICE_CLOUD_BASE_URL,
    mediaBaseUrls: List<String> = parseBaseUrls(BuildConfig.SPICE_MEDIA_BASE_URLS),
    private val streamProbe: StreamProbe = HttpStreamProbe(),
    private val soundCloudDirectClient: SoundCloudDirectClient = SoundCloudDirectClient(),
    private val newPipeYouTubeClient: NewPipeYouTubeClient = NewPipeYouTubeClient(),
) {
    private val cloudBaseUrl = normalizeBaseUrl(cloudBaseUrl)
    private val mediaBaseUrls = mediaBaseUrls
        .map(::normalizeBaseUrl)
        .filter { it.isNotBlank() }
        .distinct()

    suspend fun signIn(email: String, password: String): AccountSession = withContext(Dispatchers.IO) {
        parseAccountSession(
            postJson(
                "/api/auth/spice/signin",
                JSONObject()
                    .put("email", email.trim())
                    .put("password", password),
            ),
        )
    }

    suspend fun fetchAccountMe(token: String): SpiceAccount = withContext(Dispatchers.IO) {
        val payload = getJson("/api/account/me", token)
        val account = payload.optJSONObject("account")
            ?: payload.optJSONObject("user")
            ?: JSONObject()
        parseAccount(account)
    }

    suspend fun signUp(email: String, password: String, username: String): EmailVerificationChallenge = withContext(Dispatchers.IO) {
        parseEmailVerificationChallenge(
            postJson(
                "/api/auth/spice/signup",
                JSONObject()
                    .put("email", email.trim())
                    .put("password", password)
                    .put("username", username.trim()),
            ),
        )
    }

    suspend fun verifyEmail(registrationId: String, code: String): AccountSession = withContext(Dispatchers.IO) {
        parseAccountSession(
            postJson(
                "/api/auth/spice/verify-email",
                JSONObject()
                    .put("registrationId", registrationId)
                    .put("code", code.trim()),
            ),
        )
    }

    suspend fun resendEmailVerification(registrationId: String): EmailVerificationChallenge = withContext(Dispatchers.IO) {
        parseEmailVerificationChallenge(
            postJson(
                "/api/auth/spice/resend-verification",
                JSONObject().put("registrationId", registrationId),
            ),
        )
    }

    suspend fun claimPairingCode(
        code: String,
        deviceId: String,
        displayName: String,
    ): PairedDeviceCredential = withContext(Dispatchers.IO) {
        parsePairedDeviceCredential(
            postJson(
                "/api/remote/pairing/claim",
                JSONObject()
                    .put("code", code.trim())
                    .put("deviceId", deviceId)
                    .put("displayName", displayName),
            ),
        )
    }

    suspend fun syncLibrary(
        token: String,
        liked: List<Track>,
        history: List<Track>,
        playlists: List<Playlist>,
        profileId: String = "default",
        pendingLikedTrackIds: Set<String> = emptySet(),
        initialLikesReconciliation: Boolean = false,
        pendingHistoryTrackIds: Set<String> = emptySet(),
        initialHistoryReconciliation: Boolean = false,
    ): LibrarySyncResult {
        val remote = fetchLibrary(token, profileId)
        val remoteLiked = remote.likedTracks
        val remoteHistory = remote.historyTracks
        val remotePlaylists = remote.playlists
        val mergedLiked = mergeSyncLikes(
            remote = remoteLiked,
            local = liked,
            pendingLocalTrackIds = pendingLikedTrackIds,
            initialReconciliation = initialLikesReconciliation,
        )
        val mergedHistory = mergeSyncHistory(
            remote = remoteHistory,
            local = history,
            pendingLocalTrackIds = pendingHistoryTrackIds,
            initialReconciliation = initialHistoryReconciliation,
        ).take(50)
        val mergedPlaylists = mergeSyncPlaylists(remotePlaylists, playlists)

        val changedLikes = !syncTracksMatch(remoteLiked, mergedLiked)
        val changedHistory = !syncTracksMatch(remoteHistory, mergedHistory)
        val changedPlaylists = !syncPlaylistsMatch(remotePlaylists, mergedPlaylists)
        if (changedLikes || changedHistory || changedPlaylists) {
            val body = JSONObject().put("profileId", profileId)
            if (changedLikes) {
                val details = JSONObject()
                mergedLiked.forEach { track -> details.put(track.id, track.toSnapshotJson()) }
                body
                    .put("likedTracks", JSONArray(mergedLiked.map { it.id }))
                    .put("likedTrackDetails", details)
            }
            if (changedHistory) {
                body.put("history", JSONArray(mergedHistory.map { it.toSnapshotJson() }))
            }
            if (changedPlaylists) {
                body.put("playlists", JSONArray(mergedPlaylists.map { it.toSnapshotJson() }))
            }
            withContext(Dispatchers.IO) {
                postJson("/api/sync/library", body, token)
            }
        }

        return LibrarySyncResult(
            summary = LibrarySyncSummary(
                likedCount = mergedLiked.size,
                historyCount = mergedHistory.size,
                playlistCount = mergedPlaylists.size,
            ),
            likedTracks = mergedLiked,
            historyTracks = mergedHistory,
            playlists = mergedPlaylists,
        )
    }

    suspend fun syncTaste(
        token: String,
        liked: List<Track>,
        history: List<Track>,
        profileId: String = "default",
        pendingLikedTrackIds: Set<String> = emptySet(),
        initialLikesReconciliation: Boolean = false,
        pendingHistoryTrackIds: Set<String> = emptySet(),
        initialHistoryReconciliation: Boolean = false,
    ): LibrarySyncResult {
        val remote = fetchLibrary(token, profileId, includePlaylists = false)
        val mergedLiked = mergeSyncLikes(
            remote = remote.likedTracks,
            local = liked,
            pendingLocalTrackIds = pendingLikedTrackIds,
            initialReconciliation = initialLikesReconciliation,
        )
        val mergedHistory = mergeSyncHistory(
            remote = remote.historyTracks,
            local = history,
            pendingLocalTrackIds = pendingHistoryTrackIds,
            initialReconciliation = initialHistoryReconciliation,
        ).take(50)
        val changedLikes = !syncTracksMatch(remote.likedTracks, mergedLiked)
        val changedHistory = !syncTracksMatch(remote.historyTracks, mergedHistory)
        if (changedLikes || changedHistory) {
            val body = JSONObject().put("profileId", profileId)
            if (changedLikes) {
                val details = JSONObject()
                mergedLiked.forEach { track -> details.put(track.id, track.toSnapshotJson()) }
                body
                    .put("likedTracks", JSONArray(mergedLiked.map { it.id }))
                    .put("likedTrackDetails", details)
            }
            if (changedHistory) {
                body.put("history", JSONArray(mergedHistory.map { it.toSnapshotJson() }))
            }
            withContext(Dispatchers.IO) {
                postJson("/api/sync/library", body, token)
            }
        }

        return LibrarySyncResult(
            summary = LibrarySyncSummary(mergedLiked.size, mergedHistory.size, 0),
            likedTracks = mergedLiked,
            historyTracks = mergedHistory,
            playlists = emptyList(),
        )
    }

    suspend fun setTrackLiked(
        token: String,
        track: Track,
        liked: Boolean,
        profileId: String = "default",
    ) = withContext(Dispatchers.IO) {
        requestJson(
            "/api/sync/likes",
            method = "PATCH",
            body = JSONObject()
                .put("profileId", profileId)
                .put("liked", liked)
                .put("track", track.toSnapshotJson()),
            bearerToken = token,
        )
        Unit
    }

    suspend fun syncHistory(
        token: String,
        history: List<Track>,
        profileId: String = "default",
        pendingHistoryTrackIds: Set<String> = emptySet(),
        initialHistoryReconciliation: Boolean = false,
    ): List<Track> {
        val remote = fetchHistoryTracks(token, profileId)
        val merged = mergeSyncHistory(
            remote = remote,
            local = history,
            pendingLocalTrackIds = pendingHistoryTrackIds,
            initialReconciliation = initialHistoryReconciliation,
        ).take(50)
        if (!syncTracksMatch(remote, merged)) {
            pushHistoryTracks(token, merged, profileId)
        }
        return merged
    }

    suspend fun fetchLibrary(
        token: String,
        profileId: String = "default",
        includePlaylists: Boolean = true,
    ): LibrarySyncResult = withContext(Dispatchers.IO) {
        val datasets = if (includePlaylists) "" else "&datasets=likes,history"
        val payload = getJson("/api/sync/library?profileId=" + encodeQuery(profileId) + datasets, token)
        val liked = parseLikedTracks(payload)
        val history = parseHistoryTracks(payload)
        val playlists = if (includePlaylists) parsePlaylists(payload) else emptyList()
        LibrarySyncResult(
            summary = LibrarySyncSummary(liked.size, history.size, playlists.size),
            likedTracks = liked,
            historyTracks = history,
            playlists = playlists,
        )
    }

    suspend fun fetchLikedTracks(token: String, profileId: String = "default"): List<Track> = withContext(Dispatchers.IO) {
        val payload = getJson("/api/sync/likes?profileId=" + encodeQuery(profileId), token)
        parseLikedTracks(payload)
    }

    suspend fun fetchHistoryTracks(token: String, profileId: String = "default"): List<Track> = withContext(Dispatchers.IO) {
        val payload = getJson("/api/sync/history?profileId=" + encodeQuery(profileId), token)
        parseHistoryTracks(payload)
    }

    suspend fun pushLikedTracks(token: String, liked: List<Track>, profileId: String = "default") = withContext(Dispatchers.IO) {
        val details = JSONObject()
        liked.forEach { track -> details.put(track.id, track.toSnapshotJson()) }

        postJson(
            "/api/sync/likes",
            JSONObject()
                .put("profileId", profileId)
                .put("likedTracks", JSONArray(liked.map { it.id }))
                .put("likedTrackDetails", details),
            token,
        )
        Unit
    }

    suspend fun pushHistoryTracks(token: String, history: List<Track>, profileId: String = "default") = withContext(Dispatchers.IO) {
        postJson(
            "/api/sync/history",
            JSONObject()
                .put("profileId", profileId)
                .put("history", JSONArray(history.map { it.toSnapshotJson() })),
            token,
        )
        Unit
    }

    suspend fun fetchPlaylists(token: String, profileId: String = "default"): List<Playlist> = withContext(Dispatchers.IO) {
        val payload = getJson("/api/sync/playlists?profileId=" + encodeQuery(profileId), token)
        parsePlaylists(payload)
    }

    suspend fun pushPlaylists(token: String, playlists: List<Playlist>, profileId: String = "default") = withContext(Dispatchers.IO) {
        postJson(
            "/api/sync/playlists",
            JSONObject()
                .put("profileId", profileId)
                .put("playlists", JSONArray(playlists.map { it.toSnapshotJson() })),
            token,
        )
        Unit
    }

    suspend fun createPlaylistInvite(token: String, playlistId: String): PlaylistInvite = withContext(Dispatchers.IO) {
        parsePlaylistInvite(
            postJson(
                "/api/playlists/invites",
                JSONObject().put("playlistId", playlistId),
                token,
            ),
        )
    }

    suspend fun previewPlaylistInvite(inviteToken: String): PlaylistInvitePreview = withContext(Dispatchers.IO) {
        parsePlaylistInvitePreview(
            getJson("/api/playlists/invites/" + encodePath(inviteToken)),
            fallbackToken = inviteToken,
        )
    }

    suspend fun acceptPlaylistInvite(token: String, inviteToken: String): Playlist = withContext(Dispatchers.IO) {
        val payload = postJson(
            "/api/playlists/invites/" + encodePath(inviteToken),
            JSONObject(),
            token,
        )
        parsePlaylist(payload.optJSONObject("playlist") ?: JSONObject())
            ?: throw SpiceApiException("Spice accepted the invite, but no playlist was returned.")
    }

    suspend fun fetchPendingPlaylistInvites(token: String): List<PendingPlaylistInvite> = withContext(Dispatchers.IO) {
        parsePendingPlaylistInvites(getJson("/api/account/invites", token))
    }

    suspend fun acceptPendingPlaylistInvite(token: String, playlistId: String) = withContext(Dispatchers.IO) {
        postJson("/api/account/invites/" + encodePath(playlistId) + "/accept", JSONObject(), token)
        Unit
    }

    suspend fun rejectPendingPlaylistInvite(token: String, playlistId: String) = withContext(Dispatchers.IO) {
        postJson("/api/account/invites/" + encodePath(playlistId) + "/reject", JSONObject(), token)
        Unit
    }

    suspend fun fetchProfileSummary(token: String, userId: String, profileId: String = "default"): ProfileSummary =
        withContext(Dispatchers.IO) {
            parseProfileSummary(
                getJson(
                    "/api/users/profile?userId=" + encodeQuery(userId) + "&profileId=" + encodeQuery(profileId),
                    token,
                ),
            )
        }

    suspend fun fetchProfiles(token: String): List<SpiceProfile> = withContext(Dispatchers.IO) {
        parseProfiles(getJson("/api/sync/profiles", token))
    }

    suspend fun syncProfiles(token: String, profiles: List<SpiceProfile>) = withContext(Dispatchers.IO) {
        postJson(
            "/api/sync/profiles",
            JSONObject().put("profiles", JSONArray(profiles.map { it.toSyncProfileJson() })),
            token,
        )
        Unit
    }

    suspend fun updateUsername(token: String, username: String, profileId: String = "default") = withContext(Dispatchers.IO) {
        requestJson(
            "/api/account/username",
            method = "PUT",
            body = JSONObject()
                .put("username", username)
                .put("profileId", profileId),
            bearerToken = token,
        )
        Unit
    }

    suspend fun fetchRemoteDevices(token: String): List<RemoteDevice> = withContext(Dispatchers.IO) {
        parseRemoteDevices(getJson("/api/remote/devices", token))
    }

    suspend fun forgetRemoteDevice(token: String, sourceDeviceId: String, deviceId: String) = withContext(Dispatchers.IO) {
        deleteJson(
            "/api/remote/devices?sourceDeviceId=" + encodeQuery(sourceDeviceId) + "&deviceId=" + encodeQuery(deviceId),
            JSONObject(),
            token,
        )
        Unit
    }

    suspend fun updateRemoteDevice(
        token: String,
        deviceId: String,
        displayName: String,
        currentTrack: Track?,
        isPlaying: Boolean,
        shuffleEnabled: Boolean = false,
        repeatMode: RepeatMode = RepeatMode.Off,
        progressMs: Long,
        durationMs: Long,
        volume: Int = 70,
        queue: List<Track> = emptyList(),
        queueIndex: Int = 0,
    ) = withContext(Dispatchers.IO) {
        postJson(
            "/api/remote/devices",
            JSONObject()
                .put("deviceId", deviceId)
                .put("displayName", displayName)
                .put("currentTrack", currentTrack?.toRemoteTrackJson() ?: JSONObject.NULL)
                .put("queue", JSONArray(queue.map { it.toRemoteTrackJson() }))
                .put("queueIndex", queueIndex.coerceIn(0, queue.lastIndex.coerceAtLeast(0)))
                .put("isPlaying", isPlaying)
                .put("shuffleEnabled", shuffleEnabled)
                .put("repeatMode", repeatMode.toRemoteValue())
                .put("progress", progressMs.coerceAtLeast(0) / 1000.0)
                .put("duration", durationMs.coerceAtLeast(0) / 1000.0)
                .put("volume", volume.coerceIn(0, 100)),
            token,
        )
        Unit
    }

    suspend fun sendRemoteCommand(
        token: String,
        targetDeviceId: String,
        sourceDeviceId: String,
        command: String,
        payload: JSONObject = JSONObject(),
    ) = withContext(Dispatchers.IO) {
        postJson(
            "/api/remote/commands",
            JSONObject()
                .put("targetDeviceId", targetDeviceId)
                .put("sourceDeviceId", sourceDeviceId)
                .put("command", command)
                .put("payload", payload),
            token,
        )
        Unit
    }

    suspend fun fetchRemoteCommands(token: String, deviceId: String): List<RemoteCommand> = withContext(Dispatchers.IO) {
        parseRemoteCommands(
            getJson("/api/remote/commands?deviceId=" + encodeQuery(deviceId), token),
        )
    }

    internal suspend fun awaitRemoteEvent(
        token: String,
        deviceId: String,
        onReady: () -> Unit = {},
    ): SpiceConnectRealtimeEvent? = withContext(Dispatchers.IO) {
        val connection = (URL(
            cloudBaseUrl + "/api/remote/events?deviceId=" + encodeQuery(deviceId),
        ).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 65_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "text/event-stream")
            setRequestProperty("Cache-Control", "no-cache")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("User-Agent", "Spice-Native-Android/1.0")
        }
        val cancellationHandle = coroutineContext[Job]?.invokeOnCompletion {
            connection.disconnect()
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                val body = connection.errorStream
                    ?.bufferedReader()
                    ?.use { it.readText() }
                    .orEmpty()
                val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
                val message = json.optString("message")
                    .ifEmpty { json.optString("error") }
                    .ifEmpty { "Spice Connect realtime stream returned HTTP $status." }
                throw SpiceApiException(message, status)
            }

            val parser = SpiceConnectRealtimeEventParser()
            connection.inputStream.bufferedReader().use { reader ->
                var receivedEvent: SpiceConnectRealtimeEvent? = null
                var line = reader.readLine()
                while (line != null && receivedEvent == null) {
                    val event = parser.consumeLine(line)
                    when (event) {
                        SpiceConnectRealtimeEvent.Ready -> onReady()
                        SpiceConnectRealtimeEvent.Command,
                        SpiceConnectRealtimeEvent.State
                        -> receivedEvent = event
                        null -> Unit
                    }
                    if (receivedEvent == null) line = reader.readLine()
                }
                receivedEvent
            }
        } finally {
            cancellationHandle?.dispose()
            connection.disconnect()
        }
    }

    suspend fun fetchLyrics(track: Track): LyricsPayload = withContext(Dispatchers.IO) {
        val title = cleanLyricsTitle(track.title)
        val artist = cleanLyricsArtist(track.artist)
        val durationSec = ((track.durationMs.takeIf { it > 0 } ?: 180_000L) / 1000).coerceAtLeast(1)
        val direct = runCatching {
            val params = "track_name=" + encodeQuery(title) +
                "&artist_name=" + encodeQuery(artist) +
                "&duration=" + durationSec
            requestExternalJson("https://lrclib.net/api/get?$params")
        }.getOrNull()
        val match = direct ?: runCatching {
            val params = "track_name=" + encodeQuery(title) + "&artist_name=" + encodeQuery(artist)
            val results = requestExternalArray("https://lrclib.net/api/search?$params")
            selectLyricsMatch(results, title, artist, durationSec.toInt())
        }.getOrNull()

        LyricsPayload(
            plainLyrics = match?.optString("plainLyrics").orEmpty(),
            syncedLyrics = match?.optString("syncedLyrics").orEmpty(),
            isSynced = !match?.optString("syncedLyrics").isNullOrBlank(),
        )
    }

    suspend fun fetchPlaylistMembers(token: String, playlistId: String): PlaylistMembersSummary = withContext(Dispatchers.IO) {
        parsePlaylistMembersSummary(
            getJson("/api/playlists/shared/members?playlistId=" + encodeQuery(playlistId), token),
            fallbackPlaylistId = playlistId,
        )
    }

    suspend fun invitePlaylistMember(token: String, playlistId: String, username: String): PlaylistMember = withContext(Dispatchers.IO) {
        val payload = postJson(
            "/api/playlists/shared/members",
            JSONObject()
                .put("playlistId", playlistId)
                .put("username", username.trim()),
            token,
        )
        parsePlaylistMember(payload.optJSONObject("member") ?: JSONObject())
            ?: throw SpiceApiException("Spice sent the invite, but no member was returned.")
    }

    suspend fun removePlaylistMember(token: String, playlistId: String, userId: String? = null) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("playlistId", playlistId)
        if (!userId.isNullOrBlank()) {
            body.put("userId", userId)
        }
        deleteJson("/api/playlists/shared/members", body, token)
        Unit
    }

    suspend fun fetchSharedPlaylistTracks(token: String, playlistId: String): SharedPlaylistTracks = withContext(Dispatchers.IO) {
        parseSharedPlaylistTracks(
            getJson("/api/playlists/shared/" + encodePath(playlistId) + "/tracks", token),
            fallbackPlaylistId = playlistId,
        )
    }

    suspend fun addSharedPlaylistTrack(token: String, playlistId: String, track: Track): Int = withContext(Dispatchers.IO) {
        val payload = postJson(
            "/api/playlists/shared/" + encodePath(playlistId) + "/tracks",
            JSONObject().put("track", track.toSnapshotJson()),
            token,
        )
        payload.optInt("position", -1)
    }

    suspend fun removeSharedPlaylistTrack(token: String, playlistId: String, position: Int) = withContext(Dispatchers.IO) {
        deleteJson(
            "/api/playlists/shared/" + encodePath(playlistId) + "/tracks",
            JSONObject().put("position", position),
            token,
        )
        Unit
    }

    suspend fun search(
        query: String,
        limit: Int = 12,
        provider: SearchProvider = SearchProvider.All,
    ): List<Track> = coroutineScope {
        val encoded = URLEncoder.encode(query.trim(), StandardCharsets.UTF_8.name())
        val safeLimit = limit.coerceIn(1, 30)
        val searches = buildList {
            if (provider != SearchProvider.YouTube) {
                add(async(Dispatchers.IO) { runCatching { searchSoundCloudCandidates(query.trim(), safeLimit) } })
            }
            if (provider != SearchProvider.SoundCloud) {
                add(async(Dispatchers.IO) {
                    runCatching { searchYouTubeCandidates(query.trim(), encoded, safeLimit) }
                })
            }
        }
        val results = searches.awaitAll()
        val successful = results.mapNotNull { it.getOrNull() }

        if (successful.isEmpty()) {
            throw results.firstNotNullOf { it.exceptionOrNull() }
        }

        mergeProviderTracks(successful, safeLimit)
    }

    suspend fun resolvePlayable(track: Track, quality: StreamQuality): ResolvedPlayback {
        if (track.localUri.isNotBlank()) {
            return ResolvedPlayback(
                track,
                ResolvedStream(track.localUri, container = "local", protocol = "offline", contentType = "audio/*"),
                usedFallback = false,
            )
        }
        val directFailure = try {
            return ResolvedPlayback(track, resolve(track, quality), usedFallback = false)
        } catch (error: Exception) {
            error
        }

        val query = fallbackSearchQuery(track)
        val alternatives = withContext(Dispatchers.IO) {
            searchSoundCloudCandidates(query, 30)
        }
        var lastFailure: Exception = directFailure

        for (alternative in soundCloudFallbackCandidates(track, alternatives).take(6)) {
            try {
                return ResolvedPlayback(
                    track = alternative,
                    stream = resolve(alternative, quality),
                    usedFallback = true,
                )
            } catch (error: Exception) {
                lastFailure = error
            }
        }

        throw SpiceApiException(
            message = "No full-length direct or SoundCloud source is available for this track.",
            cause = lastFailure,
        )
    }

    suspend fun resolve(track: Track, quality: StreamQuality): ResolvedStream = withContext(Dispatchers.IO) {
        val candidates = if (track.sourceId.startsWith("soundcloud")) {
            val directCandidates = runCatching {
                soundCloudDirectClient.resolveStreams(soundCloudTrackId(track.id), quality)
            }.getOrDefault(emptyList())

            if (directCandidates.isNotEmpty()) {
                orderStreamCandidates(directCandidates, quality)
            } else {
                val endpoint = localMediaPath("/sc/track/" + encodePath(soundCloudTrackId(track.id)) + "?quality=" + quality.apiValue())
                localRuntimeStreamCandidates(endpoint, quality)
            }
        } else {
            val directCandidates = runCatching {
                newPipeYouTubeClient.resolveStreams(track.id, quality)
            }.getOrDefault(emptyList())

            if (directCandidates.isNotEmpty()) {
                orderStreamCandidates(directCandidates, quality)
            } else {
                localRuntimeStreamCandidates(localMediaPath("/yt/track/" + encodePath(track.id)), quality)
            }
        }

        if (candidates.isEmpty()) {
            throw SpiceApiException("No Android-compatible stream is available for this track.")
        }

        val failures = mutableListOf<String>()
        for (candidate in candidates) {
            val probe = streamProbe.probe(candidate.url)
            if (probe.playable) {
                return@withContext candidate.copy(
                    contentType = candidate.contentType.ifBlank { probe.contentType },
                )
            }
            failures += probe.message
        }

        throw SpiceApiException(
            "Spice resolved ${candidates.size} stream(s), but Android could not open them. " +
                failures.firstOrNull().orEmpty(),
        )
    }

    private fun localRuntimeStreamCandidates(endpoint: String, quality: StreamQuality): List<ResolvedStream> {
        val payload = getJson(endpoint, lane = ApiLane.Media)
        return orderStreamCandidates(parseStreamCandidates(payload), quality)
    }

    private fun searchSoundCloudCandidates(query: String, limit: Int): List<Track> {
        val encoded = URLEncoder.encode(query.trim(), StandardCharsets.UTF_8.name())
        val results = listOf(
            runCatching { soundCloudDirectClient.search(query, limit) },
            runCatching {
                searchProvider(localMediaPath("/sc/search?q=" + encoded + "&limit=" + limit), "soundcloud")
            },
        )
        val successful = results.mapNotNull { it.getOrNull() }

        if (successful.isEmpty()) {
            throw results.firstNotNullOf { it.exceptionOrNull() }
        }

        return mergeProviderTracks(successful, limit)
    }

    private fun searchYouTubeCandidates(query: String, encodedQuery: String, limit: Int): List<Track> {
        val results = listOf(
            runCatching { newPipeYouTubeClient.search(query, limit) },
            runCatching {
                searchProvider(localMediaPath("/yt/search?q=" + encodedQuery + "&limit=" + limit), "youtube_music")
            },
        )
        val successful = results.mapNotNull { it.getOrNull() }

        if (successful.isEmpty()) {
            throw results.firstNotNullOf { it.exceptionOrNull() }
        }

        return mergeProviderTracks(successful, limit)
    }

    private fun getJson(path: String, bearerToken: String? = null, lane: ApiLane = ApiLane.Cloud): JSONObject =
        requestJson(path, method = "GET", bearerToken = bearerToken, lane = lane)

    private fun postJson(path: String, body: JSONObject, bearerToken: String? = null): JSONObject =
        requestJson(path, method = "POST", body = body, bearerToken = bearerToken)

    private fun deleteJson(path: String, body: JSONObject, bearerToken: String? = null): JSONObject =
        requestJson(path, method = "DELETE", body = body, bearerToken = bearerToken)

    private fun requestJson(
        path: String,
        method: String,
        body: JSONObject? = null,
        bearerToken: String? = null,
        lane: ApiLane = ApiLane.Cloud,
    ): JSONObject {
        val baseUrls = when (lane) {
            ApiLane.Cloud -> listOf(cloudBaseUrl)
            ApiLane.Media -> mediaBaseUrls
        }.filter { it.isNotBlank() }

        if (baseUrls.isEmpty()) {
            throw SpiceApiException(mediaRuntimeMessage())
        }

        var lastFailure: Exception? = null
        for (baseUrl in baseUrls) {
            try {
                return requestJsonFromBase(baseUrl, path, method, body, bearerToken, lane)
            } catch (error: Exception) {
                lastFailure = error
                if (!shouldTryNextBase(error)) break
            }
        }

        if (lane == ApiLane.Media) {
            throw SpiceApiException(mediaRuntimeMessage(), cause = lastFailure)
        }

        throw lastFailure ?: SpiceApiException("Spice API request failed.")
    }

    private fun requestJsonFromBase(
        baseUrl: String,
        path: String,
        method: String,
        body: JSONObject?,
        bearerToken: String?,
        lane: ApiLane,
    ): JSONObject {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 15_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "Spice-Native-Android/0.7")
            if (lane == ApiLane.Media) {
                setRequestProperty("x-spice-api-namespace", "local")
            }
            if (!bearerToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $bearerToken")
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }

        try {
            if (body != null) {
                connection.outputStream.use { output ->
                    output.write(body.toString().toByteArray(StandardCharsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                val errorCode = json.optString("error").ifEmpty { null }
                val message = json.optString("message")
                    .ifEmpty { errorCode ?: "Spice API request failed with HTTP " + status + "." }
                throw SpiceApiException(
                    message = message,
                    statusCode = status,
                    code = errorCode,
                    moderationStatus = json.optString("status").ifEmpty { null },
                    moderationExpiresAt = json.optString("expiresAt").ifEmpty { null },
                    moderationReason = json.optString("reason").ifEmpty { null },
                )
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    private fun encodePath(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

    private fun encodeQuery(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())

    private fun shouldTryNextBase(error: Exception): Boolean {
        val status = (error as? SpiceApiException)?.statusCode
        return status == null || status in setOf(404, 410, 429, 500, 502, 503, 504)
    }

    private fun mediaRuntimeMessage(): String =
        "This provider needs the local SPICE runtime fallback. Standalone SoundCloud and NewPipe YouTube playback can run on the phone; for local fallback, start the runtime and run adb reverse tcp:3939 tcp:3939."

    private fun searchProvider(path: String, sourceId: String): List<Track> =
        parseTracks(getJson(path, lane = ApiLane.Media), sourceId)

    private fun requestExternalJson(url: String): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 10_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "Spice-Native-Android/1.0")
        }
        try {
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            if (status !in 200..299) {
                throw SpiceApiException("Lyrics lookup failed with HTTP $status.")
            }
            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun requestExternalArray(url: String): JSONArray {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 10_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "Spice-Native-Android/1.0")
        }
        try {
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            if (status !in 200..299) {
                throw SpiceApiException("Lyrics search failed with HTTP $status.")
            }
            return JSONArray(body)
        } finally {
            connection.disconnect()
        }
    }
}

data class ResolvedPlayback(
    val track: Track,
    val stream: ResolvedStream,
    val usedFallback: Boolean,
)

interface StreamProbe {
    fun probe(url: String): StreamProbeResult
}

data class StreamProbeResult(
    val playable: Boolean,
    val statusCode: Int? = null,
    val contentType: String = "",
    val message: String = "",
)

private class HttpStreamProbe : StreamProbe {
    override fun probe(url: String): StreamProbeResult {
        if (url.startsWith("android.resource://")) {
            return StreamProbeResult(playable = true)
        }

        val connection = runCatching { URL(url).openConnection() as HttpURLConnection }.getOrElse { error ->
            return StreamProbeResult(
                playable = false,
                message = error.message ?: "Stream URL is malformed.",
            )
        }

        connection.requestMethod = "GET"
        connection.connectTimeout = 6_000
        connection.readTimeout = 8_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Accept", "*/*")
        connection.setRequestProperty("Range", "bytes=0-0")
        connection.setRequestProperty("User-Agent", "Spice-Native-Android/0.7")

        return try {
            val status = connection.responseCode
            val contentType = connection.contentType.orEmpty()
            if (status in 200..299) {
                connection.inputStream?.close()
                StreamProbeResult(
                    playable = true,
                    statusCode = status,
                    contentType = contentType,
                )
            } else {
                connection.errorStream?.close()
                StreamProbeResult(
                    playable = false,
                    statusCode = status,
                    contentType = contentType,
                    message = "Stream probe failed with HTTP $status.",
                )
            }
        } catch (error: Exception) {
            StreamProbeResult(
                playable = false,
                message = error.message ?: "Stream probe failed before playback.",
            )
        } finally {
            connection.disconnect()
        }
    }
}

private enum class ApiLane {
    Cloud,
    Media,
}

internal fun parseStreamCandidates(payload: JSONObject): List<ResolvedStream> {
    val streams = payload.optJSONArray("streams") ?: return emptyList()

    return buildList {
        for (index in 0 until streams.length()) {
            val stream = streams.optJSONObject(index) ?: continue
            val url = stream.optString("url").trim()
            if (!isAndroidPlayableStreamUrl(url)) continue
            add(
                ResolvedStream(
                    url = url,
                    container = stream.optString("container").trim(),
                    bitrate = stream.optLong("bitrate", 0).coerceAtLeast(0),
                    protocol = stream.optString("protocol").trim(),
                    contentType = stream.optString("contentType")
                        .ifEmpty { stream.optString("mimeType") }
                        .trim(),
                    expiresAt = stream.optString("expiresAt").trim(),
                ),
            )
        }
    }
}

internal fun orderStreamCandidates(candidates: List<ResolvedStream>, quality: StreamQuality): List<ResolvedStream> {
    val bySupport = compareByDescending<ResolvedStream> { androidStreamSupportScore(it) }
    return when (quality) {
        StreamQuality.High -> candidates.sortedWith(bySupport.thenByDescending { it.bitrate })
        StreamQuality.Standard -> candidates.sortedWith(
            bySupport.thenBy { stream -> stream.bitrate.takeIf { it > 0 }?.let { kotlin.math.abs(it - 160_000) } ?: Long.MAX_VALUE },
        )
        StreamQuality.DataSaver -> candidates.sortedWith(
            bySupport.thenBy { stream -> stream.bitrate.takeIf { it > 0 } ?: Long.MAX_VALUE },
        )
    }
}

internal fun isAndroidPlayableStreamUrl(url: String): Boolean {
    if (url.startsWith("android.resource://")) return true
    val parsed = runCatching { URL(url) }.getOrNull() ?: return false
    val protocol = parsed.protocol.lowercase(Locale.ROOT)
    val host = parsed.host.lowercase(Locale.ROOT)
    return protocol == "https" || (protocol == "http" && isLoopbackHost(host))
}

internal fun localMediaPath(providerPath: String): String {
    val normalized = providerPath.removePrefix("/api").let { path ->
        if (path.startsWith("/")) path else "/$path"
    }
    return "/api/local$normalized"
}

internal fun parseBaseUrls(value: String): List<String> =
    value.split(',')
        .map { it.trim() }
        .filter { it.isNotBlank() }

internal fun normalizeBaseUrl(value: String): String = value.trim().trimEnd('/')

private fun androidStreamSupportScore(stream: ResolvedStream): Int {
    val descriptor = listOf(stream.protocol, stream.container, stream.contentType, stream.url)
        .joinToString(" ")
        .lowercase(Locale.ROOT)

    return when {
        "progressive" in descriptor -> 120
        "mpeg" in descriptor || "mp4" in descriptor || "m4a" in descriptor || "aac" in descriptor -> 110
        "hls" in descriptor || "m3u8" in descriptor -> 100
        "webm" in descriptor || "opus" in descriptor -> 80
        descriptor.contains("audio/") -> 70
        else -> 40
    }
}

private fun isLoopbackHost(host: String): Boolean =
    host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"

internal fun parseTracks(payload: JSONObject, defaultSourceId: String): List<Track> {
    val tracks = payload.optJSONArray("tracks") ?: return emptyList()

    return buildList {
        for (index in 0 until tracks.length()) {
            val item = tracks.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            val title = item.optString("title").trim()
            if (id.isEmpty() || title.isEmpty()) continue

            val artists = item.optJSONArray("artists")
            val artist = artists?.optJSONObject(0)?.optString("name")?.trim().orEmpty()
            val album = item.optJSONObject("album")?.optString("title")?.trim().orEmpty()
            add(
                Track(
                    id = id,
                    title = title,
                    artist = artist.ifEmpty { "Unknown artist" },
                    album = album,
                    durationMs = item.optLong("durationMs", 0).coerceAtLeast(0),
                    artworkUrl = item.optString("artworkUrl"),
                    sourceId = item.optString("sourceId").ifEmpty { defaultSourceId },
                ),
            )
        }
    }
}

internal fun parseAccountSession(payload: JSONObject): AccountSession {
    val token = payload.optString("token").trim()
    val accountPayload = payload.optJSONObject("account")
        ?: payload.optJSONObject("user")
        ?: JSONObject()
    val account = parseAccount(accountPayload)

    if (token.isEmpty() || account.id.isEmpty()) {
        throw SpiceApiException("Spice returned an invalid account session.")
    }

    return AccountSession(token, account)
}

internal fun parseEmailVerificationChallenge(payload: JSONObject): EmailVerificationChallenge {
    val registrationId = payload.optString("registrationId").trim()
    val email = payload.optString("email").trim()
    if (!payload.optBoolean("verificationRequired", false) || registrationId.isEmpty() || email.isEmpty()) {
        throw SpiceApiException("Spice returned an invalid email verification challenge.")
    }
    return EmailVerificationChallenge(
        registrationId = registrationId,
        email = email,
        expiresAt = payload.optString("expiresAt").trim(),
    )
}

internal fun parsePairedDeviceCredential(payload: JSONObject): PairedDeviceCredential {
    val accessToken = payload.optString("accessToken").trim()
    val authorizationId = payload.optString("authorizationId").trim()
    val ownerUserId = payload.optString("userId").trim()
    val expiresAt = payload.optString("expiresAt").trim()
    val expiresAtEpochMs = parseSpiceTimestampEpochMs(expiresAt)
    val device = payload.optJSONObject("device") ?: JSONObject()
    val deviceId = device.optString("deviceId").trim()
    val displayName = device.optString("displayName").trim().ifEmpty { "Spice Android" }
    if (!accessToken.startsWith("spice_pair_") || payload.optString("scope") != "spice_connect"
        || authorizationId.isEmpty() || ownerUserId.isEmpty() || expiresAtEpochMs <= 0L || deviceId.isEmpty()
    ) {
        throw SpiceApiException("Spice returned an invalid paired-device credential.")
    }
    return PairedDeviceCredential(
        accessToken = accessToken,
        authorizationId = authorizationId,
        ownerUserId = ownerUserId,
        expiresAt = expiresAt,
        expiresAtEpochMs = expiresAtEpochMs,
        deviceId = deviceId,
        displayName = displayName,
    )
}

internal fun parseAccount(payload: JSONObject): SpiceAccount =
    SpiceAccount(
        id = payload.optString("id").trim(),
        email = payload.optString("email").trim(),
        username = payload.optString("username").trim(),
        displayName = payload.optString("displayName").trim(),
        avatarUrl = payload.optString("avatarUrl").trim(),
        accountRole = payload.optString("accountRole", "user").trim().ifEmpty { "user" },
        isAdmin = payload.optBoolean("isAdmin", false),
        moderationStatus = payload.optJSONObject("moderation")?.optString("status", "active").orEmpty()
            .ifEmpty { "active" },
        moderationExpiresAt = payload.optJSONObject("moderation")?.optString("expiresAt").orEmpty(),
        moderationReason = payload.optJSONObject("moderation")?.optString("reason").orEmpty(),
    )

internal fun parseProfileSummary(payload: JSONObject): ProfileSummary {
    val profile = payload.optJSONObject("profile") ?: JSONObject()
    val stats = payload.optJSONObject("stats") ?: JSONObject()
    return ProfileSummary(
        profile = SpiceProfile(
            id = profile.optString("id").trim().ifEmpty { "default" },
            displayName = profile.optString("displayName").trim()
                .ifEmpty { profile.optString("username").trim() }
                .ifEmpty { "Spice Listener" },
            username = profile.optString("username").trim(),
            avatarUrl = profile.optString("avatarUrl").trim(),
            bio = profile.optString("bio").trim(),
            gradient = profile.optString("gradient").trim().ifEmpty { "linear-gradient(135deg, #a855f7, #ec4899)" },
            joinedAt = profile.optString("joinedAt").trim(),
            isPrivate = profile.optBoolean("isPrivate", false),
            songsPlayed = stats.optInt("songsPlayed", profile.optInt("songsPlayed", 0)).coerceAtLeast(0),
            passcode = profile.optString("passcode").trim(),
        ),
        stats = ProfileStats(
            songsPlayed = stats.optInt("songsPlayed", 0).coerceAtLeast(0),
            likedCount = stats.optInt("likedCount", 0).coerceAtLeast(0),
            playlistsCount = stats.optInt("playlistsCount", 0).coerceAtLeast(0),
        ),
    )
}

internal fun parseProfiles(payload: JSONObject): List<SpiceProfile> {
    val profiles = payload.optJSONArray("profiles") ?: return emptyList()
    return buildList {
        for (index in 0 until profiles.length()) {
            val item = profiles.optJSONObject(index) ?: continue
            add(
                SpiceProfile(
                    id = item.optString("id").trim().ifEmpty { "default" },
                    displayName = item.optString("displayName").trim()
                        .ifEmpty { item.optString("username").trim() }
                        .ifEmpty { "Spice Listener" },
                    username = item.optString("username").trim()
                        .ifEmpty { item.optString("cloudUsername").trim() },
                    avatarUrl = item.optString("avatarUrl").trim(),
                    bio = item.optString("bio").trim(),
                    gradient = item.optString("gradient").trim().ifEmpty { "linear-gradient(135deg, #a855f7, #ec4899)" },
                    joinedAt = item.optString("joinedAt").trim(),
                    isPrivate = item.optBoolean("isPrivate", false),
                    songsPlayed = item.optInt("songsPlayed", 0).coerceAtLeast(0),
                    passcode = item.optString("passcode").trim(),
                ),
            )
        }
    }
}

internal fun parseRemoteDevices(payload: JSONObject): List<RemoteDevice> {
    val devices = payload.optJSONArray("devices") ?: return emptyList()
    return buildList {
        for (index in 0 until devices.length()) {
            val item = devices.optJSONObject(index) ?: continue
            parseRemoteDevice(item)?.let(::add)
        }
    }
}

internal fun parseRemoteDevice(item: JSONObject): RemoteDevice? {
    val deviceId = item.optString("deviceId").trim()
    val displayName = item.optString("displayName").trim()
    if (deviceId.isEmpty() || displayName.isEmpty()) return null
    val queue = parseRemoteTracks(item.optJSONArray("queue")).take(80)
    return RemoteDevice(
        deviceId = deviceId,
        displayName = displayName,
        currentTrack = parseRemoteTrack(item.optJSONObject("currentTrack")),
        queue = queue,
        queueIndex = item.optInt("queueIndex", 0).coerceIn(0, queue.lastIndex.coerceAtLeast(0)),
        isPlaying = item.optBoolean("isPlaying", false),
        shuffleEnabled = item.optBoolean("shuffleEnabled", false),
        repeatMode = parseRemoteRepeatMode(item.optString("repeatMode")),
        progressMs = (item.optDouble("progress", 0.0) * 1000).toLong().coerceAtLeast(0),
        durationMs = (item.optDouble("duration", 0.0) * 1000).toLong().coerceAtLeast(0),
        volume = item.optInt("volume", 70).coerceIn(0, 100),
        updatedAt = item.optString("updatedAt").trim(),
        lastSeenSeconds = item.optLong("lastSeenSeconds", 0L).coerceAtLeast(0L),
        rememberedUntil = item.optString("rememberedUntil").trim(),
        isOnline = item.optBoolean("isOnline", true),
    )
}

internal fun parseRemoteCommands(payload: JSONObject): List<RemoteCommand> {
    val commands = payload.optJSONArray("commands") ?: return emptyList()
    return buildList {
        for (index in 0 until commands.length()) {
            val item = commands.optJSONObject(index) ?: continue
            val id = item.optString("id").trim()
            val sourceDeviceId = item.optString("sourceDeviceId").trim()
            val command = item.optString("command").trim()
            if (id.isEmpty() || command.isEmpty()) continue
            val commandPayload = item.optJSONObject("payload") ?: JSONObject()
            val payloadTrack = parseRemoteTrack(
                commandPayload.optJSONObject("track")
                    ?: commandPayload.optJSONObject("currentTrack"),
            )
            val payloadQueue = parseRemoteTracks(commandPayload.optJSONArray("queue"))
            val payloadQueueIndex = commandPayload.optInt("queueIndex", 0).coerceAtLeast(0)
            val seekPositionMs = when {
                commandPayload.has("positionMs") -> commandPayload.optLong("positionMs").coerceAtLeast(0)
                commandPayload.has("progressMs") -> commandPayload.optLong("progressMs").coerceAtLeast(0)
                commandPayload.has("progress") -> (commandPayload.optDouble("progress", 0.0) * 1000).toLong().coerceAtLeast(0)
                commandPayload.has("position") -> (commandPayload.optDouble("position", 0.0) * 1000).toLong().coerceAtLeast(0)
                else -> null
            }
            val volume = commandPayload.optInt("volume", -1).takeIf {
                commandPayload.has("volume") && it in 0..100
            }
            val shuffleEnabled = when {
                commandPayload.has("shuffleEnabled") -> commandPayload.optBoolean("shuffleEnabled")
                commandPayload.has("enabled") -> commandPayload.optBoolean("enabled")
                else -> null
            }
            val repeatValue = when {
                commandPayload.has("repeatMode") -> commandPayload.optString("repeatMode")
                commandPayload.has("mode") -> commandPayload.optString("mode")
                else -> null
            }
            val repeatMode = repeatValue?.let(::parseRemoteRepeatMode)
            val shouldPlay = commandPayload.optBoolean("isPlaying").takeIf { commandPayload.has("isPlaying") }
            val connected = commandPayload.optBoolean("connected").takeIf { commandPayload.has("connected") }
            val liked = commandPayload.optBoolean("liked").takeIf { commandPayload.has("liked") }
            val playlistId = commandPayload.optString("playlistId").trim()
            val playlistTitle = commandPayload.optString("playlistTitle").trim()
            val transferId = commandPayload.optString("transferId").trim()
            val failureReason = commandPayload.optString("reason").trim()
            add(
                RemoteCommand(
                    id = id,
                    sourceDeviceId = sourceDeviceId,
                    command = command,
                    createdAt = item.optString("createdAt").trim(),
                    payloadJson = commandPayload.toString(),
                    payloadTrack = payloadTrack,
                    payloadQueue = payloadQueue,
                    payloadQueueIndex = payloadQueueIndex,
                    seekPositionMs = seekPositionMs,
                    volume = volume,
                    shuffleEnabled = shuffleEnabled,
                    repeatMode = repeatMode,
                    shouldPlay = shouldPlay,
                    connected = connected,
                    liked = liked,
                    playlistId = playlistId,
                    playlistTitle = playlistTitle,
                    transferId = transferId,
                    failureReason = failureReason,
                ),
            )
        }
    }
}

internal fun parseRemoteRepeatMode(value: String): RepeatMode = when (value.trim().lowercase()) {
    "all" -> RepeatMode.All
    "one" -> RepeatMode.One
    else -> RepeatMode.Off
}

internal fun RepeatMode.toRemoteValue(): String = when (this) {
    RepeatMode.Off -> "none"
    RepeatMode.All -> "all"
    RepeatMode.One -> "one"
}

private fun parseRemoteTracks(payload: JSONArray?): List<Track> {
    val tracks = payload ?: return emptyList()
    return buildList {
        for (index in 0 until tracks.length()) {
            parseRemoteTrack(tracks.optJSONObject(index))?.let(::add)
        }
    }
}

private fun parseRemoteTrack(payload: JSONObject?): Track? {
    val item = payload ?: return null
    val id = item.optString("id").trim().ifEmpty { item.optString("videoId").trim() }
    val title = item.optString("title").trim().ifEmpty { item.optString("track").trim() }
    if (id.isEmpty() && title.isEmpty()) return null
    val artists = item.optJSONArray("artists")
    val artist = artists?.optJSONObject(0)?.optString("name")?.trim().orEmpty()
        .ifEmpty { item.optString("artist").trim() }
    return Track(
        id = id.ifEmpty { title },
        title = title.ifEmpty { "Track" },
        artist = artist.ifEmpty { "Unknown artist" },
        album = item.optString("album").trim(),
        durationMs = item.optLong("durationMs", 0).takeIf { it > 0 }
            ?: (item.optDouble("duration", 0.0) * 1000).toLong().coerceAtLeast(0),
        artworkUrl = item.optString("artworkUrl").trim().ifEmpty { item.optString("albumArt").trim() },
        sourceId = item.optString("sourceId").trim().ifEmpty { "youtube_music" },
    )
}

internal fun parsePlaylists(payload: JSONObject): List<Playlist> {
    val playlists = payload.optJSONArray("playlists") ?: return emptyList()

    return buildList {
        for (index in 0 until playlists.length()) {
            val item = playlists.optJSONObject(index) ?: continue
            parsePlaylist(item)?.let(::add)
        }
    }
}

internal fun parseLikedTracks(payload: JSONObject): List<Track> {
    val ids = payload.optJSONArray("likedTracks") ?: JSONArray()
    val details = payload.optJSONObject("likedTrackDetails") ?: JSONObject()
    return buildList {
        for (index in 0 until ids.length()) {
            val id = ids.optString(index).trim()
            if (id.isEmpty()) continue
            add(parseTrackSnapshot(details.optJSONObject(id), fallbackId = id))
        }
    }
}

internal fun parseHistoryTracks(payload: JSONObject): List<Track> {
    val history = payload.optJSONArray("history") ?: JSONArray()
    return buildList {
        for (index in 0 until history.length()) {
            val item = history.optJSONObject(index) ?: continue
            add(parseTrackSnapshot(item))
        }
    }
}

internal fun parsePlaylist(item: JSONObject): Playlist? {
    val id = item.optString("id").trim()
    val title = item.optString("title").trim()
    if (id.isEmpty() || title.isEmpty()) return null
    val tracks = item.optJSONArray("tracks") ?: JSONArray()
    return Playlist(
        id = id,
        title = title,
        description = item.optString("description"),
        coverUrl = item.optString("coverUrl"),
        shared = item.optBoolean("shared", false),
        shareRole = item.optString("shareRole"),
        isPublic = item.optBoolean("isPublic", true),
        tracks = buildList {
            for (trackIndex in 0 until tracks.length()) {
                tracks.optJSONObject(trackIndex)?.let { track ->
                    add(parseTrackSnapshot(track))
                }
            }
        },
    )
}

internal fun parsePlaylistInvite(payload: JSONObject): PlaylistInvite {
    val token = payload.optString("token").trim()
    val inviteUrl = payload.optString("inviteUrl").trim()
    if (token.isEmpty() || inviteUrl.isEmpty()) {
        throw SpiceApiException("Spice returned an invalid playlist invite.")
    }
    return PlaylistInvite(
        token = token,
        inviteUrl = inviteUrl,
        expiresAt = payload.optString("expiresAt").trim(),
    )
}

internal fun parsePlaylistInvitePreview(payload: JSONObject, fallbackToken: String = ""): PlaylistInvitePreview {
    val invite = payload.optJSONObject("invite") ?: JSONObject()
    val playlist = parsePlaylist(payload.optJSONObject("playlist") ?: JSONObject())
        ?: throw SpiceApiException("Spice returned an invalid playlist invite preview.")
    val token = invite.optString("token").trim().ifEmpty { fallbackToken.trim() }
    if (token.isEmpty()) {
        throw SpiceApiException("Spice returned an invalid playlist invite token.")
    }
    return PlaylistInvitePreview(
        token = token,
        role = invite.optString("role").trim(),
        expiresAt = invite.optString("expiresAt").trim(),
        playlist = playlist,
    )
}

internal fun parsePendingPlaylistInvites(payload: JSONObject): List<PendingPlaylistInvite> {
    val invites = payload.optJSONArray("invites") ?: return emptyList()
    return buildList {
        for (index in 0 until invites.length()) {
            val item = invites.optJSONObject(index) ?: continue
            val playlistId = item.optString("playlistId").trim()
            val playlistTitle = item.optString("playlistTitle").trim()
            if (playlistId.isEmpty() || playlistTitle.isEmpty()) continue
            add(
                PendingPlaylistInvite(
                    playlistId = playlistId,
                    playlistTitle = playlistTitle,
                    ownerId = item.optString("ownerId").trim(),
                    ownerUsername = item.optString("ownerUsername").trim(),
                    ownerDisplayName = item.optString("ownerDisplayName").trim(),
                ),
            )
        }
    }
}

internal fun parsePlaylistMembersSummary(payload: JSONObject, fallbackPlaylistId: String = ""): PlaylistMembersSummary {
    val owner = parsePlaylistMember(payload.optJSONObject("owner") ?: JSONObject())
        ?: throw SpiceApiException("Spice returned an invalid playlist owner.")
    val members = payload.optJSONArray("members") ?: JSONArray()
    return PlaylistMembersSummary(
        playlistId = payload.optString("playlistId").trim().ifEmpty { fallbackPlaylistId.trim() },
        owner = owner,
        members = buildList {
            for (index in 0 until members.length()) {
                members.optJSONObject(index)?.let { member ->
                    parsePlaylistMember(member)?.let(::add)
                }
            }
        },
        maxMembers = payload.optInt("maxMembers", 4).coerceAtLeast(0),
    )
}

internal fun parseSharedPlaylistTracks(payload: JSONObject, fallbackPlaylistId: String = ""): SharedPlaylistTracks {
    val tracks = payload.optJSONArray("tracks") ?: JSONArray()
    return SharedPlaylistTracks(
        playlistId = payload.optString("playlistId").trim().ifEmpty { fallbackPlaylistId.trim() },
        role = payload.optString("role").trim(),
        tracks = buildList {
            for (index in 0 until tracks.length()) {
                val item = tracks.optJSONObject(index) ?: continue
                val position = item.optInt("position", -1)
                if (position < 0) continue
                add(
                    SharedPlaylistTrack(
                        position = position,
                        track = parseTrackSnapshot(item),
                        addedBy = parsePlaylistMember(item.optJSONObject("addedBy") ?: JSONObject()),
                    ),
                )
            }
        },
    )
}

internal fun parsePlaylistMember(payload: JSONObject): PlaylistMember? {
    val userId = payload.optString("userId").trim()
    if (userId.isEmpty()) return null
    return PlaylistMember(
        userId = userId,
        username = payload.optString("username").trim(),
        displayName = payload.optString("displayName").trim().ifEmpty { payload.optString("username").trim().ifEmpty { "Unknown" } },
        avatarUrl = payload.optString("avatarUrl").trim(),
        role = payload.optString("role").trim(),
        status = payload.optString("status").trim(),
        acceptedAt = payload.optString("acceptedAt").trim(),
    )
}

internal fun parseTrackSnapshot(payload: JSONObject?, fallbackId: String = ""): Track {
    val item = payload ?: JSONObject()
    val id = item.optString("id").ifEmpty { fallbackId }.trim()
    val artists = item.optJSONArray("artists")
    val artist = artists?.optJSONObject(0)?.optString("name")?.trim().orEmpty()
    return Track(
        id = id,
        title = item.optString("title").trim().ifEmpty { "Track" },
        artist = artist.ifEmpty { item.optString("artist").trim().ifEmpty { "Unknown artist" } },
        durationMs = item.optLong("durationMs", 0).coerceAtLeast(0),
        artworkUrl = item.optString("artworkUrl"),
        sourceId = item.optString("sourceId").ifEmpty { "youtube_music" },
    )
}

internal fun Track.toSnapshotJson(): JSONObject =
    JSONObject()
        .put("id", id)
        .put("title", title)
        .put("artists", JSONArray().put(JSONObject().put("name", artist)))
        .put("artworkUrl", artworkUrl)
        .put("durationMs", durationMs)
        .put("sourceId", sourceId)

internal fun Track.toRemoteTrackJson(): JSONObject =
    toSnapshotJson()
        .put("artist", artist)
        .put("album", album)

internal fun Playlist.toSnapshotJson(): JSONObject =
    JSONObject()
        .put("id", id)
        .put("title", title)
        .put("description", description)
        .put("coverUrl", coverUrl)
        .put("shared", shared)
        .put("shareRole", shareRole)
        .put("isPublic", isPublic)
        .put("tracks", JSONArray(tracks.map { it.toSnapshotJson() }))

internal fun SpiceProfile.toSyncProfileJson(): JSONObject =
    JSONObject()
        .put("id", id.ifBlank { "default" })
        .put("displayName", displayName.ifBlank { "Spice Listener" })
        .put("cloudUsername", username.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
        .put("bio", bio)
        .put("gradient", gradient.ifBlank { "linear-gradient(135deg, #a855f7, #ec4899)" })
        .put("songsPlayed", songsPlayed.coerceAtLeast(0))
        .put("joinedAt", joinedAt.ifBlank { "July 2026" })
        .put("passcode", passcode.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
        .put("avatarUrl", avatarUrl.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
        .put("isPrivate", isPrivate)

internal fun mergeSyncTracks(remote: List<Track>, local: List<Track>): List<Track> {
    val merged = linkedMapOf<String, Track>()
    (remote + local).forEach { incoming ->
        val id = incoming.id.trim()
        if (id.isEmpty()) return@forEach
        val existing = merged[id]
        merged[id] = if (existing == null) incoming else mergeTrackSnapshots(existing, incoming)
    }
    return merged.values.toList()
}

internal fun mergeSyncLikes(
    remote: List<Track>,
    local: List<Track>,
    pendingLocalTrackIds: Set<String> = emptySet(),
    initialReconciliation: Boolean = false,
): List<Track> {
    val merged = linkedMapOf<String, Track>()
    remote.forEach { track ->
        track.id.trim().takeIf(String::isNotEmpty)?.let { id -> merged[id] = track }
    }
    if (initialReconciliation) {
        local.forEach { track ->
            val id = track.id.trim()
            if (id.isEmpty()) return@forEach
            merged[id] = merged[id]?.let { mergeTrackSnapshots(it, track) } ?: track
        }
    }
    val localById = local.associateBy { it.id.trim() }
    pendingLocalTrackIds.forEach { pendingId ->
        val localTrack = localById[pendingId]
        if (localTrack == null) {
            merged.remove(pendingId)
        } else {
            merged[pendingId] = merged[pendingId]
                ?.let { mergeTrackSnapshots(it, localTrack) }
                ?: localTrack
        }
    }
    return merged.values.toList()
}

internal fun mergeSyncHistory(
    remote: List<Track>,
    local: List<Track>,
    pendingLocalTrackIds: Set<String> = emptySet(),
    initialReconciliation: Boolean = false,
): List<Track> {
    val localPending = local.filter { it.id in pendingLocalTrackIds }
    val ordered = when {
        localPending.isNotEmpty() -> localPending + remote + local
        initialReconciliation -> remote + local
        else -> remote
    }
    val merged = linkedMapOf<String, Track>()
    ordered.forEach { incoming ->
        val id = incoming.id.trim()
        if (id.isEmpty()) return@forEach
        val existing = merged[id]
        merged[id] = if (existing == null) incoming else mergeTrackSnapshots(existing, incoming)
    }
    return merged.values.take(50)
}

internal fun syncTracksMatch(first: List<Track>, second: List<Track>): Boolean =
    first.size == second.size && first.indices.all { index -> first[index] == second[index] }

internal fun syncPlaylistsMatch(first: List<Playlist>, second: List<Playlist>): Boolean =
    first.size == second.size && first.indices.all { index -> first[index] == second[index] }

internal fun mergeSyncPlaylists(remote: List<Playlist>, local: List<Playlist>): List<Playlist> {
    val merged = linkedMapOf<String, Playlist>()
    (remote + local).forEach { incoming ->
        val id = incoming.id.trim()
        if (id.isEmpty()) return@forEach
        val existing = merged[id]
        merged[id] = if (existing == null) {
            incoming
        } else {
            existing.copy(
                title = incoming.title.ifBlank { existing.title },
                description = incoming.description.ifBlank { existing.description },
                coverUrl = incoming.coverUrl.ifBlank { existing.coverUrl },
                shared = existing.shared || incoming.shared,
                shareRole = incoming.shareRole.ifBlank { existing.shareRole },
                isPublic = incoming.isPublic,
                tracks = mergeSyncPlaylistTracks(existing.tracks, incoming.tracks),
            )
        }
    }
    return merged.values.toList()
}

internal fun mergeSyncPlaylistTracks(preferred: List<Track>, incoming: List<Track>): List<Track> {
    val merged = preferred.toMutableList()
    val preferredIndexes = mutableMapOf<String, MutableList<Int>>()
    merged.forEachIndexed { index, track ->
        preferredIndexes.getOrPut(track.id) { mutableListOf() }.add(index)
    }
    val incomingOccurrences = mutableMapOf<String, Int>()
    incoming.forEach { track ->
        val occurrence = incomingOccurrences.getOrDefault(track.id, 0)
        incomingOccurrences[track.id] = occurrence + 1
        val preferredIndex = preferredIndexes[track.id]?.getOrNull(occurrence)
        if (preferredIndex == null) {
            merged += track
        } else {
            merged[preferredIndex] = mergeTrackSnapshots(merged[preferredIndex], track)
        }
    }
    return merged
}

private fun mergeTrackSnapshots(base: Track, incoming: Track): Track =
    Track(
        id = incoming.id.ifEmpty { base.id },
        title = incoming.title.takeUnless { it == "Track" }.orEmpty().ifEmpty { base.title },
        artist = incoming.artist.takeUnless { it == "Unknown artist" }.orEmpty().ifEmpty { base.artist },
        album = incoming.album.ifEmpty { base.album },
        durationMs = incoming.durationMs.takeIf { it > 0 } ?: base.durationMs,
        artworkUrl = incoming.artworkUrl.ifEmpty { base.artworkUrl },
        sourceId = incoming.sourceId.ifEmpty { base.sourceId },
        localUri = incoming.localUri.ifEmpty { base.localUri },
    )

internal fun mergeProviderTracks(providers: List<List<Track>>, limit: Int): List<Track> {
    val interleaved = buildList {
        val longest = providers.maxOfOrNull { it.size } ?: 0
        for (index in 0 until longest) {
            providers.forEach { tracks -> tracks.getOrNull(index)?.let(::add) }
        }
    }
    return interleaved
        .distinctBy { track ->
            track.title.lowercase(Locale.ROOT) + "|" + track.artist.lowercase(Locale.ROOT)
        }
        .take(limit.coerceAtLeast(0))
}
internal fun soundCloudTrackId(id: String): String = id.substringAfter("soundcloud:")

internal fun fallbackSearchQuery(track: Track): String =
    listOf(track.title, track.artist)
        .filter { it.isNotBlank() }
        .joinToString(" ")

internal fun soundCloudFallbackCandidates(requested: Track, candidates: List<Track>): List<Track> =
    candidates.filter { candidate ->
        candidate.sourceId.startsWith("soundcloud") && candidate.id != requested.id
    }

internal fun StreamQuality.apiValue(): String = when (this) {
    StreamQuality.High -> "high"
    StreamQuality.Standard -> "standard"
    StreamQuality.DataSaver -> "low"
}

private fun cleanLyricsTitle(title: String): String =
    title
        .replace(Regex("""\s*(?:\([^)]*(?:official|video|audio|visualizer|lyrics?|remaster(?:ed)?|4k|hd)[^)]*\)|\[[^\]]*(?:official|video|audio|visualizer|lyrics?|remaster(?:ed)?|4k|hd)[^\]]*\])""", RegexOption.IGNORE_CASE), "")
        .trim()

private fun cleanLyricsArtist(artist: String): String =
    artist
        .replace(Regex("""\s*-\s*topic$""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""\s+official$""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""vevo$""", RegexOption.IGNORE_CASE), "")
        .trim()

private fun selectLyricsMatch(results: JSONArray, title: String, artist: String, durationSec: Int): JSONObject? =
    buildList {
        for (index in 0 until results.length()) {
            val item = results.optJSONObject(index) ?: continue
            if (item.optString("syncedLyrics").isBlank() && item.optString("plainLyrics").isBlank()) continue
            val score = scoreLyricsMatch(item, title, artist, durationSec)
            if (score >= 7) add(item to score)
        }
    }
        .sortedByDescending { it.second }
        .firstOrNull()
        ?.first

private fun scoreLyricsMatch(track: JSONObject, title: String, artist: String, durationSec: Int): Int {
    val normalizedTitle = normalizeMatchText(title)
    val normalizedArtist = normalizeMatchText(artist)
    val candidateTitle = normalizeMatchText(track.optString("trackName"))
    val candidateArtist = normalizeMatchText(track.optString("artistName"))
    var score = 0
    if (candidateTitle == normalizedTitle) score += 8
    else if (candidateTitle.contains(normalizedTitle) || normalizedTitle.contains(candidateTitle)) score += 4
    if (normalizedArtist.isNotBlank() && candidateArtist == normalizedArtist) score += 6
    else if (normalizedArtist.isNotBlank() && (candidateArtist.contains(normalizedArtist) || normalizedArtist.contains(candidateArtist))) score += 3
    val durationDifference = kotlin.math.abs(track.optInt("duration", durationSec) - durationSec)
    if (durationDifference <= 3) score += 3 else if (durationDifference <= 10) score += 1
    if (track.optString("syncedLyrics").isNotBlank()) score += 1
    return score
}

private fun normalizeMatchText(value: String): String =
    value
        .lowercase(Locale.ROOT)
        .replace(Regex("""[^a-z0-9]+"""), " ")
        .trim()

class SpiceApiException(
    override val message: String,
    val statusCode: Int? = null,
    val code: String? = null,
    val moderationStatus: String? = null,
    val moderationExpiresAt: String? = null,
    val moderationReason: String? = null,
    cause: Throwable? = null,
) : Exception(message, cause)
