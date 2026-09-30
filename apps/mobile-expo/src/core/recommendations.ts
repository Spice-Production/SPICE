// Home feed seeds, ranking, taste affinity, and smart-queue continuation.
// Mirrors the Kotlin client (and the web app's shared affinity core) so every
// SPICE surface ranks with the same signals.

import type { FeedSection, Track } from './models.ts';

export type RecommendationSeed = { track: Track; query: string; label: string };
export type RecommendationBatch = { seed: RecommendationSeed; tracks: Track[] };

export function tasteKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function recommendationKey(track: Pick<Track, 'sourceId' | 'id'>): string {
  return `${tasteKey(track.sourceId)}:${track.id.trim()}`;
}

function sameTrack(first: Track, second: Track): boolean {
  return recommendationKey(first) === recommendationKey(second);
}

export function buildRecommendationSeeds(history: Track[], liked: Track[], limit = 3): RecommendationSeed[] {
  const seenArtists = new Set<string>();
  const seeds: RecommendationSeed[] = [];
  for (const track of [...history.slice(0, 12), ...liked.slice(0, 12)]) {
    if (seeds.length >= Math.max(limit, 0)) break;
    if (!track.title.trim()) continue;
    const artistKey = tasteKey(track.artist);
    if (!artistKey || artistKey === 'unknown artist' || seenArtists.has(artistKey)) continue;
    seenArtists.add(artistKey);
    seeds.push({
      track,
      query: [track.artist, track.album.trim() ? track.album : track.title, 'music'].filter((part) => part.trim()).join(' '),
      label: history.some((entry) => sameTrack(entry, track)) ? `Because you played ${track.title}` : 'Inspired by your likes',
    });
  }
  return seeds;
}

function countArtists(tracks: Track[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const track of tracks) {
    const key = tasteKey(track.artist);
    if (!key) continue;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return weights;
}

export function rankRecommendations(
  batches: RecommendationBatch[],
  history: Track[],
  liked: Track[],
  limit = 18,
  trackPriorityFor?: (key: string) => number,
): Track[] {
  const excluded = new Set(history.map(recommendationKey));
  const likedArtists = new Set(liked.map((track) => tasteKey(track.artist)));
  const historyArtistWeights = countArtists(history);
  const scored = new Map<string, [Track, number]>();
  let ordinal = 0;

  batches.forEach((batch, batchIndex) => {
    for (const track of batch.tracks) {
      const key = recommendationKey(track);
      if (excluded.has(key) || !track.title.trim()) continue;
      const artistKey = tasteKey(track.artist);
      const titleArtistKey = `${tasteKey(track.title)}|${artistKey}`;
      if (scored.has(titleArtistKey)) continue;
      const score =
        1_000 -
        ordinal -
        batchIndex * 8 +
        (historyArtistWeights.get(artistKey) ?? 0) * 18 +
        (likedArtists.has(artistKey) ? 42 : 0) +
        (track.sourceId === batch.seed.track.sourceId ? 4 : 0) +
        (trackPriorityFor?.(key) ?? 0) * 4;
      ordinal += 1;
      scored.set(titleArtistKey, [track, score]);
    }
  });

  const artistCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  return [...scored.values()]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry[1] - a.entry[1] || a.index - b.index)
    .map(({ entry }) => entry[0])
    .filter((track) => {
      const artistKey = tasteKey(track.artist);
      const artistCount = artistCounts.get(artistKey) ?? 0;
      const sourceCount = sourceCounts.get(track.sourceId) ?? 0;
      const keep = artistCount < 2 || sourceCount === 0;
      if (keep) {
        artistCounts.set(artistKey, artistCount + 1);
        sourceCounts.set(track.sourceId, sourceCount + 1);
      }
      return keep;
    })
    .slice(0, Math.max(limit, 0));
}

export function recommendationSections(
  batches: RecommendationBatch[],
  history: Track[],
  liked: Track[],
  trackPriorityFor?: (key: string) => number,
): FeedSection[] {
  if (batches.length === 0) return [];
  const recommended = rankRecommendations(batches, history, liked, 18, trackPriorityFor);
  const excluded = new Set(history.map(recommendationKey));
  const sections: FeedSection[] = [];
  if (recommended.length > 0) sections.push({ title: 'Recommended Next', tracks: recommended });
  for (const batch of batches.slice(0, 2)) {
    const seen = new Set<string>();
    const tracks = batch.tracks
      .filter((track) => !excluded.has(recommendationKey(track)))
      .filter((track) => {
        const key = recommendationKey(track);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
    if (tracks.length > 0) sections.push({ title: batch.seed.label, tracks });
  }
  return sections;
}

export const AFFINITY_RECENT_DAMP = 0.25;
export const AFFINITY_SEARCH_POSITION_DECAY = 0.06;
export const AFFINITY_SEARCH_BOOST = 0.35;

export type TasteContext = {
  historyArtistWeights: Map<string, number>;
  likedArtistKeys: Set<string>;
  likedTrackKeys: Set<string>;
  recentTrackKeys: Set<string>;
  trackPriorityFor: (key: string) => number;
};

export function tasteContext(history: Track[], liked: Track[], trackPriorityFor: (key: string) => number): TasteContext {
  return {
    historyArtistWeights: countArtists(history),
    likedArtistKeys: new Set(liked.map((track) => tasteKey(track.artist))),
    likedTrackKeys: new Set(liked.map(recommendationKey)),
    recentTrackKeys: new Set(history.slice(0, 6).map(recommendationKey)),
    trackPriorityFor,
  };
}

export function tasteAffinity(track: Track, context: TasteContext): number {
  const artistKey = tasteKey(track.artist);
  const key = recommendationKey(track);
  let personalization = (Math.min(context.historyArtistWeights.get(artistKey) ?? 0, 8) / 8) * 0.6;
  if (context.likedArtistKeys.has(artistKey)) personalization += 0.25;
  personalization = Math.min(Math.max(personalization, 0), 1);
  const adaptive = Math.min(Math.max(Math.min(Math.max(context.trackPriorityFor(key), -12), 12) / 12, -1), 1);
  // A track this profile keeps skipping scales down artist-level
  // generalization for that specific track instead of merely subtracting.
  const shaped = adaptive < 0 ? personalization * (1 + adaptive) : personalization;
  const likedBoost = context.likedTrackKeys.has(key) ? 0.35 : 0;
  const recentDamp = context.recentTrackKeys.has(key) ? -AFFINITY_RECENT_DAMP : 0;
  return Math.min(Math.max(shaped + likedBoost + adaptive * 0.3 + recentDamp, -1), 1);
}

/** Provider order stays the relevance signal; real affinity may lift a track a few places. */
export function reorderTracksByTaste(tracks: Track[], context: TasteContext): Track[] {
  if (tracks.length < 2) return tracks;
  if (context.historyArtistWeights.size === 0 && context.likedTrackKeys.size === 0) return tracks;
  return tracks
    .map((track, index) => ({
      index,
      score: Math.max(0, 1 - index * AFFINITY_SEARCH_POSITION_DECAY) + tasteAffinity(track, context) * AFFINITY_SEARCH_BOOST,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index }) => tracks[index]!);
}

export function smartQueueCandidates(sections: FeedSection[], currentQueue: Track[], limit = 20): Track[] {
  const excluded = new Set(currentQueue.map(recommendationKey));
  const artistCounts = new Map<string, number>();
  const seen = new Set<string>();
  const ordered = [...sections]
    .map((section, index) => ({ section, index }))
    .sort((a, b) => (a.section.title === 'Recommended Next' ? 0 : 1) - (b.section.title === 'Recommended Next' ? 0 : 1) || a.index - b.index)
    .flatMap(({ section }) => section.tracks);
  const result: Track[] = [];
  for (const track of ordered) {
    if (result.length >= Math.max(limit, 0)) break;
    const key = recommendationKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    if (excluded.has(key)) continue;
    const artistKey = tasteKey(track.artist);
    const count = artistCounts.get(artistKey) ?? 0;
    if (count >= 2) continue;
    artistCounts.set(artistKey, count + 1);
    result.push(track);
  }
  return result;
}
