package xyz.spiceapp.engine.provider

import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import xyz.spiceapp.engine.EngineException
import xyz.spiceapp.engine.ResolvedStream
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class NewPipeYouTubeClient(
    private val downloader: NewPipeDownloader = NewPipeDownloader(),
) {
    fun search(query: String, limit: Int): List<Track> {
        ensureInitialized(downloader)
        val extractor = ServiceList.YouTube.getSearchExtractor(query)
        extractor.fetchPage()
        return extractor.initialPage.items
            .asSequence()
            .filterIsInstance<StreamInfoItem>()
            .mapNotNull(::streamInfoItemToTrack)
            .take(limit.coerceIn(1, 30))
            .toList()
    }

    fun resolveStreams(trackId: String, quality: StreamQuality): List<ResolvedStream> {
        ensureInitialized(downloader)
        val info = StreamInfo.getInfo(ServiceList.YouTube, youtubeWatchUrl(trackId))
        val streams = info.audioStreams.mapNotNull(::audioStreamToResolvedStream)
        if (streams.isEmpty()) {
            throw EngineException("NewPipe found this YouTube item, but no audio-only streams were exposed.")
        }
        return orderYouTubeStreams(streams, quality)
    }

    private fun streamInfoItemToTrack(item: StreamInfoItem): Track? {
        val id = youtubeVideoId(item.url) ?: return null
        val title = item.name.trim()
        if (title.isBlank()) return null

        return Track(
            id = id,
            title = title,
            artist = item.uploaderName?.trim()?.ifBlank { "YouTube" } ?: "YouTube",
            durationMs = item.duration.takeIf { it > 0 }?.times(1000) ?: 0,
            artworkUrl = item.thumbnails.maxByOrNull { it.width.coerceAtLeast(0) }?.url.orEmpty(),
            sourceId = "youtube_music",
        )
    }

    private fun audioStreamToResolvedStream(stream: AudioStream): ResolvedStream? {
        val url = stream.content.trim()
        if (url.isBlank()) return null
        val format = stream.format
        return ResolvedStream(
            url = url,
            container = format?.suffix ?: format?.name ?: "",
            bitrate = stream.averageBitrate.takeIf { it > 0 }?.toLong()
                ?: stream.bitrate.takeIf { it > 0 }?.toLong()
                ?: 0,
            protocol = stream.deliveryMethod.name.lowercase(Locale.ROOT),
            contentType = format?.mimeType.orEmpty(),
        )
    }

    companion object {
        private val initialized = AtomicBoolean(false)

        private fun ensureInitialized(downloader: NewPipeDownloader) {
            if (initialized.compareAndSet(false, true)) {
                NewPipe.init(
                    downloader,
                    Localization("en", "US"),
                    ContentCountry("US"),
                )
            }
        }
    }
}

internal fun youtubeWatchUrl(idOrUrl: String): String {
    if (idOrUrl.startsWith("http://") || idOrUrl.startsWith("https://")) return idOrUrl
    return "https://www.youtube.com/watch?v=$idOrUrl"
}

internal fun youtubeVideoId(urlOrId: String): String? {
    val trimmed = urlOrId.trim()
    if (trimmed.isBlank()) return null
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return trimmed

    val patterns = listOf(
        Regex("""[?&]v=([^&#]+)"""),
        Regex("""youtu\.be/([^?&#/]+)"""),
        Regex("""/shorts/([^?&#/]+)"""),
        Regex("""/embed/([^?&#/]+)"""),
    )
    return patterns.firstNotNullOfOrNull { pattern ->
        pattern.find(trimmed)?.groupValues?.getOrNull(1)
    }
}

internal fun orderYouTubeStreams(streams: List<ResolvedStream>, quality: StreamQuality): List<ResolvedStream> {
    val byFormat = compareByDescending<ResolvedStream> { stream ->
        val descriptor = "${stream.container} ${stream.contentType}".lowercase(Locale.ROOT)
        when {
            "m4a" in descriptor || "mp4" in descriptor || "aac" in descriptor -> 3
            "webm" in descriptor || "opus" in descriptor -> 2
            else -> 1
        }
    }

    return when (quality) {
        StreamQuality.DataSaver -> streams.sortedWith(byFormat.thenBy { it.bitrate.takeIf { bitrate -> bitrate > 0 } ?: Long.MAX_VALUE })
        StreamQuality.Standard -> streams.sortedWith(
            byFormat.thenBy { stream -> stream.bitrate.takeIf { it > 0 }?.let { kotlin.math.abs(it - 160_000) } ?: Long.MAX_VALUE },
        )
        StreamQuality.High -> streams.sortedWith(byFormat.thenByDescending { it.bitrate })
    }
}
