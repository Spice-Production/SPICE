import {
  LISTENING_INSIGHTS_WINDOW_MS,
  type ListeningEvent,
} from './listening-insights.ts';
import {
  personalizationTrackScore,
  trackKey,
  type RecommendationTrack,
  type TasteProfile,
} from './recommendations.ts';

// Contextual listening helpers: when you listen, what you keep replaying, and
// which unfamiliar tracks sit closest to your established taste.

export type ListeningTimeBucket = 'morning' | 'afternoon' | 'evening' | 'lateNight';

export interface ListeningTimeBucketSummary {
  bucket: ListeningTimeBucket;
  eventCount: number;
  topArtist: string | null;
}

export interface ListeningTimeProfile {
  buckets: Record<ListeningTimeBucket, ListeningTimeBucketSummary>;
  /** The bucket this listener uses most, when it has enough evidence. */
  dominant: ListeningTimeBucket | null;
  /** The bucket `now` falls into. */
  current: ListeningTimeBucket;
}

export const LISTENING_TIME_BUCKET_LABELS: Record<ListeningTimeBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  lateNight: 'Late Night',
};

export const LISTENING_TIME_BUCKET_QUERIES: Record<ListeningTimeBucket, string> = {
  morning: 'morning acoustic feel good songs',
  afternoon: 'afternoon easy listening hits',
  evening: 'evening chill sunset songs',
  lateNight: 'late night ambient calm songs',
};

export const LISTENING_TIME_MIN_BUCKET_EVENTS = 4;

export function listeningBucketForHour(hour: number): ListeningTimeBucket {
  const safeHour = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 12;
  if (safeHour >= 5 && safeHour < 12) return 'morning';
  if (safeHour >= 12 && safeHour < 18) return 'afternoon';
  if (safeHour >= 18 && safeHour < 23) return 'evening';
  return 'lateNight';
}

const emptyBucket = (bucket: ListeningTimeBucket): ListeningTimeBucketSummary => ({
  bucket,
  eventCount: 0,
  topArtist: null,
});

export function buildListeningTimeProfile(
  events: readonly ListeningEvent[],
  now = Date.now(),
): ListeningTimeProfile {
  const buckets: Record<ListeningTimeBucket, ListeningTimeBucketSummary> = {
    morning: emptyBucket('morning'),
    afternoon: emptyBucket('afternoon'),
    evening: emptyBucket('evening'),
    lateNight: emptyBucket('lateNight'),
  };
  const artistCounts: Record<ListeningTimeBucket, Map<string, number>> = {
    morning: new Map(),
    afternoon: new Map(),
    evening: new Map(),
    lateNight: new Map(),
  };

  const date = new Date(now);
  const current = listeningBucketForHour(
    Number.isFinite(date.getTime()) ? date.getHours() : 12,
  );

  for (const event of events) {
    if (!event || !Number.isFinite(event.completedAt)) continue;
    const bucket = listeningBucketForHour(new Date(event.completedAt).getHours());
    buckets[bucket].eventCount += 1;
    const counts = artistCounts[bucket];
    for (const artist of event.artistNames ?? []) {
      const name = artist?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  for (const summary of Object.values(buckets)) {
    let bestArtist: string | null = null;
    let bestCount = 0;
    for (const [name, count] of artistCounts[summary.bucket]) {
      if (count > bestCount || (count === bestCount && bestArtist && name.localeCompare(bestArtist) < 0)) {
        bestArtist = name;
        bestCount = count;
      }
    }
    summary.topArtist = bestCount >= 2 ? bestArtist : null;
  }

  let dominant: ListeningTimeBucket | null = null;
  let dominantCount = LISTENING_TIME_MIN_BUCKET_EVENTS - 1;
  for (const summary of Object.values(buckets)) {
    if (summary.eventCount > dominantCount) {
      dominant = summary.bucket;
      dominantCount = summary.eventCount;
    }
  }

  return { buckets, dominant, current };
}

export interface OnRepeatTrack {
  key: string;
  title: string;
  artists: string[];
  sourceId: string;
  trackId: string;
  listens: number;
  listenedMs: number;
  lastCompletedAt: number;
}

export const ON_REPEAT_WINDOW_MS = LISTENING_INSIGHTS_WINDOW_MS;
export const ON_REPEAT_MIN_LISTENS = 2;
export const ON_REPEAT_LIMIT = 8;

export function buildOnRepeatTracks(
  events: readonly ListeningEvent[],
  options: { now?: number; limit?: number; minListens?: number } = {},
): OnRepeatTrack[] {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, options.limit ?? ON_REPEAT_LIMIT);
  const minListens = Math.max(1, options.minListens ?? ON_REPEAT_MIN_LISTENS);
  const cutoff = now - ON_REPEAT_WINDOW_MS;

  const aggregated = new Map<string, OnRepeatTrack>();
  for (const event of events) {
    if (!event || !Number.isFinite(event.completedAt) || event.completedAt < cutoff) continue;
    const key = `${event.sourceId}:${event.trackId}`.toLocaleLowerCase();
    const existing = aggregated.get(key);
    if (!existing) {
      aggregated.set(key, {
        key,
        title: event.title,
        artists: [...(event.artistNames ?? [])],
        sourceId: event.sourceId,
        trackId: event.trackId,
        listens: 1,
        listenedMs: Math.max(0, event.listenedMs),
        lastCompletedAt: event.completedAt,
      });
      continue;
    }
    existing.listens += 1;
    existing.listenedMs += Math.max(0, event.listenedMs);
    existing.lastCompletedAt = Math.max(existing.lastCompletedAt, event.completedAt);
    if (!existing.artists.length && (event.artistNames ?? []).length) {
      existing.artists = [...event.artistNames];
    }
  }

  return Array.from(aggregated.values())
    .filter((entry) => entry.listens >= minListens)
    .sort((left, right) => (
      right.listenedMs - left.listenedMs
      || right.listens - left.listens
      || right.lastCompletedAt - left.lastCompletedAt
    ))
    .slice(0, limit);
}

const dayStamp = (now: number) => new Date(now).toISOString().slice(0, 10);

const deterministicHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
};

export const FRESH_FIND_MIN_SCORE = 0.5;
export const FRESH_FIND_LIMIT = 8;

/**
 * Exploration lane: unfamiliar artists whose sound still matches this
 * profile's topics. Artists the listener already discovered and liked through
 * recommendations surface first; the rest rotates deterministically per day
 * so the shelf feels fresh without being random per render.
 */
export function pickFreshFindTracks<TTrack extends RecommendationTrack>(
  candidates: readonly TTrack[],
  profile: TasteProfile,
  options: {
    now?: number;
    limit?: number;
    /** Artist keys with prior discovery wins; their candidates lead the shelf. */
    winningArtistKeys?: ReadonlySet<string>;
  } = {},
): TTrack[] {
  if (!profile?.isReady) return [];
  const now = options.now ?? Date.now();
  const limit = Math.max(1, options.limit ?? FRESH_FIND_LIMIT);
  const daySeed = dayStamp(now);
  const knownArtistKeys = new Set(
    profile.artists.map((signal) => signal.id.trim().toLowerCase()),
  );
  const winningArtistKeys = options.winningArtistKeys;

  const eligible = candidates.filter((track) => {
    if (!track?.id || track.id === 'placeholder' || track.previewOnly) return false;
    const artists = track.artists ?? [];
    if (artists.length === 0) return false;
    const unfamiliar = artists.every((artist) => {
      const key = (artist.id || artist.name || '').trim().toLowerCase();
      return key.length > 0 && !knownArtistKeys.has(key);
    });
    if (!unfamiliar) return false;
    return personalizationTrackScore(track, profile) >= FRESH_FIND_MIN_SCORE;
  });

  const scored = eligible.map((track) => {
    const winBoost = winningArtistKeys && winningArtistKeys.size > 0
      ? (track.artists ?? []).some((artist) => winningArtistKeys.has((artist.id || artist.name || '').trim().toLowerCase()))
        ? 1
        : 0
      : 0;
    return {
      track,
      winBoost,
      order: deterministicHash(`${daySeed}:${trackKey(track)}`),
    };
  });

  return scored
    .sort((left, right) => (
      right.winBoost - left.winBoost
      || left.order - right.order
    ))
    .slice(0, limit)
    .map((entry) => entry.track);
}
