package xyz.spiceapp.engine.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.spiceapp.engine.RepeatMode
import xyz.spiceapp.engine.StreamQuality
import xyz.spiceapp.engine.Track
import xyz.spiceapp.engine.serviceQueueKey

class MobilePlaybackServiceContextTest {
    private val queue = listOf(
        Track("a", "A", "Artist"),
        Track("d", "D", "Artist"),
        Track("b", "B", "Artist"),
    )

    @Test
    fun contextRoundTripsAndCanRestoreAnActiveBackgroundTrack() {
        val context = MobilePlaybackServiceContext(
            queue = queue,
            queueIndex = 1,
            quality = StreamQuality.High,
            crossfadeDurationMs = 5_000L,
            repeatMode = RepeatMode.All,
            shuffleEnabled = true,
            shuffleRoundTrackKeys = listOf("youtube_music:a", "youtube_music:d"),
            shuffleRoundPlayCount = 2,
            playbackHistory = listOf("youtube_music:a", "youtube_music:d"),
            playbackHistoryCursor = 1,
        )

        val restored = decodeMobilePlaybackServiceContext(encodeMobilePlaybackServiceContext(context))

        assertEquals(context, restored)
        assertEquals(context, restorableMobilePlaybackServiceContext(restored, "d"))
        assertNull(restorableMobilePlaybackServiceContext(restored, "missing"))
        assertNull(decodeMobilePlaybackServiceContext("not-json"))
    }

    @Test
    fun backgroundPromotionAdvancesQueueHistoryAndShuffleRoundAtomically() {
        val context = MobilePlaybackServiceContext(
            queue = queue,
            queueIndex = 0,
            quality = StreamQuality.Standard,
            crossfadeDurationMs = 3_000L,
            repeatMode = RepeatMode.All,
            shuffleEnabled = true,
            shuffleRoundTrackKeys = listOf("youtube_music:a"),
            shuffleRoundPlayCount = 1,
            playbackHistory = listOf("youtube_music:a"),
            playbackHistoryCursor = 0,
        )
        val resolved = queue[1].copy(title = "Resolved D")

        val advanced = advanceMobilePlaybackServiceContext(
            context = context,
            queueIndex = 1,
            resolvedTrack = resolved,
            startsNewShuffleRound = false,
        )

        assertEquals(1, advanced.queueIndex)
        assertEquals("Resolved D", advanced.queue[1].title)
        assertEquals(listOf("youtube_music:a", "youtube_music:d"), advanced.playbackHistory)
        assertEquals(1, advanced.playbackHistoryCursor)
        assertEquals(2, advanced.shuffleRoundPlayCount)
        assertTrue("youtube_music:d" in advanced.shuffleRoundTrackKeys)
    }

    @Test
    fun forwardHistoryPromotionDoesNotConsumeAnotherShuffleDraw() {
        val context = MobilePlaybackServiceContext(
            queue = queue,
            queueIndex = 0,
            quality = StreamQuality.Standard,
            crossfadeDurationMs = 0L,
            repeatMode = RepeatMode.All,
            shuffleEnabled = true,
            shuffleRoundTrackKeys = listOf("youtube_music:a", "youtube_music:d", "youtube_music:b"),
            shuffleRoundPlayCount = 3,
            playbackHistory = listOf("youtube_music:a", "youtube_music:d", "youtube_music:b"),
            playbackHistoryCursor = 0,
        )

        val advanced = advanceMobilePlaybackServiceContext(
            context = context,
            queueIndex = 1,
            resolvedTrack = queue[1],
            startsNewShuffleRound = false,
            countsAsShuffleDraw = false,
            historyCursorTarget = 1,
        )

        assertEquals(3, advanced.shuffleRoundPlayCount)
        assertEquals(context.shuffleRoundTrackKeys, advanced.shuffleRoundTrackKeys)
        assertEquals(1, advanced.playbackHistoryCursor)
        assertEquals(context.playbackHistory, advanced.playbackHistory)
    }

    @Test
    fun serviceNextPlanHonorsRepeatBoundaries() {
        val offAtEnd = MobilePlaybackServiceContext(
            queue = queue,
            queueIndex = queue.lastIndex,
            quality = StreamQuality.Standard,
            crossfadeDurationMs = 0L,
            repeatMode = RepeatMode.Off,
            shuffleEnabled = false,
        )
        assertNull(planMobileServiceNextTrack(offAtEnd, { 0 }, 0.5))
        assertEquals(
            0,
            planMobileServiceNextTrack(offAtEnd.copy(repeatMode = RepeatMode.All), { 0 }, 0.5)?.queueIndex,
        )
        assertNull(
            planMobileServiceNextTrack(offAtEnd.copy(repeatMode = RepeatMode.One), { 0 }, 0.5),
        )
        assertEquals(
            0,
            planMobileServiceNextTrack(
                offAtEnd.copy(repeatMode = RepeatMode.One),
                { 0 },
                0.5,
                manualNavigation = true,
            )?.queueIndex,
        )
    }

    @Test
    fun serviceUsesForwardShuffleHistoryBeforeDrawingANewTrack() {
        val context = MobilePlaybackServiceContext(
            queue = queue,
            queueIndex = 1,
            quality = StreamQuality.Standard,
            crossfadeDurationMs = 5_000L,
            repeatMode = RepeatMode.All,
            shuffleEnabled = true,
            shuffleRoundTrackKeys = queue.map { it.serviceQueueKey() },
            shuffleRoundPlayCount = queue.size,
            playbackHistory = listOf("youtube_music:a", "youtube_music:d", "youtube_music:b"),
            playbackHistoryCursor = 1,
        )

        val plan = planMobileServiceNextTrack(context, { 0 }, randomUnit = 0.99)

        assertEquals(2, plan?.queueIndex)
        assertEquals(2, plan?.historyCursorTarget)
        assertEquals(false, plan?.countsAsShuffleDraw)
        val previous = planMobileServicePreviousTrack(
            context.copy(queueIndex = 2, playbackHistoryCursor = 2),
        )
        assertEquals(1, previous?.queueIndex)
        assertEquals(1, previous?.historyCursorTarget)
        assertEquals(false, previous?.countsAsShuffleDraw)
    }

    @Test
    fun oversizedQueueKeepsTheActiveTrackInTheBoundedPersistedWindow() {
        val oversized = (0..MAX_MOBILE_SERVICE_QUEUE_SIZE).map { index ->
            Track("id-$index", "Track $index", "Artist")
        }
        val context = MobilePlaybackServiceContext(
            queue = oversized,
            queueIndex = oversized.lastIndex,
            quality = StreamQuality.DataSaver,
            crossfadeDurationMs = 12_000L,
            repeatMode = RepeatMode.All,
            shuffleEnabled = false,
            playbackHistory = listOf(
                "youtube_music:id-0",
                "youtube_music:id-${oversized.lastIndex - 1}",
                "youtube_music:id-${oversized.lastIndex}",
            ),
            playbackHistoryCursor = 1,
        )

        val restored = decodeMobilePlaybackServiceContext(encodeMobilePlaybackServiceContext(context))

        assertEquals(MAX_MOBILE_SERVICE_QUEUE_SIZE, restored?.queue?.size)
        assertEquals("id-${oversized.lastIndex}", restored?.queue?.get(restored.queueIndex)?.id)
        assertEquals(
            listOf(
                "youtube_music:id-${oversized.lastIndex - 1}",
                "youtube_music:id-${oversized.lastIndex}",
            ),
            restored?.playbackHistory,
        )
        assertEquals(0, restored?.playbackHistoryCursor)
    }
}
