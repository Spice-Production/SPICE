package xyz.spiceapp.mobile

import xyz.spiceapp.mobile.model.FeedSection
import xyz.spiceapp.mobile.model.Track

internal data class MobileRecommendationSeed(
    val track: Track,
    val query: String,
    val label: String,
)

internal data class MobileRecommendationBatch(
    val seed: MobileRecommendationSeed,
    val tracks: List<Track>,
)

internal fun buildMobileRecommendationSeeds(
    history: List<Track>,
    liked: List<Track>,
    limit: Int = 3,
): List<MobileRecommendationSeed> {
    val seenArtists = mutableSetOf<String>()
    return (history.take(12) + liked.take(12))
        .asSequence()
        .filter { it.title.isNotBlank() }
        .filter { track ->
            val artistKey = track.artist.tasteKey()
            artistKey.isNotBlank() && artistKey != "unknown artist" && seenArtists.add(artistKey)
        }
        .map { track ->
            MobileRecommendationSeed(
                track = track,
                query = listOf(track.artist, track.album.ifBlank { track.title }, "music")
                    .filter(String::isNotBlank)
                    .joinToString(" "),
                label = if (history.any { it.sameTrack(track) }) {
                    "Because you played ${track.title}"
                } else {
                    "Inspired by your likes"
                },
            )
        }
        .take(limit.coerceAtLeast(0))
        .toList()
}

internal fun rankMobileRecommendations(
    batches: List<MobileRecommendationBatch>,
    history: List<Track>,
    liked: List<Track>,
    limit: Int = 18,
    trackPriorityFor: ((String) -> Int)? = null,
): List<Track> {
    val excludedTracks = history.mapTo(mutableSetOf()) { it.recommendationKey() }
    val likedArtists = liked.mapTo(mutableSetOf()) { it.artist.tasteKey() }
    val historyArtistWeights = history
        .map { it.artist.tasteKey() }
        .filter(String::isNotBlank)
        .groupingBy { it }
        .eachCount()
    val scored = linkedMapOf<String, Pair<Track, Int>>()
    var ordinal = 0

    batches.forEachIndexed { batchIndex, batch ->
        batch.tracks.forEach { track ->
            val key = track.recommendationKey()
            if (key in excludedTracks || track.title.isBlank()) return@forEach
            val artistKey = track.artist.tasteKey()
            val titleArtistKey = "${track.title.tasteKey()}|$artistKey"
            if (scored.containsKey(titleArtistKey)) return@forEach
            val score = 1_000 - ordinal - (batchIndex * 8) +
                (historyArtistWeights[artistKey] ?: 0) * 18 +
                (if (artistKey in likedArtists) 42 else 0) +
                (if (track.sourceId == batch.seed.track.sourceId) 4 else 0) +
                (trackPriorityFor?.invoke(key) ?: 0) * 4
            ordinal += 1
            scored[titleArtistKey] = track to score
        }
    }

    val artistCounts = mutableMapOf<String, Int>()
    val sourceCounts = mutableMapOf<String, Int>()
    return scored.values
        .sortedByDescending { it.second }
        .map { it.first }
        .filter { track ->
            val artistKey = track.artist.tasteKey()
            val artistCount = artistCounts[artistKey] ?: 0
            val sourceCount = sourceCounts[track.sourceId] ?: 0
            val keep = artistCount < 2 || sourceCount == 0
            if (keep) {
                artistCounts[artistKey] = artistCount + 1
                sourceCounts[track.sourceId] = sourceCount + 1
            }
            keep
        }
        .take(limit.coerceAtLeast(0))
        .toList()
}

internal fun mobileRecommendationSections(
    batches: List<MobileRecommendationBatch>,
    history: List<Track>,
    liked: List<Track>,
    trackPriorityFor: ((String) -> Int)? = null,
): List<FeedSection> {
    if (batches.isEmpty()) return emptyList()
    val recommended = rankMobileRecommendations(batches, history, liked, trackPriorityFor = trackPriorityFor)
    val excluded = history.mapTo(mutableSetOf()) { it.recommendationKey() }
    return buildList {
        if (recommended.isNotEmpty()) add(FeedSection("Recommended Next", recommended))
        batches.take(2).forEach { batch ->
            val tracks = batch.tracks
                .filterNot { it.recommendationKey() in excluded }
                .distinctBy { it.recommendationKey() }
                .take(10)
            if (tracks.isNotEmpty()) add(FeedSection(batch.seed.label, tracks))
        }
    }
}

// ---------------------------------------------------------------------------
// Mobile taste affinity — mirrors the web app's shared affinity core so both
// platforms rank with the same signals: artist familiarity, likes, and the
// adaptive skip/completion learning.
// ---------------------------------------------------------------------------

internal const val MOBILE_AFFINITY_RECENT_DAMP = 0.25
internal const val MOBILE_AFFINITY_SEARCH_POSITION_DECAY = 0.06
internal const val MOBILE_AFFINITY_SEARCH_BOOST = 0.35

internal data class MobileTasteContext(
    val historyArtistWeights: Map<String, Int>,
    val likedArtistKeys: Set<String>,
    val likedTrackKeys: Set<String>,
    val recentTrackKeys: Set<String>,
    val trackPriorityFor: (String) -> Int,
)

internal fun mobileTasteContext(
    history: List<Track>,
    liked: List<Track>,
    trackPriorityFor: (String) -> Int,
): MobileTasteContext = MobileTasteContext(
    historyArtistWeights = history
        .map { it.artist.tasteKey() }
        .filter(String::isNotBlank)
        .groupingBy { it }
        .eachCount(),
    likedArtistKeys = liked.mapTo(mutableSetOf()) { it.artist.tasteKey() },
    likedTrackKeys = liked.mapTo(mutableSetOf()) { it.recommendationKey() },
    recentTrackKeys = history.take(6).mapTo(mutableSetOf()) { it.recommendationKey() },
    trackPriorityFor = trackPriorityFor,
)

internal fun mobileTasteAffinity(
    track: Track,
    context: MobileTasteContext,
): Double {
    val artistKey = track.artist.tasteKey()
    val key = track.recommendationKey()
    var personalization = ((context.historyArtistWeights[artistKey] ?: 0).coerceAtMost(8) / 8.0) * 0.6
    if (artistKey in context.likedArtistKeys) personalization += 0.25
    personalization = personalization.coerceIn(0.0, 1.0)

    val adaptive = (context.trackPriorityFor(key).coerceIn(-12, 12) / 12.0)
        .coerceIn(-1.0, 1.0)
    // A track this profile keeps skipping is direct evidence against it: the
    // negative adaptive score scales down artist-level generalization for that
    // specific track instead of merely subtracting a little.
    val shapedPersonalization = if (adaptive < 0.0) personalization * (1.0 + adaptive) else personalization
    val liked = if (key in context.likedTrackKeys) 0.35 else 0.0
    val recentDamp = if (key in context.recentTrackKeys) -MOBILE_AFFINITY_RECENT_DAMP else 0.0
    return (shapedPersonalization + liked + adaptive * 0.3 + recentDamp).coerceIn(-1.0, 1.0)
}

/**
 * Subtle search re-ranking: provider order stays the relevance signal, but
 * tracks with real affinity may rise a few positions. No-ops when there is no
 * taste evidence yet.
 */
internal fun reorderMobileTracksByTaste(
    tracks: List<Track>,
    context: MobileTasteContext,
): List<Track> {
    if (tracks.size < 2) return tracks
    if (context.historyArtistWeights.isEmpty() && context.likedTrackKeys.isEmpty()) return tracks

    val scored = tracks.mapIndexed { index, track ->
        val affinity = mobileTasteAffinity(track, context)
        maxOf(0.0, 1.0 - index * MOBILE_AFFINITY_SEARCH_POSITION_DECAY) +
            affinity * MOBILE_AFFINITY_SEARCH_BOOST to index
    }
    return scored
        .sortedWith(compareByDescending<Pair<Double, Int>> { it.first }.thenBy { it.second })
        .map { tracks[it.second] }
}

internal fun mobileSmartQueueCandidates(
    sections: List<FeedSection>,
    currentQueue: List<Track>,
    limit: Int = 20,
): List<Track> {
    val excluded = currentQueue.mapTo(mutableSetOf()) { it.recommendationKey() }
    val artistCounts = mutableMapOf<String, Int>()
    return sections
        .sortedBy { if (it.title == "Recommended Next") 0 else 1 }
        .flatMap { it.tracks }
        .distinctBy { it.recommendationKey() }
        .filterNot { it.recommendationKey() in excluded }
        .filter { track ->
            val key = track.artist.tasteKey()
            val count = artistCounts[key] ?: 0
            if (count >= 2) return@filter false
            artistCounts[key] = count + 1
            true
        }
        .take(limit.coerceAtLeast(0))
}

private fun Track.sameTrack(other: Track): Boolean = recommendationKey() == other.recommendationKey()

private fun Track.recommendationKey(): String = "${sourceId.tasteKey()}:${id.trim()}"

private fun String.tasteKey(): String = lowercase()
    .replace(Regex("[^a-z0-9]+"), " ")
    .trim()
