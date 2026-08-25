export type AdaptiveListenOutcome = 'completed' | 'early_skip' | 'late_skip';

export interface AdaptiveTrackPriorityEntry {
  score: number;
  completed: number;
  skipped: number;
  updatedAt: number;
}

export interface AdaptiveTrackPriorityState {
  version: 1;
  tracks: Record<string, AdaptiveTrackPriorityEntry>;
}

export interface AdaptiveListenObservation {
  completedNaturally: boolean;
  /** Playback position when the track was left, in milliseconds. */
  positionMs?: number;
  /** Full track duration in milliseconds, when known. */
  durationMs?: number;
}

export interface AdaptiveSeekObservation {
  positionMs: number;
  seekPositionMs: number;
  durationMs: number;
}

const STATE_VERSION = 1 as const;
const MIN_SCORE = -12;
const MAX_SCORE = 12;
const MIN_WEIGHT = 0.125;
const MAX_WEIGHT = 8;
const MAX_TRACKS = 2_000;
const MAX_COUNTER = 1_000_000;
const COMPLETION_SEEK_WINDOW_MS = 3_000;
const MIN_FORWARD_SEEK_MS = 1_000;
// Parity with the Android client: abandoning a track before 30 seconds or
// before half of it has played is an early skip and counts double.
const EARLY_SKIP_POSITION_MS = 30_000;
const EARLY_SKIP_FRACTION = 0.5;
const COMPLETION_DELTA = 2;
const EARLY_SKIP_DELTA = -2;
const LATE_SKIP_DELTA = -1;

export const EMPTY_ADAPTIVE_TRACK_PRIORITY_STATE: AdaptiveTrackPriorityState = Object.freeze({
  version: STATE_VERSION,
  tracks: Object.freeze({}),
});

const finiteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boundedInteger = (value: unknown, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Math.trunc(finiteNumber(value, minimum))))
);

const safeTrackKey = (value: unknown) => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key || key.length > 512 || key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return '';
  }
  return key;
};

export function normalizeAdaptiveTrackPriorityState(value: unknown): AdaptiveTrackPriorityState {
  if (!value || typeof value !== 'object') return EMPTY_ADAPTIVE_TRACK_PRIORITY_STATE;
  const rawTracks = (value as Partial<AdaptiveTrackPriorityState>).tracks;
  if (!rawTracks || typeof rawTracks !== 'object' || Array.isArray(rawTracks)) {
    return EMPTY_ADAPTIVE_TRACK_PRIORITY_STATE;
  }

  const entries = Object.entries(rawTracks)
    .map(([rawKey, rawEntry]) => {
      const key = safeTrackKey(rawKey);
      if (!key || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
      const entry = rawEntry as Partial<AdaptiveTrackPriorityEntry>;
      return [key, {
        score: boundedInteger(entry.score, MIN_SCORE, MAX_SCORE),
        completed: boundedInteger(entry.completed, 0, MAX_COUNTER),
        skipped: boundedInteger(entry.skipped, 0, MAX_COUNTER),
        updatedAt: Math.max(0, Math.trunc(finiteNumber(entry.updatedAt))),
      }] as const;
    })
    .filter((entry): entry is readonly [string, AdaptiveTrackPriorityEntry] => entry !== null)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_TRACKS);

  return {
    version: STATE_VERSION,
    tracks: Object.fromEntries(entries),
  };
}

export function classifyAdaptiveListen(observation: AdaptiveListenObservation): AdaptiveListenOutcome {
  if (observation.completedNaturally) return 'completed';
  const positionMs = finiteNumber(observation.positionMs);
  const durationMs = finiteNumber(observation.durationMs);
  const early = positionMs > 0 && (
    positionMs < EARLY_SKIP_POSITION_MS
    || (durationMs > 0 && positionMs / durationMs < EARLY_SKIP_FRACTION)
  );
  return early ? 'early_skip' : 'late_skip';
}

export function adaptiveOutcomeDelta(outcome: AdaptiveListenOutcome) {
  if (outcome === 'completed') return COMPLETION_DELTA;
  if (outcome === 'early_skip') return EARLY_SKIP_DELTA;
  return LATE_SKIP_DELTA;
}

export function shouldTreatAdaptiveSeekAsSkip(observation: AdaptiveSeekObservation) {
  const positionMs = finiteNumber(observation.positionMs);
  const seekPositionMs = finiteNumber(observation.seekPositionMs);
  const durationMs = finiteNumber(observation.durationMs);
  return durationMs > 0
    && seekPositionMs - positionMs >= MIN_FORWARD_SEEK_MS
    && durationMs - seekPositionMs <= COMPLETION_SEEK_WINDOW_MS;
}

export function recordAdaptiveListenOutcome(
  value: unknown,
  rawTrackKey: string,
  outcome: AdaptiveListenOutcome,
  now = Date.now(),
): AdaptiveTrackPriorityState {
  const state = normalizeAdaptiveTrackPriorityState(value);
  const trackKey = safeTrackKey(rawTrackKey);
  if (!trackKey || (outcome !== 'completed' && outcome !== 'early_skip' && outcome !== 'late_skip')) return state;

  const previous = state.tracks[trackKey] || {
    score: 0,
    completed: 0,
    skipped: 0,
    updatedAt: 0,
  };
  const completed = outcome === 'completed';
  const nextEntry: AdaptiveTrackPriorityEntry = {
    score: Math.max(MIN_SCORE, Math.min(MAX_SCORE, previous.score + adaptiveOutcomeDelta(outcome))),
    completed: Math.min(MAX_COUNTER, previous.completed + (completed ? 1 : 0)),
    skipped: Math.min(MAX_COUNTER, previous.skipped + (completed ? 0 : 1)),
    updatedAt: Math.max(0, Math.trunc(finiteNumber(now, Date.now()))),
  };

  return normalizeAdaptiveTrackPriorityState({
    version: STATE_VERSION,
    tracks: {
      ...state.tracks,
      [trackKey]: nextEntry,
    },
  });
}

export function adaptiveTrackWeight(value: unknown, rawTrackKey: string) {
  const state = normalizeAdaptiveTrackPriorityState(value);
  const trackKey = safeTrackKey(rawTrackKey);
  const score = trackKey ? state.tracks[trackKey]?.score ?? 0 : 0;
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, 2 ** (score / 4)));
}

export function adaptiveTrackWeights(value: unknown, trackKeys: string[]) {
  const state = normalizeAdaptiveTrackPriorityState(value);
  return trackKeys.map((trackKey) => {
    const key = safeTrackKey(trackKey);
    const score = key ? state.tracks[key]?.score ?? 0 : 0;
    return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, 2 ** (score / 4)));
  });
}
