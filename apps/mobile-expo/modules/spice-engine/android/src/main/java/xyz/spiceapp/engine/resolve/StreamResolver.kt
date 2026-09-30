package xyz.spiceapp.engine.resolve

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.json.JSONObject
import xyz.spiceapp.engine.EngineException
import xyz.spiceapp.engine.ResolvedStream
import xyz.spiceapp.engine.SearchProvider
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import xyz.spiceapp.engine.provider.NewPipeYouTubeClient
import xyz.spiceapp.engine.provider.SoundCloudDirectClient
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale

data class ResolvedPlayback(
    val track: Track,
    val stream: ResolvedStream,
    val usedFallback: Boolean,
)

/**
 * Phone-side search and stream resolution, ported from the Kotlin client's
 * SpiceApi media lane: SoundCloud direct, NewPipe YouTube, and the optional
 * SPICE local runtime fallback. One shared instance keeps the discovered
 * SoundCloud client id warm for both the JS app and the playback service.
 */
class StreamResolver(
    mediaBaseUrls: List<String> = listOf("http://127.0.0.1:3939"),
    private val streamProbe: StreamProbe = HttpStreamProbe(),
    private val soundCloudDirectClient: SoundCloudDirectClient = SoundCloudDirectClient(),
    private val newPipeYouTubeClient: NewPipeYouTubeClient = NewPipeYouTubeClient(),
) {
    private val mediaBaseUrls = mediaBaseUrls
        .map(::normalizeBaseUrl)
        .filter { it.isNotBlank() }
        .distinct()

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

        throw EngineException(
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
            throw EngineException("No Android-compatible stream is available for this track.")
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

        throw EngineException(
            "Spice resolved ${candidates.size} stream(s), but Android could not open them. " +
                failures.firstOrNull().orEmpty(),
        )
    }

    private fun localRuntimeStreamCandidates(endpoint: String, quality: StreamQuality): List<ResolvedStream> {
        val payload = getMediaJson(endpoint)
        return orderStreamCandidates(parseStreamCandidates(payload), quality)
    }

    private fun searchSoundCloudCandidates(query: String, limit: Int): List<Track> {
        val encoded = URLEncoder.encode(query.trim(), StandardCharsets.UTF_8.name())
        val results = listOf(
            runCatching { soundCloudDirectClient.search(query, limit) },
            runCatching {
                parseTracks(getMediaJson(localMediaPath("/sc/search?q=" + encoded + "&limit=" + limit)), "soundcloud")
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
                parseTracks(getMediaJson(localMediaPath("/yt/search?q=" + encodedQuery + "&limit=" + limit)), "youtube_music")
            },
        )
        val successful = results.mapNotNull { it.getOrNull() }

        if (successful.isEmpty()) {
            throw results.firstNotNullOf { it.exceptionOrNull() }
        }

        return mergeProviderTracks(successful, limit)
    }

    private fun getMediaJson(path: String): JSONObject {
        if (mediaBaseUrls.isEmpty()) throw EngineException(MEDIA_RUNTIME_MESSAGE)
        var lastFailure: Exception? = null
        for (baseUrl in mediaBaseUrls) {
            try {
                return requestMediaJson(baseUrl, path)
            } catch (error: Exception) {
                lastFailure = error
                val status = (error as? EngineException)?.statusCode
                if (status != null && status !in setOf(404, 410, 429, 500, 502, 503, 504)) break
            }
        }
        throw EngineException(MEDIA_RUNTIME_MESSAGE, cause = lastFailure)
    }

    private fun requestMediaJson(baseUrl: String, path: String): JSONObject {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 15_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("x-spice-api-namespace", "local")
        }
        try {
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                val message = json.optString("message")
                    .ifEmpty { json.optString("error") }
                    .ifEmpty { "SPICE local runtime request failed with HTTP $status." }
                throw EngineException(message, status)
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val USER_AGENT = "Spice-Native-Android/1.0"
        const val MEDIA_RUNTIME_MESSAGE =
            "This provider needs the local SPICE runtime fallback. Standalone SoundCloud and NewPipe YouTube playback can run on the phone; for local fallback, start the runtime and run adb reverse tcp:3939 tcp:3939."

        /** Shared by the JS bridge and the playback service. */
        val shared: StreamResolver by lazy { StreamResolver() }
    }
}

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
        if (url.startsWith("android.resource://") || url.startsWith("file://") || url.startsWith("content://")) {
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
        connection.setRequestProperty("User-Agent", StreamResolver.USER_AGENT)

        return try {
            val status = connection.responseCode
            val contentType = connection.contentType.orEmpty()
            if (status in 200..299) {
                connection.inputStream?.close()
                StreamProbeResult(playable = true, statusCode = status, contentType = contentType)
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

private fun encodePath(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
