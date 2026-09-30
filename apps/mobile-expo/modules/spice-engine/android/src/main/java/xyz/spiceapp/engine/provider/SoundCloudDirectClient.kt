package xyz.spiceapp.engine.provider

import org.json.JSONObject
import xyz.spiceapp.engine.EngineException
import xyz.spiceapp.engine.ResolvedStream
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Locale

private const val SOUNDCLOUD_API_V2_URL = "https://api-v2.soundcloud.com"
private const val SOUNDCLOUD_TRACK_PREFIX = "soundcloud:"
private const val DEFAULT_TIMEOUT_MS = 8_000
private const val SOUNDCLOUD_WEB_USER_AGENT =
    "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Spice/0.8"

class SoundCloudDirectClient(
    configuredClientId: String = "",
) {
    private val configuredClientId = configuredClientId.trim()
    private var discoveredClientId: String? = null

    fun search(query: String, limit: Int): List<Track> {
        val safeLimit = limit.coerceIn(1, 50)
        val payload = fetchJson(
            "/search/tracks?q=${encodeQuery(query)}&limit=$safeLimit&offset=0",
        )
        return parseSoundCloudTracks(payload, safeLimit)
    }

    fun resolveStreams(trackId: String, quality: StreamQuality): List<ResolvedStream> {
        val rawId = trackId.removePrefix(SOUNDCLOUD_TRACK_PREFIX)
        val track = fetchJson("/tracks/${encodePath(rawId)}")

        if (track.optBoolean("streamable", true) == false) {
            throw EngineException("This SoundCloud track is not streamable.")
        }

        when (track.optString("policy").uppercase(Locale.ROOT)) {
            "BLOCK" -> throw EngineException("This SoundCloud track is blocked in the current region.")
            "SNIP" -> throw EngineException("SoundCloud only exposes a preview for this track.")
        }

        val trackAuthorization = track.optString("track_authorization").trim()
        val streams = parseSoundCloudTranscodingCandidates(track)
            .mapNotNull { candidate ->
                resolveTranscoding(candidate, trackAuthorization)
            }

        if (streams.isEmpty()) {
            throw EngineException("No compatible SoundCloud stream formats were discovered on this phone.")
        }

        return sortSoundCloudStreams(streams, quality)
    }

    private fun resolveTranscoding(
        candidate: SoundCloudTranscodingCandidate,
        trackAuthorization: String,
    ): ResolvedStream? {
        return runCatching {
            val params = mutableMapOf<String, String>()
            if (trackAuthorization.isNotBlank()) {
                params["track_authorization"] = trackAuthorization
            }
            val resolved = fetchJson(appendQuery(candidate.url, params))
            val streamUrl = resolved.optString("url").trim()
            if (streamUrl.isBlank()) {
                null
            } else {
                soundCloudStreamFromTranscoding(candidate, streamUrl)
            }
        }.getOrNull()
    }

    private fun fetchJson(pathOrUrl: String, retry: Boolean = true): JSONObject {
        val clientId = clientId()
        val url = URL(appendQuery(soundCloudUrl(pathOrUrl), mapOf("client_id" to clientId)))
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = DEFAULT_TIMEOUT_MS
            readTimeout = DEFAULT_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "Spice-Native-Android/0.7")
        }

        try {
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()

            if (status !in 200..299) {
                if (retry && configuredClientId.isBlank() && status in setOf(401, 403)) {
                    discoveredClientId = null
                    return fetchJson(pathOrUrl, retry = false)
                }
                throw EngineException("SoundCloud API request failed with HTTP $status.", status)
            }

            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun clientId(): String {
        if (configuredClientId.isNotBlank()) return configuredClientId
        discoveredClientId?.let { return it }
        val clientId = discoverSoundCloudClientId()
        discoveredClientId = clientId
        return clientId
    }

    private fun discoverSoundCloudClientId(): String {
        val homepage = fetchText("https://soundcloud.com")
        extractSoundCloudClientId(homepage)?.let { return it }

        val assets = SOUND_CLOUD_ASSET_REGEX.findAll(homepage)
            .map { it.value }
            .distinct()
            .toList()
            .asReversed()

        for (assetUrl in assets) {
            val asset = runCatching {
                fetchText(soundCloudAssetUrl(assetUrl), range = "bytes=0-500000")
            }.getOrNull() ?: continue
            extractSoundCloudClientId(asset)?.let { return it }
        }

        throw EngineException("Could not discover the SoundCloud web client id on this phone.")
    }

    private fun fetchText(url: String, range: String? = null): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = DEFAULT_TIMEOUT_MS
            readTimeout = DEFAULT_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", SOUNDCLOUD_WEB_USER_AGENT)
            if (!range.isNullOrBlank()) {
                setRequestProperty("Range", range)
            }
        }

        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw EngineException("SoundCloud web request failed with HTTP $status.", status)
            }
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}

internal data class SoundCloudTranscodingCandidate(
    val url: String,
    val preset: String,
    val protocol: String,
    val mimeType: String,
)

internal fun parseSoundCloudTracks(payload: JSONObject, limit: Int): List<Track> {
    val collection = payload.optJSONArray("collection") ?: return emptyList()

    return buildList {
        for (index in 0 until collection.length()) {
            val item = collection.optJSONObject(index) ?: continue
            if (!isPlayableSoundCloudTrack(item)) continue
            parseSoundCloudTrack(item)?.let(::add)
            if (size >= limit) break
        }
    }
}

internal fun parseSoundCloudTranscodingCandidates(track: JSONObject): List<SoundCloudTranscodingCandidate> {
    val transcodings = track
        .optJSONObject("media")
        ?.optJSONArray("transcodings")
        ?: return emptyList()

    return buildList {
        for (index in 0 until transcodings.length()) {
            val transcoding = transcodings.optJSONObject(index) ?: continue
            val format = transcoding.optJSONObject("format") ?: JSONObject()
            val protocol = format.optString("protocol").trim()
            val url = transcoding.optString("url").trim()
            if (url.isBlank() || protocol.contains("encrypted", ignoreCase = true)) continue
            add(
                SoundCloudTranscodingCandidate(
                    url = url,
                    preset = transcoding.optString("preset").ifBlank { "unknown" },
                    protocol = protocol,
                    mimeType = format.optString("mime_type").trim(),
                ),
            )
        }
    }
}

internal fun soundCloudStreamFromTranscoding(
    candidate: SoundCloudTranscodingCandidate,
    resolvedUrl: String,
): ResolvedStream =
    ResolvedStream(
        url = resolvedUrl,
        container = containerForSoundCloudMimeType(candidate.mimeType),
        bitrate = bitrateForSoundCloudPreset(candidate.preset),
        protocol = candidate.protocol,
        contentType = candidate.mimeType,
    )

internal fun sortSoundCloudStreams(streams: List<ResolvedStream>, quality: StreamQuality): List<ResolvedStream> {
    val progressiveFirst = compareByDescending<ResolvedStream> { stream ->
        if (stream.protocol.equals("progressive", ignoreCase = true)) 1 else 0
    }
    return when (quality) {
        StreamQuality.DataSaver -> streams.sortedWith(progressiveFirst.thenBy { it.bitrate.takeIf { bitrate -> bitrate > 0 } ?: Long.MAX_VALUE })
        StreamQuality.Standard -> streams.sortedWith(
            progressiveFirst.thenBy { stream -> stream.bitrate.takeIf { it > 0 }?.let { kotlin.math.abs(it - 128_000) } ?: Long.MAX_VALUE },
        )
        StreamQuality.High -> streams.sortedWith(progressiveFirst.thenByDescending { it.bitrate })
    }
}

internal fun appendQuery(url: String, params: Map<String, String>): String {
    if (params.isEmpty()) return url
    val query = params
        .filterValues { it.isNotBlank() }
        .map { (key, value) -> "${encodeQuery(key)}=${encodeQuery(value)}" }
        .joinToString("&")
    if (query.isBlank()) return url
    val separator = if (url.contains("?")) "&" else "?"
    return "$url$separator$query"
}

private fun parseSoundCloudTrack(track: JSONObject): Track? {
    val id = track.optString("id").trim()
    val title = track.optString("title").trim()
    if (id.isBlank() || title.isBlank()) return null

    val user = track.optJSONObject("user") ?: JSONObject()
    val artwork = bestSoundCloudArtwork(
        track.optString("artwork_url").ifBlank { user.optString("avatar_url") },
    )

    return Track(
        id = "$SOUNDCLOUD_TRACK_PREFIX$id",
        title = title,
        artist = user.optString("username").trim().ifBlank { "SoundCloud Artist" },
        durationMs = track.optLong("duration", 0).coerceAtLeast(0),
        artworkUrl = artwork,
        sourceId = "soundcloud",
    )
}

private fun isPlayableSoundCloudTrack(track: JSONObject): Boolean {
    if (track.optBoolean("streamable", true) == false) return false
    return track.optString("policy").uppercase(Locale.ROOT) !in setOf("BLOCK", "SNIP")
}

private fun soundCloudUrl(pathOrUrl: String): String =
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
        pathOrUrl
    } else {
        SOUNDCLOUD_API_V2_URL + if (pathOrUrl.startsWith("/")) pathOrUrl else "/$pathOrUrl"
    }

private fun soundCloudAssetUrl(url: String): String {
    val normalized = url.replace("\\/", "/").replace("\\u002F", "/")
    return when {
        normalized.startsWith("//") -> "https:$normalized"
        normalized.startsWith("/") -> "https://soundcloud.com$normalized"
        else -> normalized
    }
}

private fun bestSoundCloudArtwork(url: String): String =
    url.takeUnless { it.isBlank() || it == "null" }
        ?.replace("-large.", "-t500x500.")
        .orEmpty()

private fun bitrateForSoundCloudPreset(preset: String): Long {
    val bitrate = Regex("""(\d+)k""").find(preset)?.groupValues?.getOrNull(1)?.toLongOrNull()
    if (bitrate != null) return bitrate * 1000
    if (preset.contains("opus", ignoreCase = true)) return 64_000
    if (preset.contains("mp3", ignoreCase = true)) return 128_000
    return 0
}

private fun containerForSoundCloudMimeType(mimeType: String): String {
    val normalized = mimeType.lowercase(Locale.ROOT)
    return when {
        "mp4" in normalized -> "m4a"
        "mpeg" in normalized -> "mp3"
        "ogg" in normalized -> "ogg"
        else -> "unknown"
    }
}

private fun encodePath(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

private fun encodeQuery(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name())

internal fun extractSoundCloudClientId(source: String): String? =
    SOUND_CLOUD_CLIENT_ID_REGEXES.firstNotNullOfOrNull { regex ->
        regex.find(source)?.groupValues?.getOrNull(1)?.takeIf { it.isNotBlank() }
    }

private val SOUND_CLOUD_ASSET_REGEX = Regex("""(?:https?:)?(?://|\\u002F\\u002F)?[^"'<> ]*sndcdn\.com/[^"'<> ]+\.js|/[^\s"'<>]+\.js""")
private val SOUND_CLOUD_CLIENT_ID_REGEXES = listOf(
    Regex(""""clientId"\s*:\s*"([^"]+)""""),
    Regex(""""client_id"\s*:\s*"([^"]+)""""),
    Regex("""(?:client_id|clientId)["']?\s*[:=]\s*["']([^"']+)["']"""),
)
