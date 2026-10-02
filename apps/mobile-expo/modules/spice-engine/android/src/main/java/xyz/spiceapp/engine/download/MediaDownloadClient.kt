package xyz.spiceapp.engine.download

import android.content.Context
import com.yausername.aria2c.Aria2c
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal const val DOWNLOAD_AUDIO_FORMAT = "mp3"
internal const val DOWNLOAD_SOCKET_TIMEOUT_SECONDS = 20
internal const val DOWNLOAD_MAX_RUNTIME_MINUTES = 15L
internal const val DIRECT_AUDIO_SOURCE_ERROR =
    "SPICE could not resolve a direct audio stream for this track. Try again or choose another source."
internal const val DOWNLOAD_TIMEOUT_ERROR =
    "The audio download did not finish within 15 minutes. Check your connection and try again."

data class DownloadProgress(
    val progress: Float,
    val etaSeconds: Long,
    val line: String,
)

data class DownloadResult(
    val filePath: String,
    val fileName: String,
    val bytes: Long,
    val exitCode: Int,
    val errorOutput: String,
)

/**
 * Converts a resolved direct stream (progressive or segmented) into a tagged
 * MP3 with yt-dlp and FFmpeg, saved in the app's own downloads folder.
 */
class MediaDownloadClient(private val context: Context) {
    fun downloadAudio(
        fileLabel: String,
        sourceUrl: String,
        processId: String,
        outputDirectory: File,
        progress: (DownloadProgress) -> Unit = {},
    ): DownloadResult {
        progress(DownloadProgress(-1f, -1, "Preparing MP3 download..."))
        ensureInitialized(context)
        outputDirectory.mkdirs()
        val directSourceUrl = requireDirectAudioSource(sourceUrl)

        val startedAt = System.currentTimeMillis()
        val fileStem = uniqueDownloadFileStem(outputDirectory, safeFileStem(fileLabel))
        val request = YoutubeDLRequest(directSourceUrl)
            .addOption("--no-playlist")
            .addOption("--extract-audio")
            .addOption("--audio-format", DOWNLOAD_AUDIO_FORMAT)
            .addOption("--audio-quality", "0")
            .addOption("--no-mtime")
            .addOption("--embed-metadata")
            .addOption("--newline")
            .addOption("--socket-timeout", DOWNLOAD_SOCKET_TIMEOUT_SECONDS.toString())
            .addOption("--retries", "3")
            .addOption("--fragment-retries", "3")
            .addOption("--file-access-retries", "3")
            .addOption("--concurrent-fragments", "3")
            .addOption("-o", File(outputDirectory, "$fileStem.%(ext)s").absolutePath)

        val processActive = AtomicBoolean(true)
        val timedOut = AtomicBoolean(false)
        val timeoutTask = downloadTimeoutExecutor.schedule({
            if (!processActive.compareAndSet(true, false)) return@schedule
            timedOut.set(true)
            runCatching { YoutubeDL.getInstance().destroyProcessById(processId) }
        }, DOWNLOAD_MAX_RUNTIME_MINUTES, TimeUnit.MINUTES)
        val response = try {
            YoutubeDL.getInstance().execute(request, processId) { progressValue, eta, line ->
                progress(DownloadProgress(progressValue, eta, line))
            }
        } catch (error: Exception) {
            cleanupFailedDownloadFiles(outputDirectory, fileStem, startedAt)
            if (timedOut.get()) throw IllegalStateException(DOWNLOAD_TIMEOUT_ERROR, error)
            throw error
        } finally {
            processActive.set(false)
            timeoutTask.cancel(false)
        }
        if (timedOut.get()) {
            cleanupFailedDownloadFiles(outputDirectory, fileStem, startedAt)
            throw IllegalStateException(DOWNLOAD_TIMEOUT_ERROR)
        }
        val outputFile = completedDownloadFile(outputDirectory, fileStem, startedAt)
            ?.takeIf { response.exitCode == 0 }
        if (outputFile == null) cleanupFailedDownloadFiles(outputDirectory, fileStem, startedAt)

        return DownloadResult(
            filePath = outputFile?.absolutePath.orEmpty(),
            fileName = outputFile?.name.orEmpty(),
            bytes = outputFile?.length()?.coerceAtLeast(0) ?: 0,
            exitCode = response.exitCode,
            errorOutput = response.err,
        )
    }

    fun cancel(processId: String): Boolean =
        runCatching { YoutubeDL.getInstance().destroyProcessById(processId) }.getOrDefault(false)

    private companion object {
        val initializationLock = Any()

        @Volatile
        var initialized = false
        val downloadTimeoutExecutor = Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "spice-download-timeout").apply { isDaemon = true }
        }

        fun ensureInitialized(context: Context) {
            if (initialized) return
            synchronized(initializationLock) {
                if (initialized) return
                val applicationContext = context.applicationContext
                YoutubeDL.getInstance().init(applicationContext)
                FFmpeg.getInstance().init(applicationContext)
                Aria2c.getInstance().init(applicationContext)
                initialized = true
            }
        }
    }
}

internal fun completedDownloadFile(outputDirectory: File, fileStem: String, startedAt: Long): File? =
    outputDirectory
        .listFiles()
        .orEmpty()
        .filter { file ->
            file.isFile &&
                file.length() > 0 &&
                (file.nameWithoutExtension == fileStem || file.nameWithoutExtension.startsWith("$fileStem.")) &&
                file.lastModified() >= startedAt - 5_000
        }
        .maxByOrNull { it.lastModified() }

internal fun safeFileStem(value: String): String =
    value
        .replace(Regex("""[\\/:*?"<>|]+"""), " ")
        .replace(Regex("""\s+"""), " ")
        .trim()
        .take(120)
        .ifBlank { "spice-track" }

internal fun uniqueDownloadFileStem(directory: File, fileStem: String): String {
    var candidate = fileStem
    var index = 2
    while (directory.listFiles().orEmpty().any { file ->
            file.nameWithoutExtension == candidate || file.nameWithoutExtension.startsWith("$candidate.")
        }
    ) {
        candidate = "$fileStem ($index)"
        index += 1
    }
    return candidate
}

internal fun requireDirectAudioSource(url: String): String {
    val parsed = runCatching { URL(url) }.getOrNull()
        ?: throw IllegalArgumentException(DIRECT_AUDIO_SOURCE_ERROR)
    if (parsed.protocol.lowercase() !in setOf("http", "https") || isYouTubePageUrl(parsed)) {
        throw IllegalArgumentException(DIRECT_AUDIO_SOURCE_ERROR)
    }
    return parsed.toString()
}

internal fun isYouTubePageUrl(url: URL): Boolean {
    val host = url.host.lowercase()
    return host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
}

private fun cleanupFailedDownloadFiles(outputDirectory: File, fileStem: String, startedAt: Long) {
    outputDirectory
        .listFiles()
        .orEmpty()
        .filter { file ->
            file.isFile &&
                (file.nameWithoutExtension == fileStem || file.nameWithoutExtension.startsWith("$fileStem.")) &&
                file.lastModified() >= startedAt - 5_000
        }
        .forEach { file -> runCatching { file.delete() } }
}
