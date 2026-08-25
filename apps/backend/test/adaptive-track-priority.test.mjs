import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptiveOutcomeDelta,
  adaptiveTrackWeight,
  adaptiveTrackWeights,
  classifyAdaptiveListen,
  normalizeAdaptiveTrackPriorityState,
  recordAdaptiveListenOutcome,
  shouldTreatAdaptiveSeekAsSkip,
} from '../app/adaptive-track-priority.ts';

test('completed listens raise priority while early skips lower it persistently', () => {
  let state = normalizeAdaptiveTrackPriorityState(null);
  state = recordAdaptiveListenOutcome(state, 'youtube_music:liked', 'completed', 1_000);
  state = recordAdaptiveListenOutcome(state, 'youtube_music:liked', 'completed', 2_000);
  state = recordAdaptiveListenOutcome(state, 'youtube_music:skipped', 'late_skip', 3_000);

  assert.deepEqual(state.tracks['youtube_music:liked'], {
    score: 4,
    completed: 2,
    skipped: 0,
    updatedAt: 2_000,
  });
  assert.equal(state.tracks['youtube_music:skipped'].score, -1);
  assert.ok(adaptiveTrackWeight(state, 'youtube_music:liked') > 1);
  assert.ok(adaptiveTrackWeight(state, 'youtube_music:skipped') < 1);

  const restored = normalizeAdaptiveTrackPriorityState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(adaptiveTrackWeights(restored, [
    'youtube_music:liked',
    'youtube_music:unknown',
    'youtube_music:skipped',
  ]), [adaptiveTrackWeight(state, 'youtube_music:liked'), 1, adaptiveTrackWeight(state, 'youtube_music:skipped')]);
});

test('early skips count double, matching the Android client', () => {
  let state = normalizeAdaptiveTrackPriorityState(null);
  state = recordAdaptiveListenOutcome(state, 'youtube_music:tapped', 'early_skip', 1_000);
  assert.equal(state.tracks['youtube_music:tapped'].score, -2);

  state = recordAdaptiveListenOutcome(state, 'youtube_music:tapped', 'early_skip', 2_000);
  assert.equal(state.tracks['youtube_music:tapped'].score, -4);
  assert.equal(state.tracks['youtube_music:tapped'].skipped, 2);
});

test('classification distinguishes early and late departures', () => {
  assert.equal(classifyAdaptiveListen({ completedNaturally: true }), 'completed');
  assert.equal(classifyAdaptiveListen({ completedNaturally: false, positionMs: 10_000, durationMs: 200_000 }), 'early_skip');
  assert.equal(classifyAdaptiveListen({ completedNaturally: false, positionMs: 29_999, durationMs: 0 }), 'early_skip');
  assert.equal(classifyAdaptiveListen({ completedNaturally: false, positionMs: 150_000, durationMs: 200_000 }), 'late_skip');
  assert.equal(classifyAdaptiveListen({ completedNaturally: false }), 'late_skip');
});

test('only a natural completion earns priority; every explicit exit is a skip', () => {
  assert.equal(classifyAdaptiveListen({
    completedNaturally: true,
  }), 'completed');
  assert.notEqual(classifyAdaptiveListen({
    completedNaturally: false,
    positionMs: 120_000,
    durationMs: 200_000,
  }), 'completed');
});

test('seeking across the end cannot manufacture a completed listen', () => {
  assert.equal(shouldTreatAdaptiveSeekAsSkip({
    positionMs: 10_000,
    seekPositionMs: 178_000,
    durationMs: 180_000,
  }), true);
  assert.equal(shouldTreatAdaptiveSeekAsSkip({
    positionMs: 10_000,
    seekPositionMs: 90_000,
    durationMs: 180_000,
  }), false);
  assert.equal(shouldTreatAdaptiveSeekAsSkip({
    positionMs: 178_000,
    seekPositionMs: 10_000,
    durationMs: 180_000,
  }), false);
  assert.equal(shouldTreatAdaptiveSeekAsSkip({
    positionMs: 0,
    seekPositionMs: 10_000,
    durationMs: 0,
  }), false);
});

test('stored priority data is bounded and malformed entries are ignored', () => {
  const state = normalizeAdaptiveTrackPriorityState({
    version: 999,
    tracks: {
      valid: { score: 999, completed: -2, skipped: 4.8, updatedAt: 50 },
      broken: null,
      constructor: { score: 3, completed: 1, skipped: 0, updatedAt: 60 },
    },
  });

  assert.deepEqual(state, {
    version: 1,
    tracks: {
      valid: { score: 12, completed: 0, skipped: 4, updatedAt: 50 },
    },
  });
  assert.ok(adaptiveTrackWeight(state, 'valid') > 1);
});

test('outcome deltas match the Android model', () => {
  assert.equal(adaptiveOutcomeDelta('completed'), 2);
  assert.equal(adaptiveOutcomeDelta('early_skip'), -2);
  assert.equal(adaptiveOutcomeDelta('late_skip'), -1);
});

test('normalized state clamps to the widened range and weight stays bounded', () => {
  const state = normalizeAdaptiveTrackPriorityState({
    version: 1,
    tracks: {
      maxed: { score: 99, completed: 1, skipped: 0, updatedAt: 1 },
      minned: { score: -99, completed: 0, skipped: 1, updatedAt: 2 },
    },
  });
  assert.equal(state.tracks.maxed.score, 12);
  assert.equal(state.tracks.minned.score, -12);
  assert.equal(adaptiveTrackWeight(state, 'maxed'), 8);
  assert.equal(adaptiveTrackWeight(state, 'minned'), 0.125);
});
