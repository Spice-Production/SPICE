package xyz.spiceapp.engine.provider

import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

internal const val YOUTUBE_DESKTOP_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
internal const val YOUTUBE_CONSENT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.en+FX+667"

class NewPipeDownloader(
    private val userAgent: String = YOUTUBE_DESKTOP_USER_AGENT,
) : Downloader() {
    override fun execute(request: Request): Response {
        val url = URL(request.url())
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = request.httpMethod()
            connectTimeout = 10_000
            readTimeout = 20_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", userAgent)
            setRequestProperty("Accept-Language", "en-US,en;q=0.9")
            if (isYouTubeWebHost(url.host)) {
                setRequestProperty("Cookie", YOUTUBE_CONSENT_COOKIE)
            }
            request.headers().forEach { (name, values) ->
                values.forEach { value -> addRequestProperty(name, value) }
            }
            val body = request.dataToSend()
            if (body != null && body.isNotEmpty()) {
                doOutput = true
                outputStream.use { it.write(body) }
            }
        }

        try {
            val code = connection.responseCode
            val responseBody = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            return Response(
                code,
                connection.responseMessage ?: "",
                connection.headerFields.filterKeys { it != null },
                responseBody,
                connection.url.toString(),
            )
        } catch (error: IOException) {
            throw error
        } finally {
            connection.disconnect()
        }
    }
}

internal fun isYouTubeWebHost(host: String): Boolean =
    host.equals("youtube.com", ignoreCase = true) ||
        host.endsWith(".youtube.com", ignoreCase = true)
