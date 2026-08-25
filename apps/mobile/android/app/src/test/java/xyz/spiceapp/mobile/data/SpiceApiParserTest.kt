package xyz.spiceapp.mobile.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.mobile.model.RepeatMode
import xyz.spiceapp.mobile.model.StreamQuality
import xyz.spiceapp.mobile.model.Track

class SpiceApiParserTest {
    @Test
    fun parsesYouTubeTrackMetadata() {
        val tracks = parseTracks(
            JSONObject(
                """
                {
                  "tracks": [{
                    "id": "abc123",
                    "title": "Digital Love",
                    "artists": [{"name": "Daft Punk"}],
                    "album": {"title": "Discovery"},
                    "durationMs": 301000,
                    "artworkUrl": "https://example.test/art.jpg",
                    "sourceId": "youtube_music"
                  }]
                }
                """.trimIndent(),
            ),
            "youtube_music",
        )

        assertEquals(1, tracks.size)
        assertEquals("Digital Love", tracks.single().title)
        assertEquals("Daft Punk", tracks.single().artist)
        assertEquals("Discovery", tracks.single().album)
        assertEquals(301000, tracks.single().durationMs)
        assertEquals("youtube_music", tracks.single().sourceId)
    }

    @Test
    fun appliesSoundCloudDefaultsAndSkipsInvalidTracks() {
        val tracks = parseTracks(
            JSONObject(
                """
                {
                  "tracks": [
                    {
                      "id": "soundcloud:42",
                      "title": "One More Time",
                      "artists": [{"name": "Daft Punk"}]
                    },
                    {"id": "", "title": "Invalid"}
                  ]
                }
                """.trimIndent(),
            ),
            "soundcloud",
        )

        assertEquals(1, tracks.size)
        assertEquals("soundcloud", tracks.single().sourceId)
        assertEquals("42", soundCloudTrackId(tracks.single().id))
    }

    @Test
    fun interleavesAndDeduplicatesProviders() {
        val youtube = listOf(
            xyz.spiceapp.mobile.model.Track("yt-1", "First", "Artist", sourceId = "youtube_music"),
            xyz.spiceapp.mobile.model.Track("yt-2", "Second", "Artist", sourceId = "youtube_music"),
        )
        val soundCloud = listOf(
            xyz.spiceapp.mobile.model.Track("sc-1", "Third", "Artist", sourceId = "soundcloud"),
            xyz.spiceapp.mobile.model.Track("sc-2", "First", "Artist", sourceId = "soundcloud"),
        )

        val merged = mergeProviderTracks(listOf(youtube, soundCloud), 4)

        assertEquals(listOf("yt-1", "sc-1", "yt-2"), merged.map { it.id })
    }

    @Test
    fun mapsQualityToSoundCloudApiValues() {
        assertEquals("high", StreamQuality.High.apiValue())
        assertEquals("standard", StreamQuality.Standard.apiValue())
        assertEquals("low", StreamQuality.DataSaver.apiValue())
        assertTrue(soundCloudTrackId("plain-id") == "plain-id")
    }

    @Test
    fun parsesOnlyAndroidPlayableStreamUrls() {
        val streams = parseStreamCandidates(
            JSONObject(
                """
                {
                  "streams": [
                    {
                      "url": "http://127.0.0.1:3939/api/local/sc/stream/1",
                      "container": "m4a",
                      "protocol": "progressive",
                      "bitrate": 128000,
                      "contentType": "audio/mp4"
                    },
                    {
                      "url": "https://cdn.example.test/audio.m3u8",
                      "container": "hls",
                      "protocol": "hls",
                      "bitrate": 96000,
                      "contentType": "application/vnd.apple.mpegurl"
                    },
                    {
                      "url": "http://192.168.1.10:3939/api/local/sc/stream/2",
                      "container": "m4a"
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(2, streams.size)
        assertEquals("progressive", streams.first().protocol)
        assertEquals("audio/mp4", streams.first().contentType)
        assertTrue(isAndroidPlayableStreamUrl("https://cdn.example.test/audio.m4a"))
        assertTrue(isAndroidPlayableStreamUrl("http://127.0.0.1:3939/api/local/yt/stream/1"))
        assertTrue(!isAndroidPlayableStreamUrl("http://192.168.1.10:3939/api/local/yt/stream/1"))
    }

    @Test
    fun ordersStreamCandidatesByQualityAndSupport() {
        val streams = parseStreamCandidates(
            JSONObject(
                """
                {
                  "streams": [
                    {
                      "url": "https://cdn.example.test/low.m3u8",
                      "container": "hls",
                      "protocol": "hls",
                      "bitrate": 64000
                    },
                    {
                      "url": "http://127.0.0.1:3939/api/local/sc/stream/high",
                      "container": "m4a",
                      "protocol": "progressive",
                      "bitrate": 256000
                    },
                    {
                      "url": "http://127.0.0.1:3939/api/local/sc/stream/standard",
                      "container": "m4a",
                      "protocol": "progressive",
                      "bitrate": 128000
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals("high", orderStreamCandidates(streams, StreamQuality.High).first().url.substringAfterLast("/"))
        assertEquals("standard", orderStreamCandidates(streams, StreamQuality.Standard).first().url.substringAfterLast("/"))
        assertEquals("standard", orderStreamCandidates(streams, StreamQuality.DataSaver).first().url.substringAfterLast("/"))
    }

    @Test
    fun buildsLocalMediaNamespacePaths() {
        assertEquals("/api/local/sc/search?q=lofi", localMediaPath("/sc/search?q=lofi"))
        assertEquals("/api/local/yt/track/abc", localMediaPath("/api/yt/track/abc"))
        assertEquals(listOf("http://127.0.0.1:3939", "https://example.test"), parseBaseUrls(" http://127.0.0.1:3939, https://example.test "))
    }

    @Test
    fun buildsAndFiltersSoundCloudFallbackCandidates() {
        val requested = xyz.spiceapp.mobile.model.Track(
            "yt-1",
            "Digital Love",
            "Daft Punk",
            sourceId = "youtube_music",
        )
        val candidates = listOf(
            xyz.spiceapp.mobile.model.Track("sc-1", "Digital Love cover", "Artist", sourceId = "soundcloud"),
            xyz.spiceapp.mobile.model.Track("yt-2", "Digital Love", "Artist", sourceId = "youtube_music"),
        )

        assertEquals("Digital Love Daft Punk", fallbackSearchQuery(requested))
        assertEquals(listOf("sc-1"), soundCloudFallbackCandidates(requested, candidates).map { it.id })
    }

    @Test
    fun parsesAccountSessionPayload() {
        val session = parseAccountSession(
            JSONObject(
                """
                {
                  "token": "session-token",
                  "account": {
                    "id": "user-1",
                    "email": "listener@example.test",
                    "accountRole": "admin",
                    "isAdmin": true
                  }
                }
                """.trimIndent(),
            ),
        )

        assertEquals("session-token", session.token)
        assertEquals("user-1", session.account.id)
        assertEquals("listener@example.test", session.account.email)
        assertTrue(session.account.isAdmin)
    }

    @Test
    fun parsesEmailVerificationChallengePayload() {
        val challenge = parseEmailVerificationChallenge(
            JSONObject(
                """
                {
                  "verificationRequired": true,
                  "registrationId": "registration-1",
                  "email": "li******@example.test",
                  "expiresAt": "2026-07-13T12:10:00.000Z"
                }
                """.trimIndent(),
            ),
        )

        assertEquals("registration-1", challenge.registrationId)
        assertEquals("li******@example.test", challenge.email)
        assertEquals("2026-07-13T12:10:00.000Z", challenge.expiresAt)
    }

    @Test
    fun parsesScopedPairedDeviceCredential() {
        val credential = parsePairedDeviceCredential(
            JSONObject(
                """
                {
                  "authorizationId": "authorization-1",
                  "userId": "owner-1",
                  "accessToken": "spice_pair_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
                  "tokenType": "Bearer",
                  "scope": "spice_connect",
                  "expiresAt": "2026-08-12T12:10:00.000Z",
                  "device": {
                    "deviceId": "android-device-1",
                    "displayName": "Spice Android"
                  }
                }
                """.trimIndent(),
            ),
        )

        assertEquals("authorization-1", credential.authorizationId)
        assertEquals("owner-1", credential.ownerUserId)
        assertEquals("android-device-1", credential.deviceId)
        assertEquals("Spice Android", credential.displayName)
        assertTrue(credential.expiresAtEpochMs > 0L)
    }

    @Test
    fun parsesAndSerializesTrackSnapshotsForSync() {
        val track = parseTrackSnapshot(
            JSONObject(
                """
                {
                  "id": "sync-1",
                  "title": "Something About Us",
                  "artists": [{"name": "Daft Punk"}],
                  "durationMs": 232000,
                  "artworkUrl": "https://example.test/cover.jpg",
                  "sourceId": "youtube_music"
                }
                """.trimIndent(),
            ),
        )

        val snapshot = track.toSnapshotJson()

        assertEquals("sync-1", track.id)
        assertEquals("Daft Punk", track.artist)
        assertEquals("Something About Us", snapshot.getString("title"))
        assertEquals("Daft Punk", snapshot.getJSONArray("artists").getJSONObject(0).getString("name"))
    }

    @Test
    fun mergesRemoteAndLocalSyncTracksWithLocalDetailsWinning() {
        val remote = listOf(
            xyz.spiceapp.mobile.model.Track("one", "Track", "Unknown artist", sourceId = "youtube_music"),
            xyz.spiceapp.mobile.model.Track("two", "Remote", "Cloud", sourceId = "soundcloud"),
        )
        val local = listOf(
            xyz.spiceapp.mobile.model.Track("one", "Local title", "Local artist", artworkUrl = "https://example.test/a.jpg", sourceId = "youtube_music"),
        )

        val merged = mergeSyncTracks(remote, local)

        assertEquals(listOf("one", "two"), merged.map { it.id })
        assertEquals("Local title", merged.first().title)
        assertEquals("Local artist", merged.first().artist)
        assertEquals("https://example.test/a.jpg", merged.first().artworkUrl)
    }

    @Test
    fun parsesPlaylistSnapshots() {
        val playlists = parsePlaylists(
            JSONObject(
                """
                {
                  "playlists": [{
                    "id": "playlist-1",
                    "title": "Favorites",
                    "description": "Daily plays",
                    "shared": false,
                    "shareRole": "owner",
                    "isPublic": true,
                    "tracks": [{
                      "id": "track-1",
                      "title": "Voyager",
                      "artists": [{"name": "Daft Punk"}],
                      "sourceId": "youtube_music"
                    }]
                  }]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(1, playlists.size)
        assertEquals("Favorites", playlists.single().title)
        assertEquals("owner", playlists.single().shareRole)
        assertEquals("track-1", playlists.single().tracks.single().id)
        assertEquals("Daft Punk", playlists.single().tracks.single().artist)
    }

    @Test
    fun parsesPlaylistInviteResponse() {
        val invite = parsePlaylistInvite(
            JSONObject(
                """
                {
                  "token": "invite-token",
                  "inviteUrl": "https://music.spice-app.xyz/?playlistInvite=invite-token",
                  "expiresAt": "2026-08-01T00:00:00.000Z"
                }
                """.trimIndent(),
            ),
        )

        assertEquals("invite-token", invite.token)
        assertEquals("https://music.spice-app.xyz/?playlistInvite=invite-token", invite.inviteUrl)
        assertEquals("2026-08-01T00:00:00.000Z", invite.expiresAt)
    }

    @Test
    fun parsesPlaylistInvitePreview() {
        val preview = parsePlaylistInvitePreview(
            JSONObject(
                """
                {
                  "invite": {
                    "token": "invite-token",
                    "role": "listener",
                    "expiresAt": "2026-08-01T00:00:00.000Z"
                  },
                  "playlist": {
                    "id": "playlist-1",
                    "title": "Road Mix",
                    "shared": true,
                    "shareRole": "listener",
                    "tracks": []
                  }
                }
                """.trimIndent(),
            ),
        )

        assertEquals("invite-token", preview.token)
        assertEquals("listener", preview.role)
        assertEquals("Road Mix", preview.playlist.title)
        assertTrue(preview.playlist.shared)
    }

    @Test
    fun parsesPendingPlaylistInvites() {
        val invites = parsePendingPlaylistInvites(
            JSONObject(
                """
                {
                  "invites": [{
                    "playlistId": "playlist-1",
                    "playlistTitle": "Road Mix",
                    "ownerId": "owner-1",
                    "ownerUsername": "spiceowner",
                    "ownerDisplayName": "Spice Owner"
                  }]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(1, invites.size)
        assertEquals("playlist-1", invites.single().playlistId)
        assertEquals("Spice Owner", invites.single().ownerDisplayName)
    }

    @Test
    fun parsesPlaylistMembersSummary() {
        val members = parsePlaylistMembersSummary(
            JSONObject(
                """
                {
                  "playlistId": "playlist-1",
                  "owner": {
                    "userId": "owner-1",
                    "username": "owner",
                    "displayName": "Owner",
                    "role": "owner"
                  },
                  "members": [{
                    "userId": "member-1",
                    "username": "listener",
                    "displayName": "Listener",
                    "role": "editor",
                    "status": "pending"
                  }],
                  "maxMembers": 4
                }
                """.trimIndent(),
            ),
        )

        assertEquals("playlist-1", members.playlistId)
        assertEquals("owner-1", members.owner.userId)
        assertEquals("member-1", members.members.single().userId)
        assertEquals("pending", members.members.single().status)
        assertEquals(4, members.maxMembers)
    }

    @Test
    fun parsesSharedPlaylistTracks() {
        val tracks = parseSharedPlaylistTracks(
            JSONObject(
                """
                {
                  "playlistId": "playlist-1",
                  "role": "editor",
                  "tracks": [{
                    "id": "track-1",
                    "title": "Voyager",
                    "artists": [{"name": "Daft Punk"}],
                    "sourceId": "youtube_music",
                    "position": 3,
                    "addedBy": {
                      "userId": "member-1",
                      "username": "listener",
                      "displayName": "Listener"
                    }
                  }]
                }
                """.trimIndent(),
            ),
        )

        assertEquals("playlist-1", tracks.playlistId)
        assertEquals("editor", tracks.role)
        assertEquals(3, tracks.tracks.single().position)
        assertEquals("track-1", tracks.tracks.single().track.id)
        assertEquals("member-1", tracks.tracks.single().addedBy?.userId)
    }

    @Test
    fun mergesPlaylistTracksByPlaylistId() {
        val remote = listOf(
            xyz.spiceapp.mobile.model.Playlist(
                id = "playlist-1",
                title = "Favorites",
                tracks = listOf(xyz.spiceapp.mobile.model.Track("remote", "Remote", "Cloud")),
            ),
        )
        val local = listOf(
            xyz.spiceapp.mobile.model.Playlist(
                id = "playlist-1",
                title = "Favorites",
                tracks = listOf(xyz.spiceapp.mobile.model.Track("local", "Local", "Phone")),
            ),
        )

        val merged = mergeSyncPlaylists(remote, local)

        assertEquals(1, merged.size)
        assertEquals(listOf("remote", "local"), merged.single().tracks.map { it.id })
    }

    @Test
    fun playlistMergeKeepsDuplicateOccurrencesFromCloud() {
        val remoteTracks = listOf(
            Track("a", "A", "Artist"),
            Track("b", "B", "Artist"),
            Track("a", "A duplicate", "Artist"),
        )
        val localTracks = remoteTracks.take(2)

        val merged = mergeSyncPlaylistTracks(remoteTracks, localTracks)

        assertEquals(listOf("a", "b", "a"), merged.map { it.id })
        assertEquals(3, merged.size)
    }

    @Test
    fun parsesSpiceConnectDeviceQueueAndPlaybackState() {
        val device = parseRemoteDevices(
            JSONObject(
                """
                {
                  "devices": [{
                    "deviceId": "desktop-1",
                    "displayName": "Studio PC",
                    "currentTrack": {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"},
                    "queue": [
                      {"id": "track-1", "title": "Digital Love", "artist": "Daft Punk"},
                      {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"}
                    ],
                    "queueIndex": 1,
                    "isPlaying": true,
                    "shuffleEnabled": true,
                    "repeatMode": "one",
                    "progress": 12.5,
                    "duration": 180
                    ,"isOnline": false,
                    "rememberedUntil": "2026-08-21T00:00:00.000Z"
                  }]
                }
                """.trimIndent(),
            ),
        ).single()

        assertEquals("Studio PC", device.displayName)
        assertEquals(listOf("track-1", "track-2"), device.queue.map { it.id })
        assertEquals(1, device.queueIndex)
        assertEquals(12_500, device.progressMs)
        assertTrue(device.isPlaying)
        assertTrue(device.shuffleEnabled)
        assertEquals(RepeatMode.One, device.repeatMode)
        assertFalse(device.isOnline)
        assertEquals("2026-08-21T00:00:00.000Z", device.rememberedUntil)
    }

    @Test
    fun parsesSpiceConnectTrackHandoffAndSeekPayloads() {
        val commands = parseRemoteCommands(
            JSONObject(
                """
                {
                  "commands": [
                    {
                      "id": "command-1",
                      "sourceDeviceId": "studio-phone",
                      "command": "play_track",
                      "payload": {
                        "track": {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"},
                        "queue": [
                          {"id": "track-1", "title": "Digital Love", "artist": "Daft Punk"},
                          {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"}
                        ],
                        "queueIndex": 1
                      }
                    },
                    {"id": "command-2", "command": "seek", "payload": {"progress": 42.25}},
                    {"id": "command-3", "command": "shuffle", "payload": {"enabled": true}},
                    {"id": "command-4", "command": "repeat", "payload": {"mode": "all"}},
                    {"id": "command-5", "command": "volume", "payload": {"volume": 84}},
                    {
                      "id": "command-6",
                      "command": "handoff",
                      "payload": {
                        "track": {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"},
                        "queue": [{"id": "track-2", "title": "Voyager", "artist": "Daft Punk"}],
                        "queueIndex": 0,
                        "progress": 58.5,
                        "volume": 71,
                        "isPlaying": true,
                        "shuffleEnabled": true,
                        "repeatMode": "one"
                      }
                    },
                    {
                      "id": "command-7",
                      "sourceDeviceId": "studio-phone",
                      "command": "connect",
                      "payload": {"connected": true}
                    },
                    {
                      "id": "command-8",
                      "command": "set_like",
                      "payload": {
                        "track": {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"},
                        "liked": true
                      }
                    },
                    {
                      "id": "command-9",
                      "command": "add_to_playlist",
                      "payload": {
                        "track": {"id": "track-2", "title": "Voyager", "artist": "Daft Punk"},
                        "playlistId": "playlist-1",
                        "playlistTitle": "Road trip"
                      }
                    },
                    {
                      "id": "command-10",
                      "command": "play_queue_index",
                      "payload": {"queueIndex": 37}
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(listOf("track-1", "track-2"), commands.first().payloadQueue.map { it.id })
        assertEquals("studio-phone", commands.first().sourceDeviceId)
        assertEquals(1, commands.first().payloadQueueIndex)
        assertEquals(42_250L, commands[1].seekPositionMs)
        assertEquals(true, commands[2].shuffleEnabled)
        assertEquals(RepeatMode.All, commands[3].repeatMode)
        assertEquals(84, commands[4].volume)
        assertEquals(58_500L, commands[5].seekPositionMs)
        assertEquals(true, commands[5].shouldPlay)
        assertEquals(true, commands[5].shuffleEnabled)
        assertEquals(RepeatMode.One, commands[5].repeatMode)
        assertEquals(true, commands[6].connected)
        assertEquals(true, commands[7].liked)
        assertEquals("track-2", commands[7].payloadTrack?.id)
        assertEquals(37, commands[9].payloadQueueIndex)
        assertEquals("playlist-1", commands[8].playlistId)
        assertEquals("Road trip", commands[8].playlistTitle)
        assertEquals("one", RepeatMode.One.toRemoteValue())
        assertEquals(RepeatMode.Off, parseRemoteRepeatMode("invalid"))
    }
    @Test
    fun parsesListenerFavoritesFromCollaborativePayload() {
        val favorites = parseListenerFavorites(
            JSONObject(
                """
                {
                  "tracks": [
                    {
                      "trackId": "hit1",
                      "sourceId": "youtube_music",
                      "title": "Community Hit",
                      "artists": [{"name": "Shared Artist"}],
                      "artworkUrl": "https://example.test/hit.jpg",
                      "durationMs": 210000,
                      "listenerCount": 7
                    },
                    {"trackId": "", "sourceId": "youtube_music", "title": "No Id"},
                    {"trackId": "placeholder", "sourceId": "youtube_music", "title": "Track"}
                  ],
                  "neighborCount": 4
                }
                """.trimIndent(),
            ),
        )
        assertEquals(1, favorites.size)
        assertEquals("hit1", favorites.single().id)
        assertEquals("Community Hit", favorites.single().title)
        assertEquals("Shared Artist", favorites.single().artist)
        assertEquals(210000, favorites.single().durationMs)
    }
    @Test
    fun listenerFavoritesWithEmptyPayloadYieldNothing() {
        assertEquals(0, parseListenerFavorites(JSONObject()).size)
    }
}
