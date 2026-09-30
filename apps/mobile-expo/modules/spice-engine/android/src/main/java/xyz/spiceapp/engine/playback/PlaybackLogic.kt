package xyz.spiceapp.engine.playback

import androidx.media3.common.Player
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.min
import kotlin.math.pow

internal const val MIN_MOBILE_TRACK_PRIORITY = -12
internal const val MAX_MOBILE_TRACK_PRIORITY = 12
internal const val MAX_MOBILE_TRACK_PRIORITY_ENTRIES = 2_000
private const val MAX_MOBILE_TRACK_PRIORITY_KEY_LENGTH = 256

internal enum class MobileTrackFeedback {
    Completed,
    EarlySkip,
    LateSkip,
}

internal fun mobileTrackFeedbackForManualDeparture(
    positionMs: Long,
    durationMs: Long,
): MobileTrackFeedback {
    if (durationMs <= 0L) return MobileTrackFeedback.EarlySkip
    val listenedFraction = positionMs.coerceAtLeast(0L).toDouble() / durationMs.toDouble()
    return if (positionMs < 30_000L || listenedFraction < 0.5) {
        MobileTrackFeedback.EarlySkip
    } else {
        MobileTrackFeedback.LateSkip
    }
}

internal fun updatedMobileTrackPriority(
    current: Int,
    feedback: MobileTrackFeedback,
): Int {
    val delta = when (feedback) {
        MobileTrackFeedback.Completed -> 2
        MobileTrackFeedback.EarlySkip -> -2
        MobileTrackFeedback.LateSkip -> -1
    }
    return (current + delta).coerceIn(MIN_MOBILE_TRACK_PRIORITY, MAX_MOBILE_TRACK_PRIORITY)
}

internal fun committedMobileDepartureFeedback(
    pending: MobileTrackFeedback?,
    replacementCommitted: Boolean,
): MobileTrackFeedback? = pending.takeIf { replacementCommitted }

internal fun mobileTrackShuffleWeight(priority: Int): Double =
    2.0.pow(priority.coerceIn(MIN_MOBILE_TRACK_PRIORITY, MAX_MOBILE_TRACK_PRIORITY) / 4.0)
        .coerceIn(0.125, 8.0)

internal fun chooseWeightedMobileQueueIndex(
    candidateIndices: List<Int>,
    priorityForIndex: (Int) -> Int,
    randomUnit: Double,
): Int? {
    if (candidateIndices.isEmpty()) return null
    val weighted = candidateIndices.map { index ->
        index to mobileTrackShuffleWeight(priorityForIndex(index))
    }
    val total = weighted.sumOf { it.second }
    if (total <= 0.0) return candidateIndices.first()
    var cursor = randomUnit.coerceIn(0.0, 0.999999999999) * total
    weighted.forEach { (index, weight) ->
        cursor -= weight
        if (cursor < 0.0) return index
    }
    return weighted.last().first
}

internal data class MobileShufflePlan(
    val queueIndex: Int,
    val startsNewRound: Boolean,
)

/**
 * Keeps the familiar no-repeat round while every track has the same score. Once
 * listening feedback makes the scores differ, a round becomes [queueIndices.size]
 * committed starts sampled by weight. The current item is always excluded, so an
 * adaptive round can favor a song without immediately repeating it.
 */
internal fun planMobileShuffleQueueIndex(
    queueIndices: List<Int>,
    currentIndex: Int,
    playedTrackKeys: Set<String>,
    roundPlayCount: Int,
    allowWrap: Boolean,
    trackKeyForIndex: (Int) -> String,
    priorityForIndex: (Int) -> Int,
    randomUnit: Double,
): MobileShufflePlan? {
    val playable = queueIndices.filter { it != currentIndex }
    if (playable.isEmpty()) return null

    val priorities = queueIndices.associateWith { priorityForIndex(it) }
    val adaptive = priorities.values.distinct().size > 1
    val freshNeutralChoices = playable.filter { trackKeyForIndex(it) !in playedTrackKeys }
    val roundComplete = if (adaptive) {
        roundPlayCount >= queueIndices.size
    } else {
        freshNeutralChoices.isEmpty()
    }
    if (roundComplete && !allowWrap) return null

    val choices = when {
        adaptive -> playable
        roundComplete -> playable
        else -> freshNeutralChoices
    }
    val selected = chooseWeightedMobileQueueIndex(
        candidateIndices = choices,
        priorityForIndex = { priorities.getValue(it) },
        randomUnit = randomUnit,
    ) ?: return null
    return MobileShufflePlan(selected, startsNewRound = roundComplete)
}

internal fun parseMobileTrackPriorities(payload: String): LinkedHashMap<String, Int> {
    val parsed = linkedMapOf<String, Int>()
    val entries = runCatching { JSONArray(payload) }.getOrNull() ?: return parsed
    for (index in 0 until entries.length()) {
        val item = entries.optJSONObject(index) ?: continue
        val key = item.optString("key").trim()
        if (!isValidMobileTrackPriorityKey(key) || !item.has("score")) continue
        val score = item.optInt("score", Int.MIN_VALUE)
        if (score == Int.MIN_VALUE) continue
        parsed.remove(key)
        parsed[key] = score.coerceIn(MIN_MOBILE_TRACK_PRIORITY, MAX_MOBILE_TRACK_PRIORITY)
        while (parsed.size > MAX_MOBILE_TRACK_PRIORITY_ENTRIES) {
            parsed.remove(parsed.keys.first())
        }
    }
    return parsed
}

internal fun encodeMobileTrackPriorities(priorities: Map<String, Int>): String = JSONArray().apply {
    priorities.entries
        .filter { isValidMobileTrackPriorityKey(it.key) }
        .toList()
        .takeLast(MAX_MOBILE_TRACK_PRIORITY_ENTRIES)
        .forEach { (key, score) ->
            put(
                JSONObject()
                    .put("key", key)
                    .put("score", score.coerceIn(MIN_MOBILE_TRACK_PRIORITY, MAX_MOBILE_TRACK_PRIORITY)),
            )
        }
}.toString()

internal data class MobileTrackPriorityPayloadUpdate(
    val payload: String,
    val updatedScore: Int,
)

internal fun updateMobileTrackPriorityPayload(
    latestPayload: String,
    trackKey: String,
    feedback: MobileTrackFeedback,
): MobileTrackPriorityPayloadUpdate {
    if (!isValidMobileTrackPriorityKey(trackKey)) {
        return MobileTrackPriorityPayloadUpdate(latestPayload, 0)
    }
    val priorities = parseMobileTrackPriorities(latestPayload)
    val updated = updatedMobileTrackPriority(priorities[trackKey] ?: 0, feedback)
    priorities.remove(trackKey)
    priorities[trackKey] = updated
    return MobileTrackPriorityPayloadUpdate(
        payload = encodeMobileTrackPriorities(priorities),
        updatedScore = updated,
    )
}

internal fun mobilePlaybackHistoryTarget(
    history: List<String>,
    cursor: Int,
    step: Int,
    availableTrackKeys: Set<String>,
): Pair<Int, String>? {
    var candidateCursor = cursor + step
    while (candidateCursor in history.indices) {
        val key = history[candidateCursor]
        if (key in availableTrackKeys) return candidateCursor to key
        candidateCursor += step
    }
    return null
}

internal fun shouldResetMobileShuffleRound(
    previousQueueKeys: List<String>,
    replacementQueueKeys: List<String>,
): Boolean = previousQueueKeys != replacementQueueKeys

private fun isValidMobileTrackPriorityKey(key: String): Boolean =
    key.isNotBlank() &&
        key.length <= MAX_MOBILE_TRACK_PRIORITY_KEY_LENGTH &&
        key.none(Char::isISOControl)

internal const val MAX_MOBILE_CROSSFADE_DURATION_MS = 12_000L

internal fun normalizeMobileCrossfadeDurationMs(value: Long): Long =
    value.coerceIn(0L, MAX_MOBILE_CROSSFADE_DURATION_MS)

internal fun shouldPrepareMobileTransition(
    positionMs: Long,
    durationMs: Long,
    crossfadeDurationMs: Long,
    hasNextTrack: Boolean,
): Boolean {
    val safeCrossfade = normalizeMobileCrossfadeDurationMs(crossfadeDurationMs)
    if (!hasNextTrack || safeCrossfade <= 0L || durationMs <= 0L) return false
    val remainingMs = (durationMs - positionMs).coerceAtLeast(0L)
    return remainingMs in 1..(safeCrossfade + 15_000L)
}

internal fun shouldStartMobileTransition(
    positionMs: Long,
    durationMs: Long,
    crossfadeDurationMs: Long,
    prepared: Boolean,
): Boolean {
    val safeCrossfade = normalizeMobileCrossfadeDurationMs(crossfadeDurationMs)
    if (!prepared || safeCrossfade <= 0L || durationMs <= 0L) return false
    val remainingMs = (durationMs - positionMs).coerceAtLeast(0L)
    return remainingMs in 1..safeCrossfade
}

internal fun shouldCancelMobileCrossfadeForPlaybackInterruption(
    crossfadeRunning: Boolean,
    playWhenReady: Boolean,
    outgoingEndedNaturally: Boolean,
    playbackSuppressed: Boolean = false,
): Boolean = crossfadeRunning &&
    !outgoingEndedNaturally &&
    (!playWhenReady || playbackSuppressed)

internal fun isAutomaticMobileRepeatTransition(reason: Int): Boolean =
    reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT

internal fun effectiveMobileCrossfadeDurationMs(
    configuredDurationMs: Long,
    outgoingRemainingMs: Long,
): Long? {
    val duration = min(
        normalizeMobileCrossfadeDurationMs(configuredDurationMs),
        outgoingRemainingMs.coerceAtLeast(0L),
    )
    return duration.takeIf { it >= 250L }
}

internal fun shouldDispatchMobilePlaybackEnded(
    callbackReportsEnded: Boolean,
    controllerStillReportsEnded: Boolean,
    alreadyHandledForCurrentItem: Boolean,
): Boolean = callbackReportsEnded && controllerStillReportsEnded && !alreadyHandledForCurrentItem

internal fun shouldRetryMobilePlaybackSource(
    capturedGeneration: Long,
    currentGeneration: Long,
    capturedMediaId: String,
    currentMediaId: String,
): Boolean = capturedGeneration == currentGeneration &&
    capturedMediaId.isNotBlank() &&
    capturedMediaId == currentMediaId

internal fun shouldRestartMobileTrackForPrevious(positionMs: Long): Boolean = positionMs > 3_000L

internal fun shouldTreatMobileSeekAsSkip(
    currentPositionMs: Long,
    targetPositionMs: Long,
    durationMs: Long,
): Boolean = durationMs > 0L &&
    targetPositionMs - currentPositionMs >= 1_000L &&
    targetPositionMs >= durationMs - 3_000L

internal data class MobilePromotedPlayerModes(
    val shuffleEnabled: Boolean,
    val repeatMode: Int,
)

internal fun mobilePromotedPlayerModes(
    outgoingShuffleEnabled: Boolean,
    outgoingRepeatMode: Int,
): MobilePromotedPlayerModes = MobilePromotedPlayerModes(
    shuffleEnabled = outgoingShuffleEnabled,
    repeatMode = outgoingRepeatMode,
)

internal fun shouldUseExactMobileCutForIncoming(
    incomingDurationMs: Long,
    requestedCrossfadeDurationMs: Long,
): Boolean = incomingDurationMs > 0L &&
    incomingDurationMs <= requestedCrossfadeDurationMs + 250L

internal fun mobileQueueNavigationStepForPlayerCommand(playerCommand: Int): Int? = when (playerCommand) {
    Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
    Player.COMMAND_SEEK_TO_NEXT,
    -> 1
    Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
    Player.COMMAND_SEEK_TO_PREVIOUS,
    -> -1
    else -> null
}

internal fun shouldCommitMobileServiceNavigation(
    capturedGeneration: Long,
    currentGeneration: Long,
    capturedMediaId: String,
    currentMediaId: String,
    navigationStillPending: Boolean,
): Boolean = navigationStillPending &&
    capturedGeneration == currentGeneration &&
    capturedMediaId.isNotBlank() &&
    capturedMediaId == currentMediaId

internal fun shouldRunMobileBackgroundContinuation(
    playWhenReady: Boolean,
    playbackEnded: Boolean,
    playbackSuppressed: Boolean,
): Boolean = playbackEnded || (playWhenReady && !playbackSuppressed)

internal fun shouldStartMobileCrossfadeForPlaybackState(
    isPlaying: Boolean,
    playbackSuppressed: Boolean,
): Boolean = isPlaying && !playbackSuppressed
