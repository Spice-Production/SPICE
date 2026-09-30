package xyz.spiceapp.engine.resolve

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track

class StreamResolverTest {
    @Test
    fun parsesOnlyAndroidPlayableStreamUrls() {
        val streams = parseStreamCandidates(
            JSONObject(
                """
                {
                  "streams": [
                    {"url": "http://127.0.0.1:3939/api/local/sc/stream/1", "container": "m4a", "protocol": "progressive", "bitrate": 128000, "contentType": "audio/mp4"},
                    {"url": "https://cdn.example.test/audio.m3u8", "container": "hls", "protocol": "hls", "bitrate": 96000},
                    {"url": "http://192.168.1.10:3939/api/local/sc/stream/2", "container": "m4a"}
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(2, streams.size)
        assertEquals("progressive", streams.first().protocol)
        assertTrue(isAndroidPlayableStreamUrl("https://cdn.example.test/audio.m4a"))
        assertFalse(isAndroidPlayableStreamUrl("http://192.168.1.10:3939/api/local/yt/stream/1"))
    }

    @Test
    fun ordersStreamCandidatesByQualityAndSupport() {
        val streams = parseStreamCandidates(
            JSONObject(
                """
                {
                  "streams": [
                    {"url": "https://cdn.example.test/low.m3u8", "container": "hls", "protocol": "hls", "bitrate": 64000},
                    {"url": "http://127.0.0.1:3939/api/local/sc/stream/high", "container": "m4a", "protocol": "progressive", "bitrate": 256000},
                    {"url": "http://127.0.0.1:3939/api/local/sc/stream/standard", "container": "m4a", "protocol": "progressive", "bitrate": 128000}
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
    fun buildsLocalRuntimePathsAndFallbackCandidates() {
        assertEquals("/api/local/sc/search?q=lofi", localMediaPath("/sc/search?q=lofi"))
        assertEquals("/api/local/yt/track/abc", localMediaPath("/api/yt/track/abc"))
        assertEquals("42", soundCloudTrackId("soundcloud:42"))
        assertEquals("low", StreamQuality.DataSaver.apiValue())

        val requested = Track("yt-1", "Digital Love", "Daft Punk", sourceId = "youtube_music")
        val candidates = listOf(
            Track("sc-1", "Digital Love cover", "Artist", sourceId = "soundcloud"),
            Track("yt-2", "Digital Love", "Artist", sourceId = "youtube_music"),
        )
        assertEquals("Digital Love Daft Punk", fallbackSearchQuery(requested))
        assertEquals(listOf("sc-1"), soundCloudFallbackCandidates(requested, candidates).map { it.id })
    }

    @Test
    fun interleavesAndDeduplicatesProviders() {
        val youtube = listOf(
            Track("yt-1", "First", "Artist", sourceId = "youtube_music"),
            Track("yt-2", "Second", "Artist", sourceId = "youtube_music"),
        )
        val soundCloud = listOf(
            Track("sc-1", "Third", "Artist", sourceId = "soundcloud"),
            Track("sc-2", "First", "Artist", sourceId = "soundcloud"),
        )
        assertEquals(listOf("yt-1", "sc-1", "yt-2"), mergeProviderTracks(listOf(youtube, soundCloud), 4).map { it.id })
    }
}
