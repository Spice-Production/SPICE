package xyz.spiceapp.engine.provider

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.engine.StreamQuality

class SoundCloudDirectClientTest {
    @Test
    fun parsesPlayableSoundCloudSearchResults() {
        val tracks = parseSoundCloudTracks(
            JSONObject(
                """
                {
                  "collection": [
                    {
                      "id": 42,
                      "title": "Standalone",
                      "duration": 180000,
                      "artwork_url": "https://i1.sndcdn.com/artworks-large.jpg",
                      "policy": "ALLOW",
                      "streamable": true,
                      "user": {
                        "id": 7,
                        "username": "Phone Artist",
                        "avatar_url": "https://i1.sndcdn.com/avatar-large.jpg"
                      }
                    },
                    {
                      "id": 43,
                      "title": "Preview",
                      "policy": "SNIP",
                      "streamable": true,
                      "user": {"username": "Preview Artist"}
                    },
                    {
                      "id": 44,
                      "title": "Blocked",
                      "policy": "BLOCK",
                      "streamable": true,
                      "user": {"username": "Blocked Artist"}
                    }
                  ]
                }
                """.trimIndent(),
            ),
            10,
        )

        assertEquals(1, tracks.size)
        assertEquals("soundcloud:42", tracks.single().id)
        assertEquals("Standalone", tracks.single().title)
        assertEquals("Phone Artist", tracks.single().artist)
        assertEquals("https://i1.sndcdn.com/artworks-t500x500.jpg", tracks.single().artworkUrl)
    }

    @Test
    fun extractsSupportedSoundCloudTranscodings() {
        val candidates = parseSoundCloudTranscodingCandidates(
            JSONObject(
                """
                {
                  "media": {
                    "transcodings": [
                      {
                        "url": "https://api-v2.soundcloud.com/media/1",
                        "preset": "mp3_0_1",
                        "format": {
                          "protocol": "progressive",
                          "mime_type": "audio/mpeg"
                        }
                      },
                      {
                        "url": "https://api-v2.soundcloud.com/media/2",
                        "preset": "aac_160k",
                        "format": {
                          "protocol": "hls",
                          "mime_type": "audio/mp4"
                        }
                      },
                      {
                        "url": "https://api-v2.soundcloud.com/media/3",
                        "preset": "opus_64k",
                        "format": {
                          "protocol": "encrypted_hls",
                          "mime_type": "audio/ogg"
                        }
                      }
                    ]
                  }
                }
                """.trimIndent(),
            ),
        )

        assertEquals(2, candidates.size)
        assertEquals("progressive", candidates.first().protocol)

        val progressive = soundCloudStreamFromTranscoding(candidates.first(), "https://cdn.example.test/audio.mp3")
        val hls = soundCloudStreamFromTranscoding(candidates.last(), "https://cdn.example.test/audio.m3u8")

        assertEquals("mp3", progressive.container)
        assertEquals(128000, progressive.bitrate)
        assertEquals("m4a", hls.container)
        assertEquals(160000, hls.bitrate)
        assertEquals("https://cdn.example.test/audio.mp3", sortSoundCloudStreams(listOf(hls, progressive), StreamQuality.High).first().url)
    }

    @Test
    fun appendsSoundCloudQueryParamsWithoutDroppingExistingQuery() {
        val url = appendQuery(
            "https://api-v2.soundcloud.com/media/1?existing=true",
            mapOf("track_authorization" to "token value", "client_id" to "abc123"),
        )

        assertTrue(url.startsWith("https://api-v2.soundcloud.com/media/1?existing=true&"))
        assertTrue(url.contains("track_authorization=token+value"))
        assertTrue(url.contains("client_id=abc123"))
    }

    @Test
    fun extractsSoundCloudClientIdFromRuntimeConfig() {
        val clientId = extractSoundCloudClientId(
            """{"host":"m.soundcloud.com","clientId":"abc123","buildVersion":"1"}""",
        )

        assertEquals("abc123", clientId)
    }
}
