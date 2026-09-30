package xyz.spiceapp.engine.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class MobileAdaptivePlaybackTest {
    @Test
    fun completedListensIncreaseAndManualDeparturesDecreasePriority() {
        var priority = 0
        priority = updatedMobileTrackPriority(priority, MobileTrackFeedback.Completed)
        priority = updatedMobileTrackPriority(priority, MobileTrackFeedback.Completed)
        assertEquals(4, priority)

        priority = updatedMobileTrackPriority(priority, MobileTrackFeedback.LateSkip)
        assertEquals(3, priority)
        priority = updatedMobileTrackPriority(priority, MobileTrackFeedback.EarlySkip)
        assertEquals(1, priority)
    }

    @Test
    fun manualDepartureClassifiesShortListensAsEarlySkips() {
        assertEquals(
            MobileTrackFeedback.EarlySkip,
            mobileTrackFeedbackForManualDeparture(positionMs = 10_000L, durationMs = 180_000L),
        )
        assertEquals(
            MobileTrackFeedback.LateSkip,
            mobileTrackFeedbackForManualDeparture(positionMs = 120_000L, durationMs = 180_000L),
        )
        assertNull(
            committedMobileDepartureFeedback(
                MobileTrackFeedback.EarlySkip,
                replacementCommitted = false,
            ),
        )
        assertEquals(
            MobileTrackFeedback.EarlySkip,
            committedMobileDepartureFeedback(
                MobileTrackFeedback.EarlySkip,
                replacementCommitted = true,
            ),
        )
    }

    @Test
    fun weightedSelectionFavorsHigherPriorityWithoutRemovingLowPriorityTracks() {
        val priorities = mapOf(0 to -8, 1 to 8)
        assertEquals(
            1,
            chooseWeightedMobileQueueIndex(listOf(0, 1), priorities::getValue, randomUnit = 0.1),
        )
        assertEquals(
            0,
            chooseWeightedMobileQueueIndex(listOf(0, 1), priorities::getValue, randomUnit = 0.0),
        )
        assertTrue(mobileTrackShuffleWeight(8) > mobileTrackShuffleWeight(-8))
    }

    @Test
    fun neutralShuffleVisitsEachTrackOnceBeforeStartingANewRound() {
        val keys = listOf("a", "b", "c", "d")
        val played = linkedSetOf("a")
        var current = 0
        repeat(3) { step ->
            val plan = planMobileShuffleQueueIndex(
                queueIndices = keys.indices.toList(),
                currentIndex = current,
                playedTrackKeys = played,
                roundPlayCount = played.size,
                allowWrap = false,
                trackKeyForIndex = keys::get,
                priorityForIndex = { 0 },
                randomUnit = step / 3.0,
            ) ?: error("neutral round ended too early")
            assertTrue(keys[plan.queueIndex] !in played)
            assertTrue(!plan.startsNewRound)
            current = plan.queueIndex
            played += keys[current]
        }

        assertNull(
            planMobileShuffleQueueIndex(
                queueIndices = keys.indices.toList(),
                currentIndex = current,
                playedTrackKeys = played,
                roundPlayCount = played.size,
                allowWrap = false,
                trackKeyForIndex = keys::get,
                priorityForIndex = { 0 },
                randomUnit = 0.5,
            ),
        )
        assertTrue(
            planMobileShuffleQueueIndex(
                queueIndices = keys.indices.toList(),
                currentIndex = current,
                playedTrackKeys = played,
                roundPlayCount = played.size,
                allowWrap = true,
                trackKeyForIndex = keys::get,
                priorityForIndex = { 0 },
                randomUnit = 0.5,
            )?.startsNewRound == true,
        )
    }

    @Test
    fun adaptiveShuffleChangesLongRunFrequencyAndKeepsRoundsBounded() {
        val keys = listOf("favorite", "neutral", "disliked")
        val priorities = listOf(8, 0, -8)
        val random = Random(17L)
        val counts = IntArray(keys.size)
        val played = linkedSetOf(keys.first())
        var current = 0
        var roundStarts = 1
        var previous = current
        counts[current] += 1

        repeat(600) {
            val plan = planMobileShuffleQueueIndex(
                queueIndices = keys.indices.toList(),
                currentIndex = current,
                playedTrackKeys = played,
                roundPlayCount = roundStarts,
                allowWrap = true,
                trackKeyForIndex = keys::get,
                priorityForIndex = priorities::get,
                randomUnit = random.nextDouble(),
            ) ?: error("adaptive repeat-all should always have a next track")
            if (plan.startsNewRound) {
                played.clear()
                roundStarts = 0
            }
            current = plan.queueIndex
            assertTrue("shuffle repeated the active song", current != previous)
            previous = current
            played += keys[current]
            roundStarts += 1
            assertTrue(roundStarts <= keys.size)
            counts[current] += 1
        }

        assertTrue("favorite should play materially more often: ${counts.toList()}", counts[0] > counts[1])
        assertTrue("disliked should play materially less often: ${counts.toList()}", counts[1] > counts[2] * 2)
        assertNull(
            planMobileShuffleQueueIndex(
                queueIndices = keys.indices.toList(),
                currentIndex = current,
                playedTrackKeys = played,
                roundPlayCount = keys.size,
                allowWrap = false,
                trackKeyForIndex = keys::get,
                priorityForIndex = priorities::get,
                randomUnit = 0.5,
            ),
        )
    }

    @Test
    fun shuffleHistoryTraversesTheExactPlayedOrderInBothDirections() {
        val history = listOf("a", "d", "b")
        val available = setOf("a", "b", "c", "d")

        assertEquals(1 to "d", mobilePlaybackHistoryTarget(history, 2, -1, available))
        assertEquals(0 to "a", mobilePlaybackHistoryTarget(history, 1, -1, available))
        assertEquals(1 to "d", mobilePlaybackHistoryTarget(history, 0, 1, available))
        assertNull(mobilePlaybackHistoryTarget(history, 0, -1, available))
    }

    @Test
    fun replacingOrReorderingTheQueueStartsAFreshShuffleRound() {
        assertTrue(shouldResetMobileShuffleRound(listOf("a", "b"), listOf("x", "y")))
        assertTrue(shouldResetMobileShuffleRound(listOf("a", "b"), listOf("b", "a")))
        assertTrue(!shouldResetMobileShuffleRound(listOf("a", "b"), listOf("a", "b")))
    }

    @Test
    fun persistedPrioritiesIgnoreMalformedDataClampScoresAndStayBounded() {
        val oversized = buildString {
            append('[')
            append("{\"key\":\"bad\",\"score\":\"nope\"},")
            for (index in 0..MAX_MOBILE_TRACK_PRIORITY_ENTRIES) {
                if (index > 0) append(',')
                append("{\"key\":\"youtube:").append(index).append("\",\"score\":999}")
            }
            append(']')
        }

        val parsed = parseMobileTrackPriorities(oversized)

        assertEquals(MAX_MOBILE_TRACK_PRIORITY_ENTRIES, parsed.size)
        assertTrue(parsed.values.all { it == MAX_MOBILE_TRACK_PRIORITY })
        assertTrue("youtube:0" !in parsed)
        assertTrue("youtube:${MAX_MOBILE_TRACK_PRIORITY_ENTRIES}" in parsed)
        assertTrue(parseMobileTrackPriorities("not json").isEmpty())
    }

    @Test
    fun independentRepositoryWritersMergeTheLatestPersistedPriorityPayload() {
        val firstWriter = updateMobileTrackPriorityPayload(
            latestPayload = "[]",
            trackKey = "youtube_music:a",
            feedback = MobileTrackFeedback.Completed,
        )
        val secondWriter = updateMobileTrackPriorityPayload(
            latestPayload = firstWriter.payload,
            trackKey = "youtube_music:b",
            feedback = MobileTrackFeedback.EarlySkip,
        )
        val merged = parseMobileTrackPriorities(secondWriter.payload)

        assertEquals(2, merged["youtube_music:a"])
        assertEquals(-2, merged["youtube_music:b"])
    }
}
