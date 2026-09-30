// Queue, shuffle, and crossfade rules shared with the native playback service.
// The service runs the same rules while it owns the queue in the background.

import { queueKey, type Track } from './models.ts';

export const MIN_TRACK_PRIORITY = -12;
export const MAX_TRACK_PRIORITY = 12;
export const MAX_CROSSFADE_DURATION_MS = 12_000;
export const MAX_PLAYBACK_HISTORY_ENTRIES = 512;
export const CROSSFADE_OPTIONS_MS = [0, 3_000, 5_000, 8_000, 12_000] as const;

export type TrackFeedback = 'Completed' | 'EarlySkip' | 'LateSkip';

export function trackFeedbackForManualDeparture(positionMs: number, durationMs: number): TrackFeedback {
  if (durationMs <= 0) return 'EarlySkip';
  const listenedFraction = Math.max(0, positionMs) / durationMs;
  return positionMs < 30_000 || listenedFraction < 0.5 ? 'EarlySkip' : 'LateSkip';
}

export function updatedTrackPriority(current: number, feedback: TrackFeedback): number {
  const delta = feedback === 'Completed' ? 2 : feedback === 'EarlySkip' ? -2 : -1;
  return Math.min(Math.max(current + delta, MIN_TRACK_PRIORITY), MAX_TRACK_PRIORITY);
}

export function trackShuffleWeight(priority: number): number {
  const clamped = Math.min(Math.max(priority, MIN_TRACK_PRIORITY), MAX_TRACK_PRIORITY);
  return Math.min(Math.max(2 ** (clamped / 4), 0.125), 8);
}

export function chooseWeightedQueueIndex(
  candidateIndices: number[],
  priorityForIndex: (index: number) => number,
  randomUnit: number,
): number | null {
  if (candidateIndices.length === 0) return null;
  const weighted = candidateIndices.map((index) => [index, trackShuffleWeight(priorityForIndex(index))] as const);
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return candidateIndices[0]!;
  let cursor = Math.min(Math.max(randomUnit, 0), 0.999999999999) * total;
  for (const [index, weight] of weighted) {
    cursor -= weight;
    if (cursor < 0) return index;
  }
  return weighted[weighted.length - 1]![0];
}

export type ShufflePlan = { queueIndex: number; startsNewRound: boolean };

/**
 * Neutral scores keep the familiar no-repeat round. Once listening feedback
 * makes scores differ, a round becomes `queueIndices.length` weighted draws.
 * The current item is always excluded so a favorite never repeats back to back.
 */
export function planShuffleQueueIndex(options: {
  queueIndices: number[];
  currentIndex: number;
  playedTrackKeys: ReadonlySet<string>;
  roundPlayCount: number;
  allowWrap: boolean;
  trackKeyForIndex: (index: number) => string;
  priorityForIndex: (index: number) => number;
  randomUnit: number;
}): ShufflePlan | null {
  const playable = options.queueIndices.filter((index) => index !== options.currentIndex);
  if (playable.length === 0) return null;
  const priorities = new Map(options.queueIndices.map((index) => [index, options.priorityForIndex(index)] as const));
  const adaptive = new Set(priorities.values()).size > 1;
  const freshNeutralChoices = playable.filter((index) => !options.playedTrackKeys.has(options.trackKeyForIndex(index)));
  const roundComplete = adaptive ? options.roundPlayCount >= options.queueIndices.length : freshNeutralChoices.length === 0;
  if (roundComplete && !options.allowWrap) return null;
  const choices = adaptive || roundComplete ? playable : freshNeutralChoices;
  const selected = chooseWeightedQueueIndex(choices, (index) => priorities.get(index) ?? 0, options.randomUnit);
  return selected === null ? null : { queueIndex: selected, startsNewRound: roundComplete };
}

export function playbackHistoryTarget(
  history: string[],
  cursor: number,
  step: number,
  availableTrackKeys: ReadonlySet<string>,
): [number, string] | null {
  let candidate = cursor + step;
  while (candidate >= 0 && candidate < history.length) {
    const key = history[candidate]!;
    if (availableTrackKeys.has(key)) return [candidate, key];
    candidate += step;
  }
  return null;
}

export function shouldResetShuffleRound(previousQueueKeys: string[], replacementQueueKeys: string[]): boolean {
  return (
    previousQueueKeys.length !== replacementQueueKeys.length ||
    previousQueueKeys.some((key, index) => key !== replacementQueueKeys[index])
  );
}

export function normalizePlaybackHistoryForQueue(
  history: string[],
  cursor: number,
  availableTrackKeys: ReadonlySet<string>,
): [string[], number] {
  const filtered: string[] = [];
  let filteredCursor = -1;
  history.forEach((key, index) => {
    if (!availableTrackKeys.has(key)) return;
    filtered.push(key);
    if (index <= cursor) filteredCursor = filtered.length - 1;
  });
  if (filtered.length === 0) return [[], -1];
  const anchor = filteredCursor >= 0 ? filteredCursor : filtered.length - 1;
  const start =
    filtered.length <= MAX_PLAYBACK_HISTORY_ENTRIES
      ? 0
      : Math.min(Math.max(anchor - MAX_PLAYBACK_HISTORY_ENTRIES / 2, 0), filtered.length - MAX_PLAYBACK_HISTORY_ENTRIES);
  const bounded = filtered.slice(start, start + MAX_PLAYBACK_HISTORY_ENTRIES);
  const boundedCursor = filteredCursor >= start ? Math.min(filteredCursor - start, bounded.length - 1) : -1;
  return [bounded, boundedCursor];
}

export function normalizeCrossfadeDurationMs(value: number): number {
  return Math.min(Math.max(value, 0), MAX_CROSSFADE_DURATION_MS);
}

export function shouldPrepareTransition(
  positionMs: number,
  durationMs: number,
  crossfadeDurationMs: number,
  hasNextTrack: boolean,
): boolean {
  const safe = normalizeCrossfadeDurationMs(crossfadeDurationMs);
  if (!hasNextTrack || safe <= 0 || durationMs <= 0) return false;
  const remaining = Math.max(durationMs - positionMs, 0);
  return remaining >= 1 && remaining <= safe + 15_000;
}

export function shouldStartTransition(
  positionMs: number,
  durationMs: number,
  crossfadeDurationMs: number,
  prepared: boolean,
): boolean {
  const safe = normalizeCrossfadeDurationMs(crossfadeDurationMs);
  if (!prepared || safe <= 0 || durationMs <= 0) return false;
  const remaining = Math.max(durationMs - positionMs, 0);
  return remaining >= 1 && remaining <= safe;
}

export function effectiveCrossfadeDurationMs(configuredDurationMs: number, outgoingRemainingMs: number): number | null {
  const duration = Math.min(normalizeCrossfadeDurationMs(configuredDurationMs), Math.max(outgoingRemainingMs, 0));
  return duration >= 250 ? duration : null;
}

export function shouldRestartTrackForPrevious(positionMs: number): boolean {
  return positionMs > 3_000;
}

export function shouldTreatSeekAsSkip(currentPositionMs: number, targetPositionMs: number, durationMs: number): boolean {
  return durationMs > 0 && targetPositionMs - currentPositionMs >= 1_000 && targetPositionMs >= durationMs - 3_000;
}

export function resolveQueueSelectionIndex(queue: Track[], selected: Track, requestedIndex?: number | null): number {
  if (
    requestedIndex !== undefined &&
    requestedIndex !== null &&
    requestedIndex >= 0 &&
    requestedIndex < queue.length &&
    queue[requestedIndex]!.sourceId === selected.sourceId &&
    queue[requestedIndex]!.id === selected.id
  ) {
    return requestedIndex;
  }
  const index = queue.findIndex((track) => track.sourceId === selected.sourceId && track.id === selected.id);
  return index >= 0 ? index : 0;
}

export function normalizeQueue(queue: Track[], selected: Track): Track[] {
  const normalized = (queue.length > 0 ? queue : [selected]).filter((track) => track.id.trim() !== '');
  const selectedKey = queueKey(selected);
  return normalized.some((track) => queueKey(track) === selectedKey) ? normalized : [selected, ...normalized];
}

export function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, itemIndex) => (itemIndex === index ? item : existing));
}

export function nextRepeatMode(mode: 'Off' | 'All' | 'One'): 'Off' | 'All' | 'One' {
  return mode === 'Off' ? 'All' : mode === 'All' ? 'One' : 'Off';
}
