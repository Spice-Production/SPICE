package xyz.spiceapp.engine.playback

import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MobilePlaybackTransitionsTest {
    @Test
    fun transitionPreparesBeforeItsFadeWindow() {
        assertTrue(shouldPrepareMobileTransition(80_000L, 100_000L, 5_000L, hasNextTrack = true))
        assertFalse(shouldStartMobileTransition(80_000L, 100_000L, 5_000L, prepared = true))
        assertTrue(shouldStartMobileTransition(96_000L, 100_000L, 5_000L, prepared = true))
        assertFalse(shouldPrepareMobileTransition(96_000L, 100_000L, 5_000L, hasNextTrack = false))
    }

    @Test
    fun durationIsBoundedForMobilePlayback() {
        assertEquals(0L, normalizeMobileCrossfadeDurationMs(-1L))
        assertEquals(MAX_MOBILE_CROSSFADE_DURATION_MS, normalizeMobileCrossfadeDurationMs(60_000L))
    }

    @Test
    fun interruptionCancelsAnOverlapButNaturalOutgoingEndDoesNot() {
        assertTrue(shouldCancelMobileCrossfadeForPlaybackInterruption(true, false, false))
        assertTrue(
            shouldCancelMobileCrossfadeForPlaybackInterruption(
                crossfadeRunning = true,
                playWhenReady = true,
                outgoingEndedNaturally = false,
                playbackSuppressed = true,
            ),
        )
        assertFalse(shouldCancelMobileCrossfadeForPlaybackInterruption(true, false, true))
        assertFalse(shouldCancelMobileCrossfadeForPlaybackInterruption(false, false, false))
    }

    @Test
    fun onlyMedia3AutomaticRepeatTransitionsCountAsRepeatedListens() {
        assertTrue(isAutomaticMobileRepeatTransition(Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT))
        assertFalse(isAutomaticMobileRepeatTransition(Player.MEDIA_ITEM_TRANSITION_REASON_SEEK))
        assertFalse(isAutomaticMobileRepeatTransition(Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED))
    }

    @Test
    fun overlapNeverOutlivesTheOutgoingTrackAndSkipsTooLateStarts() {
        assertEquals(2_000L, effectiveMobileCrossfadeDurationMs(5_000L, 2_000L))
        assertEquals(5_000L, effectiveMobileCrossfadeDurationMs(5_000L, 9_000L))
        assertEquals(null, effectiveMobileCrossfadeDurationMs(5_000L, 100L))
    }

    @Test
    fun staleOutgoingEndedEventIsIgnoredAfterCrossfadePlayerSwap() {
        assertTrue(shouldDispatchMobilePlaybackEnded(true, true, false))
        assertFalse(shouldDispatchMobilePlaybackEnded(true, false, false))
        assertFalse(shouldDispatchMobilePlaybackEnded(true, true, true))
    }

    @Test
    fun staleSourceRetryCannotOverwriteAReplacementOrCrossfadePromotion() {
        assertTrue(shouldRetryMobilePlaybackSource(4L, 4L, "old", "old"))
        assertFalse(shouldRetryMobilePlaybackSource(4L, 5L, "old", "new"))
        assertFalse(shouldRetryMobilePlaybackSource(4L, 4L, "old", "new"))
    }

    @Test
    fun previousRestartsAfterThreeSeconds() {
        assertFalse(shouldRestartMobileTrackForPrevious(3_000L))
        assertTrue(shouldRestartMobileTrackForPrevious(3_001L))
    }

    @Test
    fun forwardSeekIntoTheEndingCountsAsSkipButSmallOrBackwardSeeksDoNot() {
        assertTrue(shouldTreatMobileSeekAsSkip(10_000L, 178_000L, 180_000L))
        assertFalse(shouldTreatMobileSeekAsSkip(177_500L, 178_000L, 180_000L))
        assertFalse(shouldTreatMobileSeekAsSkip(100_000L, 110_000L, 180_000L))
        assertFalse(shouldTreatMobileSeekAsSkip(178_000L, 10_000L, 180_000L))
    }

    @Test
    fun promotedCrossfadePlayerKeepsShuffleAndRepeatModes() {
        assertEquals(
            MobilePromotedPlayerModes(shuffleEnabled = true, repeatMode = Player.REPEAT_MODE_ONE),
            mobilePromotedPlayerModes(true, Player.REPEAT_MODE_ONE),
        )
    }

    @Test
    fun incomingTrackShorterThanTheFadeFallsBackToAnExactCut() {
        assertTrue(shouldUseExactMobileCutForIncoming(4_000L, 5_000L))
        assertFalse(shouldUseExactMobileCutForIncoming(30_000L, 5_000L))
    }

    @Test
    fun mediaSessionQueueCommandsRouteToThePersistedQueueInEitherLifecycleState() {
        assertEquals(1, mobileQueueNavigationStepForPlayerCommand(Player.COMMAND_SEEK_TO_NEXT))
        assertEquals(1, mobileQueueNavigationStepForPlayerCommand(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM))
        assertEquals(-1, mobileQueueNavigationStepForPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS))
        assertEquals(-1, mobileQueueNavigationStepForPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM))
        assertEquals(null, mobileQueueNavigationStepForPlayerCommand(Player.COMMAND_PLAY_PAUSE))
    }

    @Test
    fun staleServiceNavigationCannotPromoteAfterPauseOrStopInvalidatesIt() {
        assertTrue(shouldCommitMobileServiceNavigation(4L, 4L, "old", "old", true))
        assertFalse(shouldCommitMobileServiceNavigation(4L, 5L, "old", "old", false))
        assertFalse(shouldCommitMobileServiceNavigation(4L, 4L, "old", "new", true))
        assertFalse(shouldRunMobileBackgroundContinuation(false, false, false))
        assertFalse(shouldRunMobileBackgroundContinuation(true, false, true))
        assertTrue(shouldRunMobileBackgroundContinuation(false, true, true))
        assertFalse(shouldStartMobileCrossfadeForPlaybackState(false, false))
        assertFalse(shouldStartMobileCrossfadeForPlaybackState(true, true))
    }
}
