export interface SmartQueueArtist {
  id?: string;
  name?: string;
}

export interface SmartQueueTrack {
  id: string;
  sourceId?: string;
  artists?: readonly SmartQueueArtist[];
  smartQueueScore?: number;
}

export interface SmartQueueOptions<TTrack extends SmartQueueTrack> {
  limit?: number;
  recentTrackKeys?: ReadonlySet<string> | readonly string[];
  recentArtistKeys?: ReadonlySet<string> | readonly string[];
  likedTrackIds?: ReadonlySet<string> | readonly string[];
  likedBoost?: number;
  recentArtistPenalty?: number;
  sourceDiversityPenalty?: number;
  artistDiversityPenalty?: number;
  getBaseScore?: (track: TTrack) => number;
}

export const DEFAULT_SMART_QUEUE_LIMIT = 50;
export const DEFAULT_LIKED_BOOST = 12;
export const DEFAULT_RECENT_ARTIST_PENALTY = 10;
export const DEFAULT_SOURCE_DIVERSITY_PENALTY = 6;
export const DEFAULT_ARTIST_DIVERSITY_PENALTY = 9;

const finiteNonNegative = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, value as number) : fallback;

const normalizedSet = (values: ReadonlySet<string> | readonly string[] | undefined) =>
  new Set(Array.from(values ?? [], (value) => value.trim().toLocaleLowerCase()).filter(Boolean));

const normalizedSourceId = (track: SmartQueueTrack) =>
  track.sourceId?.trim().toLocaleLowerCase() || 'youtube_music';

export function smartQueueTrackKey(track: SmartQueueTrack) {
  return `${normalizedSourceId(track)}:${track.id.trim()}`.toLocaleLowerCase();
}

export function smartQueueArtistKeys(track: SmartQueueTrack) {
  const keys = (track.artists ?? [])
    .map((artist) => artist.id?.trim() || artist.name?.trim() || '')
    .map((value) => value.toLocaleLowerCase())
    .filter(Boolean);
  return [...new Set(keys)];
}

interface IndexedCandidate<TTrack> {
  track: TTrack;
  index: number;
  trackKey: string;
  sourceId: string;
  artistKeys: string[];
}

/**
 * Greedily selects a deterministic smart queue. Exact recent tracks and
 * duplicate candidates are removed; diversity penalties are recalculated
 * after every selection so equally ranked sources and artists interleave.
 */
export function buildSmartQueue<TTrack extends SmartQueueTrack>(
  candidates: readonly TTrack[],
  options: SmartQueueOptions<TTrack> = {},
): TTrack[] {
  const limit = Math.max(
    0,
    Math.floor(finiteNonNegative(options.limit, DEFAULT_SMART_QUEUE_LIMIT)),
  );
  if (limit === 0) return [];

  const recentTracks = normalizedSet(options.recentTrackKeys);
  const recentArtists = normalizedSet(options.recentArtistKeys);
  const likedTrackIds = normalizedSet(options.likedTrackIds);
  const likedBoost = finiteNonNegative(options.likedBoost, DEFAULT_LIKED_BOOST);
  const recentArtistPenalty = finiteNonNegative(
    options.recentArtistPenalty,
    DEFAULT_RECENT_ARTIST_PENALTY,
  );
  const sourceDiversityPenalty = finiteNonNegative(
    options.sourceDiversityPenalty,
    DEFAULT_SOURCE_DIVERSITY_PENALTY,
  );
  const artistDiversityPenalty = finiteNonNegative(
    options.artistDiversityPenalty,
    DEFAULT_ARTIST_DIVERSITY_PENALTY,
  );

  const seenTracks = new Set<string>();
  const remaining: IndexedCandidate<TTrack>[] = [];
  candidates.forEach((track, index) => {
    if (!track.id?.trim()) return;
    const trackKey = smartQueueTrackKey(track);
    const plainId = track.id.trim().toLocaleLowerCase();
    if (seenTracks.has(trackKey) || recentTracks.has(trackKey) || recentTracks.has(plainId)) return;
    seenTracks.add(trackKey);
    remaining.push({
      track,
      index,
      trackKey,
      sourceId: normalizedSourceId(track),
      artistKeys: smartQueueArtistKeys(track),
    });
  });

  const selected: TTrack[] = [];
  const sourceCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestOriginalIndex = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const rawBaseScore = options.getBaseScore
        ? options.getBaseScore(candidate.track)
        : candidate.track.smartQueueScore;
      const baseScore = Number.isFinite(rawBaseScore) ? rawBaseScore as number : 0;
      const liked = likedTrackIds.has(candidate.track.id.trim().toLocaleLowerCase())
        || likedTrackIds.has(candidate.trackKey);
      const repeatsRecentArtist = candidate.artistKeys.some((key) => recentArtists.has(key));
      const selectedArtistCount = candidate.artistKeys.reduce(
        (highest, key) => Math.max(highest, artistCounts.get(key) ?? 0),
        0,
      );
      const score = baseScore
        + (liked ? likedBoost : 0)
        - (repeatsRecentArtist ? recentArtistPenalty : 0)
        - (sourceCounts.get(candidate.sourceId) ?? 0) * sourceDiversityPenalty
        - selectedArtistCount * artistDiversityPenalty;

      if (score > bestScore || (score === bestScore && candidate.index < bestOriginalIndex)) {
        bestIndex = index;
        bestScore = score;
        bestOriginalIndex = candidate.index;
      }
    });

    const [next] = remaining.splice(bestIndex, 1);
    selected.push(next.track);
    sourceCounts.set(next.sourceId, (sourceCounts.get(next.sourceId) ?? 0) + 1);
    next.artistKeys.forEach((key) => {
      artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    });
  }

  return selected;
}

/**
 * Re-orders a selected queue so consecutive tracks stay in a related mood:
 * each step picks the remaining track sharing the most topic keys with the
 * current one. The track set is unchanged — only the flow is smoothed.
 */
export function sequenceTracksByMoodFlow<TTrack>(
  tracks: readonly TTrack[],
  topicKeysFor: (track: TTrack) => readonly string[],
): TTrack[] {
  if (tracks.length < 3) return [...tracks];

  const topics = tracks.map((track) => topicKeysFor(track).filter(Boolean));
  const used = new Set<number>();
  const ordered: TTrack[] = [];
  let currentTopics = new Set<string>();

  let nextIndex = 0;
  for (let round = 0; round < tracks.length; round += 1) {
    if (nextIndex >= 0) {
      used.add(nextIndex);
      ordered.push(tracks[nextIndex]);
      currentTopics = new Set(topics[nextIndex]);
    }

    let bestIndex = -1;
    let bestOverlap = -1;
    for (let index = 0; index < tracks.length; index += 1) {
      if (used.has(index)) continue;
      const overlap = topics[index].reduce(
        (count, key) => count + (currentTopics.has(key) ? 1 : 0),
        0,
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = index;
      }
    }
    nextIndex = bestIndex;
  }

  return ordered;
}
