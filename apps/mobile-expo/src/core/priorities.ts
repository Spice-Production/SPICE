// Adaptive shuffle priority payload: `[{ key, score }]`, newest last. Same
// format the Android engine stores and the taste sync exchanges.

import { MAX_TRACK_PRIORITY, MIN_TRACK_PRIORITY, updatedTrackPriority, type TrackFeedback } from './playback.ts';

export const MAX_TRACK_PRIORITY_ENTRIES = 2_000;
const MAX_TRACK_PRIORITY_KEY_LENGTH = 256;

function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_TRACK_PRIORITY_KEY_LENGTH;
}

function clamp(score: number): number {
  return Math.min(Math.max(Math.trunc(score), MIN_TRACK_PRIORITY), MAX_TRACK_PRIORITY);
}

export function parseTrackPriorities(payload: string): Map<string, number> {
  const parsed = new Map<string, number>();
  let entries: unknown;
  try {
    entries = JSON.parse(payload);
  } catch {
    return parsed;
  }
  if (!Array.isArray(entries)) return parsed;
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const { key, score } = item as { key?: unknown; score?: unknown };
    if (typeof key !== 'string' || typeof score !== 'number' || !Number.isFinite(score)) continue;
    const trimmed = key.trim();
    if (!isValidKey(trimmed)) continue;
    parsed.delete(trimmed);
    parsed.set(trimmed, clamp(score));
    while (parsed.size > MAX_TRACK_PRIORITY_ENTRIES) {
      parsed.delete(parsed.keys().next().value as string);
    }
  }
  return parsed;
}

export function encodeTrackPriorities(priorities: Map<string, number>): string {
  const entries = [...priorities].filter(([key]) => isValidKey(key)).slice(-MAX_TRACK_PRIORITY_ENTRIES);
  return JSON.stringify(entries.map(([key, score]) => ({ key, score: clamp(score) })));
}

export function updateTrackPriorityPayload(
  latestPayload: string,
  trackKey: string,
  feedback: TrackFeedback,
): { payload: string; updatedScore: number } {
  if (!isValidKey(trackKey)) return { payload: latestPayload, updatedScore: 0 };
  const priorities = parseTrackPriorities(latestPayload);
  const updatedScore = updatedTrackPriority(priorities.get(trackKey) ?? 0, feedback);
  priorities.delete(trackKey);
  priorities.set(trackKey, updatedScore);
  return { payload: encodeTrackPriorities(priorities), updatedScore };
}
