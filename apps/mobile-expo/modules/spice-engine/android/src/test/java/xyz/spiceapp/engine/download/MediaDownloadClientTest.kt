package xyz.spiceapp.engine.download

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.net.URL
import java.nio.file.Files

class MediaDownloadClientTest {
    @Test
    fun convertsDownloadsToMp3() {
        assertEquals("mp3", DOWNLOAD_AUDIO_FORMAT)
        assertEquals(20, DOWNLOAD_SOCKET_TIMEOUT_SECONDS)
        assertEquals(15L, DOWNLOAD_MAX_RUNTIME_MINUTES)
    }

    @Test
    fun acceptsDirectAudioUrlsButRejectsYouTubePagesBeforeYtDlpRuns() {
        val direct = "https://rr1---sn.example.googlevideo.com/videoplayback?id=abc"

        assertEquals(direct, requireDirectAudioSource(direct))
        assertThrows(IllegalArgumentException::class.java) {
            requireDirectAudioSource("https://www.youtube.com/watch?v=abc")
        }
        assertThrows(IllegalArgumentException::class.java) {
            requireDirectAudioSource("https://youtu.be/abc")
        }
        assertThrows(IllegalArgumentException::class.java) {
            requireDirectAudioSource("file:///storage/emulated/0/not-remote.mp3")
        }
        assertEquals(false, isYouTubePageUrl(URL(direct)))
        assertEquals(DIRECT_AUDIO_SOURCE_ERROR, runCatching {
            requireDirectAudioSource("https://music.youtube.com/watch?v=abc")
        }.exceptionOrNull()?.message)
    }

    @Test
    fun sanitizesDownloadFileStem() {
        assertEquals(
            "Artist Song Name",
            safeFileStem("""Artist / Song: "Name"?"""),
        )
        assertEquals("spice-track", safeFileStem("   "))
        assertEquals(120, safeFileStem("a".repeat(160)).length)
    }

    @Test
    fun detectsCompletedDownloadFileByStemAndTimestamp() {
        val directory = Files.createTempDirectory("spice-download-test").toFile()
        try {
            val old = File(directory, "Artist Song.mp3")
            old.writeText("old")
            old.setLastModified(100)
            val fresh = File(directory, "Artist Song.webm")
            fresh.writeText("fresh")
            fresh.setLastModified(5_000)

            assertEquals(
                fresh.absolutePath,
                completedDownloadFile(directory, "Artist Song", startedAt = 4_500)?.absolutePath,
            )
            assertNull(completedDownloadFile(directory, "Other Song", startedAt = 4_500))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun createsCollisionSafeDownloadFileStems() {
        val directory = Files.createTempDirectory("spice-download-name-test").toFile()
        try {
            assertEquals("Artist Song", uniqueDownloadFileStem(directory, "Artist Song"))
            File(directory, "Artist Song.mp3").writeText("first")
            assertEquals("Artist Song (2)", uniqueDownloadFileStem(directory, "Artist Song"))
            File(directory, "Artist Song (2).webm").writeText("second")
            assertEquals("Artist Song (3)", uniqueDownloadFileStem(directory, "Artist Song"))
        } finally {
            directory.deleteRecursively()
        }
    }

    @Test
    fun ignoresEmptyCompletedDownloadFiles() {
        val directory = Files.createTempDirectory("spice-download-empty-test").toFile()
        try {
            File(directory, "Artist Song.mp3").createNewFile()
            assertNull(completedDownloadFile(directory, "Artist Song", startedAt = 0))
        } finally {
            directory.deleteRecursively()
        }
    }
}
