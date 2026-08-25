package xyz.spiceapp.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.mobile.model.FeedSection
import xyz.spiceapp.mobile.model.Track

class MobileRecommendationsTest {
    private val played = Track("played", "Digital Love", "Daft Punk", sourceId = "youtube_music")
    private val liked = Track("liked", "Genesis", "Justice", sourceId = "soundcloud")

    @Test
    fun tasteSeedsUseDistinctRecentAndLikedArtists() {
        val seeds = buildMobileRecommendationSeeds(
            history = listOf(played, played.copy(id = "other")),
            liked = listOf(liked),
        )

        assertEquals(listOf("Daft Punk", "Justice"), seeds.map { it.track.artist })
        assertTrue(seeds.first().label.startsWith("Because you played"))
    }

    @Test
    fun rankingExcludesHistoryAndKeepsProviderVariety() {
        val seed = buildMobileRecommendationSeeds(listOf(played), listOf(liked), 1).single()
        val batches = listOf(
            MobileRecommendationBatch(
                seed,
                listOf(
                    played,
                    Track("one", "One More Time", "Daft Punk", sourceId = "youtube_music"),
                    Track("two", "Phantom", "Justice", sourceId = "soundcloud"),
                ),
            ),
        )

        val ranked = rankMobileRecommendations(batches, listOf(played), listOf(liked))

        assertFalse(ranked.any { it.id == played.id })
        assertEquals(setOf("youtube_music", "soundcloud"), ranked.map { it.sourceId }.toSet())
    }

    @Test
    fun smartQueueDoesNotRepeatTheCurrentQueue() {
        val sections = listOf(
            FeedSection("Recommended Next", listOf(played, liked)),
            FeedSection("Quick Picks", listOf(liked.copy(id = "fresh"))),
        )

        val continuation = mobileSmartQueueCandidates(sections, listOf(played))

        assertFalse(continuation.any { it.id == played.id })
        assertTrue(continuation.isNotEmpty())
    }

    @Test
    fun affinityRanksLikedAndFamiliarAboveUnknownAndSkipped() {
        val history = listOf(played, played.copy(id = "played-2"))
        val context = mobileTasteContext(
            history = history,
            liked = listOf(liked),
            trackPriorityFor = { key -> if (key == "youtube music:skipped") -12 else 0 },
        )

        val likedScore = mobileTasteAffinity(liked, context)
        val familiarScore = mobileTasteAffinity(Track("fresh", "Get Lucky", "Daft Punk", sourceId = "youtube_music"), context)
        val unknownScore = mobileTasteAffinity(Track("strange", "Mystery Song", "Strangers Inc", sourceId = "youtube_music"), context)
        val skippedScore = mobileTasteAffinity(Track("skipped", "Skipped Song", "Daft Punk", sourceId = "youtube_music"), context)

        assertTrue(likedScore > familiarScore)
        assertTrue(familiarScore > unknownScore)
        assertTrue(skippedScore < unknownScore)
    }

    @Test
    fun searchReorderRisesLikedTracksButKeepsNeutralOrder() {
        val history = listOf(played, played.copy(id = "played-2"))
        val context = mobileTasteContext(history = history, liked = listOf(liked), trackPriorityFor = { 0 })
        val results = listOf(
            Track("u1", "Unknown A", "Strangers Inc", sourceId = "youtube_music"),
            Track("u2", "Unknown B", "Others LLC", sourceId = "youtube_music"),
            Track("u3", "Unknown C", "More People", sourceId = "youtube_music"),
            liked,
            Track("u4", "Unknown D", "Filler Corp", sourceId = "youtube_music"),
        )

        val reordered = reorderMobileTracksByTaste(results, context)

        assertTrue(reordered.indexOf(liked) < results.indexOf(liked))
        assertEquals(
            results.filter { it.id != liked.id }.map { it.id },
            reordered.filter { it.id != liked.id }.map { it.id },
        )
    }

    @Test
    fun searchReorderIsNoOpWithoutTasteEvidence() {
        val context = mobileTasteContext(history = emptyList(), liked = emptyList(), trackPriorityFor = { 0 })
        val results = listOf(played, liked, played.copy(id = "third"))

        assertEquals(results, reorderMobileTracksByTaste(results, context))
    }

    @Test
    fun adaptivePrioritiesBiasRecommendationRanking() {
        val seed = buildMobileRecommendationSeeds(listOf(played), emptyList(), 1).single()
        val candidates = listOf(
            Track("neutral", "Neutral Song", "Strangers Inc", sourceId = "youtube_music"),
            Track("loved", "Loved Song", "Daft Punk", sourceId = "youtube_music"),
        )
        val batches = listOf(MobileRecommendationBatch(seed, candidates))

        val ranked = rankMobileRecommendations(
            batches,
            listOf(played),
            emptyList(),
            trackPriorityFor = { key ->
                when (key) {
                    "youtube music:loved" -> 12
                    "youtube music:neutral" -> -12
                    else -> 0
                }
            },
        )

        assertEquals("loved", ranked.first().id)
    }
    @Test
    fun affinityContextCapturesArtistWeightsLikesAndRecents() {
        val history = listOf(played, played.copy(id = "played-2"), liked.copy(id = "liked-history"))
        val context = mobileTasteContext(
            history = history,
            liked = listOf(liked),
            trackPriorityFor = { 0 },
        )

        assertEquals(2, context.historyArtistWeights["daft punk"])
        assertTrue(context.likedArtistKeys.contains("justice"))
        assertTrue(context.likedTrackKeys.contains("soundcloud:liked"))
        assertTrue(context.recentTrackKeys.contains("youtube music:played"))
    }

    @Test
    fun recentlyPlayedTracksAreDampenedNotBoosted() {
        val history = listOf(played, Track("other", "Other Song", "Someone Else", sourceId = "youtube_music"))
        val context = mobileTasteContext(history = history, liked = emptyList(), trackPriorityFor = { 0 })
        val freshScore = mobileTasteAffinity(played.copy(id = "fresh-variant"), context)
        val repeatedScore = mobileTasteAffinity(played, context)

        assertTrue("a just-played track must rank below its fresh variant", repeatedScore < freshScore)
    }

    @Test
    fun searchReorderKeepsEverythingStableWhenNoTrackHasAffinity() {
        val history = listOf(played)
        val context = mobileTasteContext(history = history, liked = emptyList(), trackPriorityFor = { 0 })
        val results = listOf(
            Track("u1", "Alpha", "Strangers Inc", sourceId = "youtube_music"),
            Track("u2", "Beta", "Others LLC", sourceId = "youtube_music"),
            Track("u3", "Gamma", "More People", sourceId = "youtube_music"),
        )

        assertEquals(results, reorderMobileTracksByTaste(results, context))
    }

    @Test
    fun recommendationRankingIsUnchangedWithoutAPriorityCallback() {
        val seed = buildMobileRecommendationSeeds(listOf(played), emptyList(), 1).single()
        val candidates = listOf(
            Track("a", "Song A", "Daft Punk", sourceId = "youtube_music"),
            Track("b", "Song B", "Justice", sourceId = "soundcloud"),
        )
        val ranked = rankMobileRecommendations(
            listOf(MobileRecommendationBatch(seed, candidates)),
            listOf(played),
            emptyList(),
        )

        assertTrue(ranked.isNotEmpty())
        assertFalse(ranked.any { it.id == played.id })
    }
}
