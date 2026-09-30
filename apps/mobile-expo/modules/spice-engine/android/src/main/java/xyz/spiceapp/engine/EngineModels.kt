package xyz.spiceapp.engine

/**
 * Native-side track model. It mirrors the TypeScript `Track` the JS app owns;
 * the engine only needs it to resolve streams, publish media metadata, and
 * continue the queue while the React Native UI is gone.
 */
data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val durationMs: Long = 0,
    val artworkUrl: String = "",
    val sourceId: String = "youtube_music",
    val localUri: String = "",
)

data class ResolvedStream(
    val url: String,
    val container: String = "",
    val bitrate: Long = 0,
    val protocol: String = "",
    val contentType: String = "",
    val expiresAt: String = "",
)

enum class StreamQuality {
    High,
    Standard,
    DataSaver,
}

enum class RepeatMode {
    Off,
    All,
    One,
}

enum class SearchProvider {
    All,
    YouTube,
    SoundCloud,
}

class EngineException(
    override val message: String,
    val statusCode: Int? = null,
    cause: Throwable? = null,
) : Exception(message, cause)

internal fun Track.serviceQueueKey(): String = "$sourceId:$id"

internal fun Track.toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "title" to title,
    "artist" to artist,
    "album" to album,
    "durationMs" to durationMs.toDouble(),
    "artworkUrl" to artworkUrl,
    "sourceId" to sourceId,
    "localUri" to localUri,
)

internal fun ResolvedStream.toMap(): Map<String, Any?> = mapOf(
    "url" to url,
    "container" to container,
    "bitrate" to bitrate.toDouble(),
    "protocol" to protocol,
    "contentType" to contentType,
    "expiresAt" to expiresAt,
)

internal fun trackFromMap(map: Map<String, Any?>): Track {
    fun string(key: String, fallback: String = ""): String =
        (map[key] as? String)?.takeIf { it.isNotEmpty() } ?: fallback
    val duration = when (val raw = map["durationMs"]) {
        is Number -> raw.toLong()
        is String -> raw.toLongOrNull() ?: 0L
        else -> 0L
    }
    return Track(
        id = string("id"),
        title = string("title", "Track"),
        artist = string("artist", "Unknown artist"),
        album = string("album"),
        durationMs = duration.coerceAtLeast(0L),
        artworkUrl = string("artworkUrl"),
        sourceId = string("sourceId", "youtube_music"),
        localUri = string("localUri"),
    )
}

internal fun enumOrDefault(value: String?, fallback: StreamQuality): StreamQuality =
    StreamQuality.entries.firstOrNull { it.name == value } ?: fallback

internal fun enumOrDefault(value: String?, fallback: RepeatMode): RepeatMode =
    RepeatMode.entries.firstOrNull { it.name == value } ?: fallback

internal fun enumOrDefault(value: String?, fallback: SearchProvider): SearchProvider =
    SearchProvider.entries.firstOrNull { it.name == value } ?: fallback
