/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { makeTrack } from '../models.ts';
import {
  MAX_CROSSFADE_DURATION_MS,
  chooseWeightedQueueIndex,
  effectiveCrossfadeDurationMs,
  normalizeCrossfadeDurationMs,
  normalizePlaybackHistoryForQueue,
  normalizeQueue,
  planShuffleQueueIndex,
  playbackHistoryTarget,
  resolveQueueSelectionIndex,
  shouldPrepareTransition,
  shouldResetShuffleRound,
  shouldRestartTrackForPrevious,
  shouldStartTransition,
  shouldTreatSeekAsSkip,
  trackFeedbackForManualDeparture,
  trackShuffleWeight,
  updatedTrackPriority,
} from '../playback.ts';

/** Deterministic PRNG so the long-run shuffle test is reproducible. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('completed listens raise priority and manual departures lower it', () => {
  let priority = 0;
  priority = updatedTrackPriority(priority, 'Completed');
  priority = updatedTrackPriority(priority, 'Completed');
  assert.equal(priority, 4);
  priority = updatedTrackPriority(priority, 'LateSkip');
  assert.equal(priority, 3);
  priority = updatedTrackPriority(priority, 'EarlySkip');
  assert.equal(priority, 1);
  assert.equal(trackFeedbackForManualDeparture(10_000, 180_000), 'EarlySkip');
  assert.equal(trackFeedbackForManualDeparture(120_000, 180_000), 'LateSkip');
});

test('weighted selection favors higher priority without removing low priority tracks', () => {
  const priorities = new Map([
    [0, -8],
    [1, 8],
  ]);
  assert.equal(chooseWeightedQueueIndex([0, 1], (index) => priorities.get(index)!, 0.1), 1);
  assert.equal(chooseWeightedQueueIndex([0, 1], (index) => priorities.get(index)!, 0), 0);
  assert.ok(trackShuffleWeight(8) > trackShuffleWeight(-8));
});

test('neutral shuffle visits each track once before starting a new round', () => {
  const keys = ['a', 'b', 'c', 'd'];
  const played = new Set(['a']);
  let current = 0;
  for (let step = 0; step < 3; step += 1) {
    const plan = planShuffleQueueIndex({
      queueIndices: [0, 1, 2, 3],
      currentIndex: current,
      playedTrackKeys: played,
      roundPlayCount: played.size,
      allowWrap: false,
      trackKeyForIndex: (index) => keys[index]!,
      priorityForIndex: () => 0,
      randomUnit: step / 3,
    });
    assert.ok(plan);
    assert.ok(!played.has(keys[plan.queueIndex]!));
    assert.equal(plan.startsNewRound, false);
    current = plan.queueIndex;
    played.add(keys[current]!);
  }
  const base = {
    queueIndices: [0, 1, 2, 3],
    currentIndex: current,
    playedTrackKeys: played,
    roundPlayCount: played.size,
    trackKeyForIndex: (index: number) => keys[index]!,
    priorityForIndex: () => 0,
    randomUnit: 0.5,
  };
  assert.equal(planShuffleQueueIndex({ ...base, allowWrap: false }), null);
  assert.equal(planShuffleQueueIndex({ ...base, allowWrap: true })?.startsNewRound, true);
});

test('adaptive shuffle changes long-run frequency and keeps rounds bounded', () => {
  const keys = ['favorite', 'neutral', 'disliked'];
  const priorities = [8, 0, -8];
  const random = mulberry32(17);
  const counts = [0, 0, 0];
  const played = new Set([keys[0]!]);
  let current = 0;
  let roundStarts = 1;
  counts[current]! += 1;
  for (let i = 0; i < 600; i += 1) {
    const plan = planShuffleQueueIndex({
      queueIndices: [0, 1, 2],
      currentIndex: current,
      playedTrackKeys: played,
      roundPlayCount: roundStarts,
      allowWrap: true,
      trackKeyForIndex: (index) => keys[index]!,
      priorityForIndex: (index) => priorities[index]!,
      randomUnit: random(),
    });
    assert.ok(plan);
    if (plan.startsNewRound) {
      played.clear();
      roundStarts = 0;
    }
    assert.notEqual(plan.queueIndex, current, 'shuffle repeated the active song');
    current = plan.queueIndex;
    played.add(keys[current]!);
    roundStarts += 1;
    assert.ok(roundStarts <= keys.length);
    counts[current]! += 1;
  }
  assert.ok(counts[0]! > counts[1]!, `favorite should play more: ${counts}`);
  assert.ok(counts[1]! > counts[2]! * 2, `disliked should play less: ${counts}`);
});

test('shuffle history traverses the exact played order in both directions', () => {
  const history = ['a', 'd', 'b'];
  const available = new Set(['a', 'b', 'c', 'd']);
  assert.deepEqual(playbackHistoryTarget(history, 2, -1, available), [1, 'd']);
  assert.deepEqual(playbackHistoryTarget(history, 1, -1, available), [0, 'a']);
  assert.deepEqual(playbackHistoryTarget(history, 0, 1, available), [1, 'd']);
  assert.equal(playbackHistoryTarget(history, 0, -1, available), null);
  assert.ok(shouldResetShuffleRound(['a', 'b'], ['b', 'a']));
  assert.ok(!shouldResetShuffleRound(['a', 'b'], ['a', 'b']));
});

test('history normalization drops keys outside the queue and keeps the cursor', () => {
  assert.deepEqual(normalizePlaybackHistoryForQueue(['a', 'x', 'b', 'c'], 2, new Set(['a', 'b', 'c'])), [['a', 'b', 'c'], 1]);
  assert.deepEqual(normalizePlaybackHistoryForQueue(['x'], 0, new Set(['a'])), [[], -1]);
});

test('crossfade windows, bounds, and exact-cut fallbacks match the service', () => {
  assert.ok(shouldPrepareTransition(80_000, 100_000, 5_000, true));
  assert.ok(!shouldStartTransition(80_000, 100_000, 5_000, true));
  assert.ok(shouldStartTransition(96_000, 100_000, 5_000, true));
  assert.ok(!shouldPrepareTransition(96_000, 100_000, 5_000, false));
  assert.equal(normalizeCrossfadeDurationMs(-1), 0);
  assert.equal(normalizeCrossfadeDurationMs(60_000), MAX_CROSSFADE_DURATION_MS);
  assert.equal(effectiveCrossfadeDurationMs(5_000, 2_000), 2_000);
  assert.equal(effectiveCrossfadeDurationMs(5_000, 9_000), 5_000);
  assert.equal(effectiveCrossfadeDurationMs(5_000, 100), null);
});

test('previous restarts after three seconds and deep forward seeks count as skips', () => {
  assert.ok(!shouldRestartTrackForPrevious(3_000));
  assert.ok(shouldRestartTrackForPrevious(3_001));
  assert.ok(shouldTreatSeekAsSkip(10_000, 178_000, 180_000));
  assert.ok(!shouldTreatSeekAsSkip(177_500, 178_000, 180_000));
  assert.ok(!shouldTreatSeekAsSkip(100_000, 110_000, 180_000));
  assert.ok(!shouldTreatSeekAsSkip(178_000, 10_000, 180_000));
});

test('queue selection keeps the tapped duplicate and inserts missing selections', () => {
  const duplicate = makeTrack({ id: 'same', title: 'Duplicate' });
  const queue = [duplicate, makeTrack({ id: 'middle' }), duplicate];
  assert.equal(resolveQueueSelectionIndex(queue, duplicate, 2), 2);
  assert.equal(resolveQueueSelectionIndex(queue, duplicate), 0);
  const outsider = makeTrack({ id: 'outsider' });
  assert.equal(normalizeQueue(queue, outsider)[0], outsider);
  assert.deepEqual(normalizeQueue([], outsider), [outsider]);
});
