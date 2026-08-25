export const RECOMMENDATION_ARTIST_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SnoozedRecommendationArtist {
  key: string;
  label: string;
  until: number;
}

export interface DiscoveryWin {
  key: string;
  label: string;
  wins: number;
  at: number;
}

export interface RecommendationPreferences {
  discoveryLevel: number;
  hiddenTrackKeys: string[];
  dislikedTrackKeys: string[];
  snoozedArtists: SnoozedRecommendationArtist[];
  /** Artists the listener discovered through recommendations and then liked. */
  discoveryWins: DiscoveryWin[];
}

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  discoveryLevel: 60,
  hiddenTrackKeys: [],
  dislikedTrackKeys: [],
  snoozedArtists: [],
  discoveryWins: [],
};

export interface PreferenceTrack {
  id: string;
  sourceId?: string;
  artists?: readonly { id?: string; name?: string }[];
}

export const recommendationArtistKey = (artist: { id?: string; name?: string }) => (
  (artist.id || artist.name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
);

export const recommendationTrackKey = (track: PreferenceTrack) => (
  `${track.sourceId || 'youtube_music'}:${track.id}`.trim().toLocaleLowerCase()
);

export function normalizeRecommendationPreferences(
  value: unknown,
  now = Date.now(),
): RecommendationPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_RECOMMENDATION_PREFERENCES };
  const input = value as Partial<RecommendationPreferences>;
  const discoveryLevel = Number(input.discoveryLevel);
  const hiddenTrackKeys = Array.isArray(input.hiddenTrackKeys)
    ? [...new Set(input.hiddenTrackKeys.filter((key): key is string => typeof key === 'string' && Boolean(key.trim())).map((key) => key.trim().toLocaleLowerCase()))].slice(0, 500)
    : [];
  const dislikedTrackKeys = Array.isArray(input.dislikedTrackKeys)
    ? [...new Set(input.dislikedTrackKeys.filter((key): key is string => typeof key === 'string' && Boolean(key.trim())).map((key) => key.trim().toLocaleLowerCase()))].slice(0, 500)
    : [];
  const snoozedArtists = Array.isArray(input.snoozedArtists)
    ? input.snoozedArtists.flatMap((artist) => {
      if (!artist || typeof artist !== 'object') return [];
      const key = typeof artist.key === 'string' ? artist.key.trim().toLocaleLowerCase() : '';
      const label = typeof artist.label === 'string' ? artist.label.trim() : '';
      const until = Number(artist.until);
      return key && label && Number.isFinite(until) && until > now
        ? [{ key, label, until }]
        : [];
    }).slice(0, 100)
    : [];
  const discoveryWins = Array.isArray(input.discoveryWins)
    ? input.discoveryWins.flatMap((win) => {
      if (!win || typeof win !== 'object') return [];
      const key = typeof win.key === 'string' ? win.key.trim().toLocaleLowerCase() : '';
      const label = typeof win.label === 'string' ? win.label.trim() : '';
      const wins = Number(win.wins);
      const at = Number(win.at);
      return key && label && Number.isFinite(wins) && wins > 0 && Number.isFinite(at)
        ? [{ key, label, wins: Math.min(50, Math.trunc(wins)), at: Math.max(0, Math.trunc(at)) }]
        : [];
    }).slice(0, 100)
    : [];
  return {
    discoveryLevel: Number.isFinite(discoveryLevel)
      ? Math.max(0, Math.min(100, Math.round(discoveryLevel)))
      : DEFAULT_RECOMMENDATION_PREFERENCES.discoveryLevel,
    hiddenTrackKeys,
    dislikedTrackKeys,
    snoozedArtists,
    discoveryWins,
  };
}

export function hideRecommendedTrack(
  preferences: RecommendationPreferences,
  track: PreferenceTrack,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  return normalizeRecommendationPreferences({
    ...normalized,
    hiddenTrackKeys: [recommendationTrackKey(track), ...normalized.hiddenTrackKeys],
  }, now);
}

/** A dislike is the strongest per-track negative: the track stops appearing
 * in recommendations entirely (stronger than hide, which only removes one
 * entry) and any ranking path treats it as hard-rejected. */
export function dislikeRecommendedTrack(
  preferences: RecommendationPreferences,
  track: PreferenceTrack,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  const key = recommendationTrackKey(track);
  return normalizeRecommendationPreferences({
    ...normalized,
    dislikedTrackKeys: [key, ...normalized.dislikedTrackKeys],
    hiddenTrackKeys: normalized.hiddenTrackKeys.filter((entry) => entry !== key),
  }, now);
}

export function removeDislikedTrack(
  preferences: RecommendationPreferences,
  track: PreferenceTrack,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  const key = recommendationTrackKey(track);
  return normalizeRecommendationPreferences({
    ...normalized,
    dislikedTrackKeys: normalized.dislikedTrackKeys.filter((entry) => entry !== key),
  }, now);
}

export function isRecommendationDisliked(
  track: PreferenceTrack,
  preferences: RecommendationPreferences,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  return normalized.dislikedTrackKeys.includes(recommendationTrackKey(track));
}

/** Credits a discovery win: the listener liked something by an artist they
 * barely knew, so that artist's future finds surface a little more. */
export function recordDiscoveryWin(
  preferences: RecommendationPreferences,
  artist: { id?: string; name?: string },
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  const key = recommendationArtistKey(artist);
  const label = artist.name?.trim() || artist.id?.trim() || 'Artist';
  if (!key) return normalized;
  const existing = normalized.discoveryWins.find((win) => win.key === key);
  return normalizeRecommendationPreferences({
    ...normalized,
    discoveryWins: [
      { key, label, wins: (existing?.wins ?? 0) + 1, at: now },
      ...normalized.discoveryWins.filter((win) => win.key !== key),
    ].slice(0, 100),
  }, now);
}

export function discoveryWinBoost(
  track: PreferenceTrack,
  preferences: RecommendationPreferences,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  if (normalized.discoveryWins.length === 0) return 0;
  const trackArtistKeys = new Set((track.artists || []).map((artist) => recommendationArtistKey(artist)));
  let best = 0;
  for (const win of normalized.discoveryWins) {
    if (!trackArtistKeys.has(win.key)) continue;
    best = Math.max(best, Math.min(1, win.wins / 5));
  }
  return best * 0.1;
}

export function snoozeRecommendedArtist(
  preferences: RecommendationPreferences,
  artist: { id?: string; name?: string },
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  const key = recommendationArtistKey(artist);
  const label = artist.name?.trim() || artist.id?.trim() || 'Artist';
  if (!key) return normalized;
  return normalizeRecommendationPreferences({
    ...normalized,
    snoozedArtists: [
      { key, label, until: now + RECOMMENDATION_ARTIST_SNOOZE_MS },
      ...normalized.snoozedArtists.filter((entry) => entry.key !== key),
    ],
  }, now);
}

export function isRecommendationHidden(
  track: PreferenceTrack,
  preferences: RecommendationPreferences,
  now = Date.now(),
) {
  const normalized = normalizeRecommendationPreferences(preferences, now);
  if (normalized.hiddenTrackKeys.includes(recommendationTrackKey(track))) return true;
  if (normalized.dislikedTrackKeys.includes(recommendationTrackKey(track))) return true;
  const snoozedKeys = new Set(normalized.snoozedArtists.map((artist) => artist.key));
  return (track.artists || []).some((artist) => snoozedKeys.has(recommendationArtistKey(artist)));
}

export function recommendationPreferenceScoreAdjustment({
  knownTrack,
  discoveryLevel,
}: {
  knownTrack: boolean;
  discoveryLevel: number;
}) {
  const normalizedLevel = Math.max(0, Math.min(100, discoveryLevel));
  return knownTrack
    ? (50 - normalizedLevel) * 0.12
    : normalizedLevel * 0.02;
}
