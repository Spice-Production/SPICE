package xyz.spiceapp.engine.provider

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.engine.ResolvedStream
import xyz.spiceapp.engine.StreamQuality

class NewPipeYouTubeClientTest {
    @Test
    fun extractsYouTubeIdsFromCommonUrls() {
        assertEquals("abc123", youtubeVideoId("abc123"))
        assertEquals("abc123", youtubeVideoId("https://www.youtube.com/watch?v=abc123&list=playlist"))
        assertEquals("abc123", youtubeVideoId("https://youtu.be/abc123?t=10"))
        assertEquals("abc123", youtubeVideoId("https://www.youtube.com/shorts/abc123"))
        assertEquals("abc123", youtubeVideoId("https://www.youtube.com/embed/abc123"))
        assertNull(youtubeVideoId(""))
    }

    @Test
    fun buildsWatchUrlForIdsAndKeepsExistingUrls() {
        assertEquals("https://www.youtube.com/watch?v=abc123", youtubeWatchUrl("abc123"))
        assertEquals("https://youtu.be/abc123", youtubeWatchUrl("https://youtu.be/abc123"))
    }

    @Test
    fun ordersYouTubeStreamsByFormatAndQuality() {
        val streams = listOf(
            ResolvedStream(
                url = "https://cdn.example.test/opus.webm",
                container = "webm",
                bitrate = 160000,
                contentType = "audio/webm",
            ),
            ResolvedStream(
                url = "https://cdn.example.test/low.m4a",
                container = "m4a",
                bitrate = 96000,
                contentType = "audio/mp4",
            ),
            ResolvedStream(
                url = "https://cdn.example.test/high.m4a",
                container = "m4a",
                bitrate = 256000,
                contentType = "audio/mp4",
            ),
        )

        assertEquals("high.m4a", orderYouTubeStreams(streams, StreamQuality.High).first().url.substringAfterLast("/"))
        assertEquals("low.m4a", orderYouTubeStreams(streams, StreamQuality.DataSaver).first().url.substringAfterLast("/"))
    }

    @Test
    fun marksYouTubeWebHostsForDesktopConsentHeaders() {
        assertTrue(isYouTubeWebHost("youtube.com"))
        assertTrue(isYouTubeWebHost("www.youtube.com"))
        assertTrue(isYouTubeWebHost("music.youtube.com"))
        assertFalse(isYouTubeWebHost("googlevideo.com"))
        assertFalse(isYouTubeWebHost("example.com"))
        assertTrue(YOUTUBE_DESKTOP_USER_AGENT.contains("Windows NT 10.0"))
        assertTrue(YOUTUBE_CONSENT_COOKIE.startsWith("CONSENT=YES+"))
    }
}
