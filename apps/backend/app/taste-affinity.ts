import {
  personalizationTrackScore,
  trackKey,
  type RecommendationTrack,
  type TasteProfile,
} from './recommendations.ts';
import {
  discoveryWinBoost,
  isRecommendationHidden,
  recommendationPreferenceScoreAdjustment,
  type PreferenceTrack,
  type RecommendationPreferences,
} from './recommendation-preferences.ts';

// The shared affinity core: one 0..1 "how much will this profile enjoy this
// track" score that every surface (home shelves, search ordering, Smart Mix,
// radio) consumes so taste feels coherent across the app.

export interface TasteAffinityContext {
  profile: TasteProfile;
  preferences?: RecommendationPreferences | null;
  /** Per-track adaptive scores (-8..8) learned from completions and skips. */
  adaptiveScores?: ReadonlyMap<string, number> | Record<string, number>;
  likedTrackKeys?: ReadonlySet<string>;
  /** Tracks played very recently; strongly matching them again is dampened. */
  recentTrackKeys?: ReadonlySet<string>;
  /** trackKey -> how many taste-neighbors keep this track (collaborative signal). */
  collaborativeScores?: ReadonlyMap<string, number> | Record<string, number>;
  now?: number;
}

export const AFFINITY_SEARCH_POSITION_DECAY = 0.06;
export const AFFINITY_SEARCH_BOOST = 0.35;
export const AFFINITY_SMART_QUEUE_SCALE = 15;
export const AFFINITY_FOR_YOU_MIN_SCORE = 0.15;
export const AFFINITY_FOR_YOU_FALLBACK_LIMIT = 8;
export const AFFINITY_COLLABORATIVE_MAX = 0.15;
export const AFFINITY_COLLABORATIVE_SATURATION_COUNT = 40;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const readAdaptiveScore = (
  source: TasteAffinityContext['adaptiveScores'],
  key: string,
) => {
  if (!source) return 0;
  const value = typeof (source as ReadonlyMap<string, number>).get === 'function'
    ? (source as ReadonlyMap<string, number>).get(key)
    : (source as Record<string, number>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

export function trackAffinityScore<TTrack extends RecommendationTrack>(
  track: TTrack,
  context: TasteAffinityContext,
): number {
  if (!track?.id || track.id === 'placeholder') return -1;

  const { profile } = context;
  const preferences = context.preferences ?? null;
  const key = trackKey(track);

  if (preferences && isRecommendationHidden(track, preferences, context.now)) {
    return -1;
  }

  const personalizationBase = clamp(
    personalizationTrackScore(track, profile) / 3,
    -0.6,
    1,
  );

  const adaptiveRaw = clamp(readAdaptiveScore(context.adaptiveScores, key) / 8, -1, 1);
  // A track this profile keeps skipping is direct evidence against it: the
  // negative adaptive score scales down artist-level generalization for that
  // specific track instead of merely subtracting a little.
  const personalization = personalizationBase
    * (adaptiveRaw < 0 ? 1 + adaptiveRaw : 1)
    * (0.55 + 0.45 * profile.confidence);

  const liked = context.likedTrackKeys?.has(key) ? 0.35 : 0;

  const adaptive = adaptiveRaw * 0.3;

  const collaborativeCount = readAdaptiveScore(context.collaborativeScores, key);
  const collaborative = collaborativeCount > 0
    ? Math.min(
      AFFINITY_COLLABORATIVE_MAX,
      (collaborativeCount / AFFINITY_COLLABORATIVE_SATURATION_COUNT) * AFFINITY_COLLABORATIVE_MAX,
    )
    : 0;

  // Discovery-success feedback: artists the listener found through
  // recommendations and then liked get a small lasting affinity lift.
  const discoveryBoost = preferences
    ? discoveryWinBoost(track as PreferenceTrack, preferences, context.now)
    : 0;

  const recentDamp = context.recentTrackKeys?.has(key) ? -0.25 : 0;

  const preferenceTerm = preferences
    ? clamp(recommendationPreferenceScoreAdjustment({
      knownTrack: profile.trackIds.has(key),
      discoveryLevel: preferences.discoveryLevel,
    }) * 0.04, -0.25, 0.25)
    : 0;

  return clamp(
    personalization + liked + adaptive + collaborative + discoveryBoost + recentDamp + preferenceTerm,
    -1,
    1,
  );
}

/**
 * Subtle search re-ranking: the provider order stays the relevance signal,
 * but tracks with real affinity for this profile may rise a few positions.
 * The boost is bounded so irrelevant matches can never float to the top.
 */
export function reorderTracksByTaste<TTrack extends RecommendationTrack>(
  tracks: TTrack[],
  context: TasteAffinityContext,
): TTrack[] {
  if (!context.profile?.isReady || tracks.length < 2) return tracks;

  const scored = tracks.map((track, index) => ({
    track,
    index,
    key: Math.max(0, 1 - index * AFFINITY_SEARCH_POSITION_DECAY)
      + trackAffinityScore(track, context) * AFFINITY_SEARCH_BOOST,
  }));

  return scored
    .sort((a, b) => b.key - a.key || a.index - b.index)
    .map((entry) => entry.track);
}

/**
 * The explicit "For you" filter: keeps only tracks with genuine affinity,
 * strongest first. Falls back to the best few when nothing clears the bar so
 * the shelf is never empty for an established profile.
 */
export function filterTracksForYou<TTrack extends RecommendationTrack>(
  tracks: TTrack[],
  context: TasteAffinityContext,
  options: { limit?: number } = {},
): TTrack[] {
  if (!context.profile?.isReady) return [];

  const limit = Math.max(1, options.limit ?? 30);
  const passing: { track: TTrack; index: number; score: number }[] = [];
  tracks.forEach((track, index) => {
    const score = trackAffinityScore(track, context);
    if (score >= AFFINITY_FOR_YOU_MIN_SCORE) passing.push({ track, index, score });
  });

  passing.sort((a, b) => b.score - a.score || a.index - b.index);
  if (passing.length >= 3) {
    return passing.slice(0, limit).map((entry) => entry.track);
  }

  return tracks
    .map((track, index) => ({ track, index, score: trackAffinityScore(track, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((entry) => entry.score > 0)
    .slice(0, Math.min(limit, AFFINITY_FOR_YOU_FALLBACK_LIMIT))
    .map((entry) => entry.track);
}

/** Base score hook for the smart queue's diversity-aware builder. */
export function smartQueueBaseScore<TTrack extends RecommendationTrack>(
  track: TTrack,
  context: TasteAffinityContext,
): number {
  return trackAffinityScore(track, context) * AFFINITY_SMART_QUEUE_SCALE;
}

export type AffinityPreferenceTrack = PreferenceTrack;
