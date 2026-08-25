import {
  isRecommendationHidden,
  normalizeRecommendationPreferences,
  recommendationPreferenceScoreAdjustment,
  type RecommendationPreferences,
} from './recommendation-preferences.ts';

export interface RecommendationArtist {
  id?: string;
  name: string;
  artworkUrl?: string;
}

export interface RecommendationAlbum {
  id?: string;
  title: string;
  artists?: RecommendationArtist[];
  artworkUrl?: string;
  year?: number;
}

export interface RecommendationTrack {
  id: string;
  title: string;
  artists: RecommendationArtist[];
  album?: RecommendationAlbum;
  durationMs?: number;
  artworkUrl?: string;
  sourceId?: string;
  previewOnly?: boolean;
  msListened?: number;
}

export interface RecommendationPlaylist<TTrack extends RecommendationTrack = RecommendationTrack> {
  title?: string;
  description?: string;
  tracks: TTrack[];
}

export interface TasteSignal {
  id: string;
  label: string;
  score: number;
  count: number;
  positiveCount: number;
  negativeCount: number;
}

export interface TasteProfile {
  artists: TasteSignal[];
  producers: TasteSignal[];
  albums: TasteSignal[];
  topics: TasteSignal[];
  languages: TasteSignal[];
  trackIds: Set<string>;
  totalSignals: number;
  evidenceUnits: number;
  evidenceTrackCount: number;
  confidence: number;
  isReady: boolean;
  signalsNeeded: number;
}

export type RecommendationSeedKind =
  | 'artist'
  | 'producer'
  | 'album'
  | 'genre'
  | 'mood'
  | 'context'
  | 'language'
  | 'related';

export interface RecommendationSeed {
  id: string;
  label: string;
  query: string;
  reason: string;
  weight: number;
  kind: RecommendationSeedKind;
}

export interface SeededRecommendationResult<TTrack extends RecommendationTrack = RecommendationTrack> {
  seed: RecommendationSeed;
  tracks: TTrack[];
}

export interface RecommendationShelf<TTrack extends RecommendationTrack = RecommendationTrack> {
  seed: RecommendationSeed;
  tracks: TTrack[];
}

interface ScoreBucket {
  label: string;
  score: number;
  count: number;
  positiveCount: number;
  negativeCount: number;
}

interface TopicHint {
  id: string;
  label: string;
  query: string;
  kind: 'genre' | 'mood' | 'context';
  phrases?: string[];
  tokens?: string[];
}

interface LanguageHint {
  id: string;
  label: string;
  query: string;
  tokens: string[];
  minimumMatches: number;
}

export const MIN_TASTE_EVIDENCE_UNITS = 6;
export const MIN_TASTE_TRACKS = 3;
export const RECOMMENDATION_LISTEN_CREDIT_MS = 30_000;
export const MAX_RECOMMENDATION_LISTEN_MS = 600_000;

export function shouldAwaitPersonalizedContinuation(
  queueLength: number,
  queueIndex: number,
  isShuffle: boolean,
) {
  return queueLength === 1 || (!isShuffle && queueIndex >= queueLength - 1);
}

export function shouldRepeatPlaylistAtQueueTail(
  isPlaylistQueue: boolean,
  repeatMode: 'none' | 'all' | 'one',
) {
  return isPlaylistQueue && repeatMode === 'all';
}

export interface RecommendationListenProgress {
  trackKey: string;
  forwardSeconds: number;
  lastProgressSeconds: number;
  lastObservedAtMs: number;
}

export function beginRecommendationListenProgress(
  trackKey: string,
  progressSeconds: number,
  observedAtMs: number,
): RecommendationListenProgress {
  return {
    trackKey,
    forwardSeconds: 0,
    lastProgressSeconds: Math.max(0, progressSeconds),
    lastObservedAtMs: observedAtMs,
  };
}

export function resetRecommendationListenObservation(
  progress: RecommendationListenProgress | null,
  trackKey: string,
  progressSeconds: number,
  observedAtMs: number,
): RecommendationListenProgress {
  if (!progress || progress.trackKey !== trackKey) {
    return beginRecommendationListenProgress(trackKey, progressSeconds, observedAtMs);
  }
  return {
    ...progress,
    lastProgressSeconds: Math.max(0, progressSeconds),
    lastObservedAtMs: observedAtMs,
  };
}

export function recordRecommendationListenProgress(
  progress: RecommendationListenProgress | null,
  trackKey: string,
  progressSeconds: number,
  observedAtMs: number,
): RecommendationListenProgress {
  const baseline = resetRecommendationListenObservation(
    progress,
    trackKey,
    progressSeconds,
    observedAtMs,
  );
  if (!progress || progress.trackKey !== trackKey) return baseline;

  const elapsedSeconds = Math.max(0, (observedAtMs - progress.lastObservedAtMs) / 1000);
  const forwardDelta = Math.max(0, progressSeconds - progress.lastProgressSeconds);
  // A normal player may report sparse time updates, but an abrupt forward jump
  // is a seek and should not count as listening time.
  const naturalForwardDelta = forwardDelta <= Math.max(3, elapsedSeconds + 1.5)
    ? forwardDelta
    : 0;
  return {
    ...baseline,
    forwardSeconds: progress.forwardSeconds + naturalForwardDelta,
  };
}

const MAX_ARTIST_SEEDS = 2;
const MAX_PRODUCER_SEEDS = 1;
const MAX_ALBUM_SEEDS = 1;
const MAX_TOPIC_SEEDS = 2;
const MAX_LANGUAGE_SEEDS = 1;

const TOPIC_HINTS: TopicHint[] = [
  {
    id: 'hip-hop-rap',
    label: 'Hip-Hop & Rap',
    query: 'hip hop rap mix',
    kind: 'genre',
    phrases: ['hip hop', 'boom bap'],
    tokens: ['rap', 'rapper', 'trap', 'drill', 'freestyle'],
  },
  {
    id: 'pop',
    label: 'Pop',
    query: 'pop songs mix',
    kind: 'genre',
    phrases: ['dance pop', 'synth pop', 'synthpop'],
    tokens: ['pop'],
  },
  {
    id: 'rock-alternative',
    label: 'Rock & Alternative',
    query: 'rock alternative mix',
    kind: 'genre',
    phrases: ['indie rock', 'alt rock', 'hard rock'],
    tokens: ['rock', 'alternative', 'punk', 'grunge', 'metal', 'metalcore'],
  },
  {
    id: 'electronic',
    label: 'Electronic',
    query: 'electronic music mix',
    kind: 'genre',
    phrases: ['drum and bass', 'drum & bass', 'deep house'],
    tokens: ['edm', 'electronic', 'techno', 'house', 'trance', 'dubstep', 'dnb', 'hardstyle'],
  },
  {
    id: 'rnb-soul',
    label: 'R&B & Soul',
    query: 'rnb soul mix',
    kind: 'genre',
    phrases: ['r&b', 'neo soul'],
    tokens: ['rnb', 'soul'],
  },
  {
    id: 'jazz-blues',
    label: 'Jazz & Blues',
    query: 'jazz blues mix',
    kind: 'genre',
    tokens: ['jazz', 'blues', 'swing', 'bebop'],
  },
  {
    id: 'classical',
    label: 'Classical & Instrumental',
    query: 'classical instrumental music',
    kind: 'genre',
    phrases: ['classical music'],
    tokens: ['classical', 'orchestra', 'orchestral', 'symphony', 'piano', 'violin', 'instrumental'],
  },
  {
    id: 'country-folk',
    label: 'Country & Folk',
    query: 'country folk songs',
    kind: 'genre',
    tokens: ['country', 'folk', 'bluegrass', 'americana'],
  },
  {
    id: 'latin-reggaeton',
    label: 'Latin & Reggaeton',
    query: 'latin reggaeton mix',
    kind: 'genre',
    tokens: ['latin', 'reggaeton', 'bachata', 'salsa', 'dembow'],
  },
  {
    id: 'afrobeats-amapiano',
    label: 'Afrobeats & Amapiano',
    query: 'afrobeats amapiano mix',
    kind: 'genre',
    tokens: ['afrobeats', 'afrobeat', 'amapiano'],
  },
  {
    id: 'k-pop',
    label: 'K-Pop',
    query: 'k-pop songs mix',
    kind: 'genre',
    phrases: ['k pop', 'k-pop'],
    tokens: ['kpop'],
  },
  {
    id: 'j-pop-anime',
    label: 'J-Pop & Anime',
    query: 'j-pop anime songs mix',
    kind: 'genre',
    phrases: ['j pop', 'j-pop', 'anime opening', 'anime ending'],
    tokens: ['jpop', 'anime'],
  },
  {
    id: 'chill-focus',
    label: 'Chill & Focus',
    query: 'chill focus mix',
    kind: 'mood',
    phrases: ['lo fi', 'lo-fi'],
    tokens: ['lofi', 'chill', 'study', 'focus', 'ambient', 'calm', 'sleep', 'relax'],
  },
  {
    id: 'high-energy',
    label: 'High Energy',
    query: 'high energy workout music',
    kind: 'mood',
    phrases: ['high energy'],
    tokens: ['workout', 'gym', 'energy', 'power', 'motivation', 'hype'],
  },
  {
    id: 'melancholy',
    label: 'Melancholy',
    query: 'melancholy emotional songs',
    kind: 'mood',
    phrases: ['heart break'],
    tokens: ['sad', 'heartbreak', 'emotional', 'lonely', 'rainy', 'cry'],
  },
  {
    id: 'romantic',
    label: 'Romantic',
    query: 'romantic love songs mix',
    kind: 'mood',
    tokens: ['romantic', 'romance', 'love', 'lover'],
  },
  {
    id: 'party-dance',
    label: 'Party & Dance',
    query: 'party dance club mix',
    kind: 'context',
    tokens: ['party', 'dance', 'club', 'festival', 'rave'],
  },
  {
    id: 'gaming-cinematic',
    label: 'Gaming & Cinematic',
    query: 'gaming cinematic music mix',
    kind: 'context',
    phrases: ['video game', 'game soundtrack', 'movie soundtrack'],
    tokens: ['gaming', 'cinematic', 'soundtrack', 'ost', 'epic'],
  },
];

const LANGUAGE_HINTS: LanguageHint[] = [
  {
    id: 'italian',
    label: 'Italian',
    query: 'italian songs',
    minimumMatches: 2,
    tokens: ['amore', 'bella', 'ciao', 'cuore', 'notte', 'sole', 'mare', 'vita', 'volare', 'ragazza', 'ragazzo', 'italiano', 'italiana', 'sempre', 'perche', 'canzone', 'musica', 'senza', 'dove', 'sono', 'sei', 'della'],
  },
  {
    id: 'spanish',
    label: 'Spanish',
    query: 'spanish songs',
    minimumMatches: 2,
    tokens: ['amor', 'corazon', 'noche', 'vida', 'baila', 'bailando', 'contigo', 'quiero', 'donde', 'para', 'porque', 'cancion', 'musica', 'eres', 'soy'],
  },
  {
    id: 'romanian',
    label: 'Romanian',
    query: 'romanian songs',
    minimumMatches: 2,
    tokens: ['iubire', 'inima', 'noapte', 'viata', 'dor', 'fata', 'baiat', 'roman', 'romania', 'acasa', 'lume', 'unde', 'sunt', 'esti'],
  },
  {
    id: 'french',
    label: 'French',
    query: 'french songs',
    minimumMatches: 2,
    tokens: ['amour', 'coeur', 'nuit', 'vie', 'bonjour', 'danse', 'avec', 'pourquoi', 'toujours', 'chanson', 'musique', 'sans', 'mon', 'tes'],
  },
  {
    id: 'korean',
    label: 'Korean',
    query: 'korean songs',
    minimumMatches: 1,
    tokens: ['kpop', 'k-pop', 'korean', 'hangul'],
  },
  {
    id: 'japanese',
    label: 'Japanese',
    query: 'japanese songs',
    minimumMatches: 1,
    tokens: ['jpop', 'j-pop', 'japanese', 'anime'],
  },
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeKey = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();

export const trackKey = (track: RecommendationTrack) =>
  `${track.sourceId ?? 'youtube_music'}:${track.id}`.toLocaleLowerCase();

const trackTitleArtistKey = (track: RecommendationTrack) =>
  normalizeKey(`${track.title} ${track.artists.map((artist) => artist.name).join(' ')}`);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const addScore = (
  buckets: Map<string, ScoreBucket>,
  id: string,
  label: string,
  score: number,
) => {
  if (!id || !label || !Number.isFinite(score) || score === 0) return;
  const existing = buckets.get(id);
  if (existing) {
    existing.score += score;
    existing.count += 1;
    existing.positiveCount += score > 0 ? 1 : 0;
    existing.negativeCount += score < 0 ? 1 : 0;
    return;
  }

  buckets.set(id, {
    label,
    score,
    count: 1,
    positiveCount: score > 0 ? 1 : 0,
    negativeCount: score < 0 ? 1 : 0,
  });
};

const sortedSignals = (buckets: Map<string, ScoreBucket>) =>
  Array.from(buckets.entries())
    .map(([id, bucket]) => ({ id, ...bucket, score: Math.max(0, bucket.score) }))
    .filter((signal) => signal.score > 0.15 && signal.positiveCount > 0)
    .sort((a, b) => b.score - a.score || b.positiveCount - a.positiveCount || a.label.localeCompare(b.label));

const evidenceText = (track: RecommendationTrack) => normalizeText([
  track.title,
  track.album?.title,
  ...track.artists.map((artist) => artist.name),
].filter(Boolean).join(' '));

const producerNamesForTrack = (track: RecommendationTrack) => {
  const names: string[] = [];
  const pattern = /\b(?:prod(?:uced)?\.?\s*(?:by)?|producer\s*:)\s+([^()[\]{}|;/]{2,60})/gi;
  for (const match of track.title.matchAll(pattern)) {
    const name = match[1]
      .split(/\s[-–—]\s|,?\s+(?:official|lyrics?|audio|video)\b/i)[0]
      .trim()
      .replace(/[.,:-]+$/, '');
    if (name.length >= 2) names.push(name);
  }
  return names;
};

const tokensForText = (text: string) =>
  new Set(text.split(/[^a-z0-9&-]+/).filter(Boolean));

const hintScore = (
  normalizedText: string,
  tokens: Set<string>,
  hint: Pick<TopicHint, 'phrases' | 'tokens'>,
) => {
  let score = 0;
  for (const phrase of hint.phrases ?? []) {
    if (normalizedText.includes(normalizeText(phrase))) score += 2;
  }
  for (const token of hint.tokens ?? []) {
    if (tokens.has(normalizeText(token))) score += 1;
  }
  return score;
};

const languageScore = (tokens: Set<string>, language: LanguageHint) =>
  language.tokens.reduce((score, token) => score + (tokens.has(normalizeText(token)) ? 1 : 0), 0);

const normalizedListenMs = (track: RecommendationTrack) => {
  if (track.msListened === undefined) return RECOMMENDATION_LISTEN_CREDIT_MS;
  if (!Number.isFinite(track.msListened)) return 0;
  return clamp(Math.round(track.msListened), 0, MAX_RECOMMENDATION_LISTEN_MS);
};

const stablePreferenceExists = (
  artists: TasteSignal[],
  producers: TasteSignal[],
  albums: TasteSignal[],
  topics: TasteSignal[],
  languages: TasteSignal[],
) => [
  ...artists,
  ...producers,
  ...albums,
  ...topics,
  ...languages,
].some((signal) => signal.positiveCount >= 2 || signal.score >= 4);

export function recommendationListenThresholdSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 30;
  if (durationSeconds <= 30) return Math.max(5, durationSeconds * 0.8);
  return clamp(durationSeconds * 0.25, 20, 45);
}

export function incrementRecommendationListenMs(currentValue: unknown) {
  const current = typeof currentValue === 'number' && Number.isFinite(currentValue)
    ? Math.max(0, Math.round(currentValue))
    : 0;
  return Math.min(MAX_RECOMMENDATION_LISTEN_MS, current + RECOMMENDATION_LISTEN_CREDIT_MS);
}

export interface TasteListeningEventInput {
  trackId: string;
  sourceId?: string;
  title?: string;
  artistNames?: string[];
  listenedMs?: number;
}

const readSkipScore = (
  skipSignal: { trackScores?: Record<string, number> | ReadonlyMap<string, number> } | null | undefined,
  key: string,
) => {
  const scores = skipSignal?.trackScores;
  if (!scores) return 0;
  const value = typeof (scores as ReadonlyMap<string, number>).get === 'function'
    ? (scores as ReadonlyMap<string, number>).get(key)
    : (scores as Record<string, number>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, -8, 8) : 0;
};

/**
 * Translates the adaptive skip/completion learning into a play-weight
 * multiplier: repeatedly skipped tracks contribute far less to taste (and
 * heavily skipped ones contribute explicit negative evidence), while tracks
 * that reliably get played through count slightly more.
 */
export function tasteSkipFactor(
  skipSignal: { trackScores?: Record<string, number> | ReadonlyMap<string, number> } | null | undefined,
  key: string,
) {
  const score = readSkipScore(skipSignal, key);
  if (score <= -4) return 0;
  if (score <= -2) return 0.35;
  if (score < 2) return 1;
  return 1.15;
}

export function buildPrivateTasteProfile<TTrack extends RecommendationTrack>({
  history,
  likedTracks,
  playlists,
  skipSignal,
  listeningEvents,
}: {
  history: TTrack[];
  likedTracks: TTrack[];
  playlists: RecommendationPlaylist<TTrack>[];
  /** Learned skip/completion scores that shape how strongly plays count. */
  skipSignal?: { trackScores?: Record<string, number> | ReadonlyMap<string, number> } | null;
  /** Longer-lived listening events (90-day retention) deepening artist signals. */
  listeningEvents?: TasteListeningEventInput[] | null;
}): TasteProfile {
  const artists = new Map<string, ScoreBucket>();
  const producers = new Map<string, ScoreBucket>();
  const albums = new Map<string, ScoreBucket>();
  const topics = new Map<string, ScoreBucket>();
  const languages = new Map<string, ScoreBucket>();
  const trackIds = new Set<string>();
  const evidenceTracks = new Set<string>();
  let totalSignals = 0;
  let evidenceUnits = 0;
  let evidenceEventCredits = 0;

  const collectTextSignals = (text: string, weight: number) => {
    const normalized = normalizeText(text);
    const tokens = tokensForText(normalized);

    for (const topic of TOPIC_HINTS) {
      const matches = hintScore(normalized, tokens, topic);
      if (matches > 0) addScore(topics, topic.id, topic.label, weight * matches * 0.72);
    }

    for (const language of LANGUAGE_HINTS) {
      const matches = languageScore(tokens, language);
      if (matches >= language.minimumMatches) {
        addScore(languages, language.id, language.label, weight * matches * 0.58);
      }
    }
  };

  const collect = (track: RecommendationTrack, weight: number) => {
    if (!track?.id || track.id === 'placeholder') return;
    const tKey = trackKey(track);
    trackIds.add(tKey);
    if (weight > 0) totalSignals += weight;

    for (const artist of track.artists || []) {
      const label = artist.name?.trim();
      if (!label) continue;
      addScore(artists, normalizeKey(artist.id || label), label, weight);
    }

    for (const producer of producerNamesForTrack(track)) {
      addScore(producers, normalizeKey(producer), producer, weight * 0.9);
    }

    const albumTitle = track.album?.title?.trim();
    if (albumTitle) {
      const albumArtist = track.album?.artists?.[0]?.name || track.artists?.[0]?.name || '';
      addScore(
        albums,
        normalizeKey(`${albumTitle} ${albumArtist}`),
        albumTitle,
        weight * 0.72,
      );
    }

    collectTextSignals(evidenceText(track), weight);
  };

  history.slice(0, 50).forEach((track, index) => {
    const listenMs = normalizedListenMs(track);
    if (listenMs <= 0) {
      collect(track, -0.16);
      return;
    }

    const repeatedListenStrength = Math.min(
      2.2,
      Math.log2(1 + listenMs / RECOMMENDATION_LISTEN_CREDIT_MS) * 0.72,
    );
    const recencyBonus = Math.max(0, 0.6 - index * 0.015);
    const skipFactor = tasteSkipFactor(skipSignal, trackKey(track));
    collect(track, (1 + repeatedListenStrength + recencyBonus) * skipFactor);
    evidenceTracks.add(trackKey(track));
    evidenceUnits += Math.min(2.5, 1 + repeatedListenStrength * 0.45);
  });

  listeningEvents?.slice(0, 400).forEach((event) => {
    if (!event?.trackId) return;
    const listenedMs = Number.isFinite(event.listenedMs) ? Math.max(0, Number(event.listenedMs)) : 0;
    if (listenedMs < RECOMMENDATION_LISTEN_CREDIT_MS) return;
    const artists = (event.artistNames ?? [])
      .map((name) => name?.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    collect(
      {
        id: event.trackId,
        sourceId: event.sourceId,
        title: event.title || '',
        artists,
      },
      Math.min(1.6, 0.55 + listenedMs / 240_000),
    );
    evidenceEventCredits = Math.min(4, evidenceEventCredits + 0.35);
  });
  evidenceUnits += evidenceEventCredits;

  likedTracks.forEach((track) => {
    if (!track?.id || track.id === 'placeholder') return;
    collect(track, 4.5);
    evidenceTracks.add(trackKey(track));
    evidenceUnits += 2;
  });

  playlists.forEach((playlist) => {
    const usefulTracks = playlist.tracks.filter((track) => track?.id && track.id !== 'placeholder');
    const trackWeight = clamp(8 / Math.max(1, usefulTracks.length), 0.28, 1.15);
    usefulTracks.forEach((track) => {
      collect(track, trackWeight);
      evidenceTracks.add(trackKey(track));
    });
    evidenceUnits += Math.min(3, usefulTracks.length * 0.25);

    const playlistText = `${playlist.title ?? ''} ${playlist.description ?? ''}`.trim();
    if (playlistText) {
      collectTextSignals(playlistText, Math.min(3.2, 1.4 + usefulTracks.length * 0.08));
    }
  });

  const artistSignals = sortedSignals(artists);
  const producerSignals = sortedSignals(producers);
  const albumSignals = sortedSignals(albums);
  const topicSignals = sortedSignals(topics);
  const languageSignals = sortedSignals(languages);
  const stablePreference = stablePreferenceExists(
    artistSignals,
    producerSignals,
    albumSignals,
    topicSignals,
    languageSignals,
  );
  const roundedEvidence = Math.round(evidenceUnits * 10) / 10;
  const signalsNeeded = Math.max(
    stablePreference ? 0 : 1,
    Math.ceil(MIN_TASTE_EVIDENCE_UNITS - roundedEvidence),
  );
  const isReady = evidenceTracks.size >= MIN_TASTE_TRACKS
    && roundedEvidence >= MIN_TASTE_EVIDENCE_UNITS
    && stablePreference;
  const confidence = isReady
    ? clamp(0.35 + (roundedEvidence - MIN_TASTE_EVIDENCE_UNITS) / 24, 0.35, 1)
    : clamp(roundedEvidence / 24, 0, 0.3);

  return {
    artists: artistSignals,
    producers: producerSignals,
    albums: albumSignals,
    topics: topicSignals,
    languages: languageSignals,
    trackIds,
    totalSignals,
    evidenceUnits: roundedEvidence,
    evidenceTrackCount: evidenceTracks.size,
    confidence,
    isReady,
    signalsNeeded,
  };
}

export function buildRecommendationSeeds(
  profile: TasteProfile,
  maxSeeds = 4,
): RecommendationSeed[] {
  if (!profile.isReady || maxSeeds <= 0) return [];

  const candidates: RecommendationSeed[] = [];
  for (const artist of profile.artists.slice(0, 6)) {
    if (artist.positiveCount < 2 && artist.score < 4) continue;
    candidates.push({
      id: `artist:${artist.id}`,
      kind: 'artist',
      label: `More like ${artist.label}`,
      query: `${artist.label} songs radio`,
      reason: `${artist.label} keeps showing up across this profile's meaningful plays, likes, or playlists.`,
      weight: artist.score * profile.confidence,
    });
  }

  for (const producer of profile.producers.slice(0, 4)) {
    if (producer.positiveCount < 2 && producer.score < 4) continue;
    candidates.push({
      id: `producer:${producer.id}`,
      kind: 'producer',
      label: `Produced by ${producer.label}`,
      query: `${producer.label} produced songs`,
      reason: `${producer.label}'s production credits recur across this profile's established taste.`,
      weight: producer.score * 0.88 * profile.confidence,
    });
  }

  for (const album of profile.albums.slice(0, 4)) {
    if (album.positiveCount < 2 && album.score < 4) continue;
    candidates.push({
      id: `album:${album.id}`,
      kind: 'album',
      label: `From the world of ${album.label}`,
      query: `${album.label} album similar songs`,
      reason: `This profile returns to ${album.label} and closely related tracks.`,
      weight: album.score * 0.9 * profile.confidence,
    });
  }

  for (const topic of profile.topics.slice(0, 6)) {
    if (topic.positiveCount < 2 && topic.score < 3) continue;
    const hint = TOPIC_HINTS.find((entry) => entry.id === topic.id);
    if (!hint) continue;
    candidates.push({
      id: `${hint.kind}:${topic.id}`,
      kind: hint.kind,
      label: `Your ${topic.label} mix`,
      query: hint.query,
      reason: `${topic.label} appears consistently in this profile's listening and playlist context.`,
      weight: topic.score * 0.92 * profile.confidence,
    });
  }

  for (const language of profile.languages.slice(0, 4)) {
    if (language.positiveCount < 2 && language.score < 3.5) continue;
    const hint = LANGUAGE_HINTS.find((entry) => entry.id === language.id);
    if (!hint) continue;
    candidates.push({
      id: `language:${language.id}`,
      kind: 'language',
      label: `${language.label} discoveries`,
      query: hint.query,
      reason: `${language.label} tracks recur across this profile's established taste.`,
      weight: language.score * 0.8 * profile.confidence,
    });
  }

  const kindCounts = new Map<RecommendationSeedKind, number>();
  const seenQueries = new Set<string>();
  const selected: RecommendationSeed[] = [];
  const kindLimit = (kind: RecommendationSeedKind) => {
    if (kind === 'artist') return MAX_ARTIST_SEEDS;
    if (kind === 'producer') return MAX_PRODUCER_SEEDS;
    if (kind === 'album') return MAX_ALBUM_SEEDS;
    if (kind === 'language') return MAX_LANGUAGE_SEEDS;
    return MAX_TOPIC_SEEDS;
  };

  for (const seed of candidates.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))) {
    if (selected.length >= maxSeeds) break;
    const queryKey = normalizeKey(seed.query);
    if (!queryKey || seenQueries.has(queryKey)) continue;
    if ((kindCounts.get(seed.kind) ?? 0) >= kindLimit(seed.kind)) continue;
    seenQueries.add(queryKey);
    kindCounts.set(seed.kind, (kindCounts.get(seed.kind) ?? 0) + 1);
    selected.push(seed);
  }

  return selected;
}

export function createRelatedRecommendationSeed(track: RecommendationTrack): RecommendationSeed {
  const artist = track.artists?.[0]?.name?.trim();
  const subject = artist || track.title;
  return {
    id: `related:${trackKey(track)}`,
    kind: 'related',
    label: `Because you played ${track.title}`,
    query: `${subject} similar songs`,
    reason: `Related to the current track, then balanced against this profile's longer-term taste.`,
    weight: 8,
  };
}

const signalMap = (signals: TasteSignal[]) =>
  new Map(signals.map((signal) => [signal.id, signal.score]));

/** Topic ids matched by a track's text — the mood-flow sequencing signal. */
export function trackTopicKeys(track: RecommendationTrack): string[] {
  const text = evidenceText({
    id: track?.id ?? '',
    title: track?.title ?? '',
    artists: track?.artists ?? [],
  });
  const tokens = tokensForText(text);
  return TOPIC_HINTS
    .filter((topic) => hintScore(text, tokens, topic) > 0)
    .map((topic) => topic.id);
}

export function personalizationTrackScore(
  track: RecommendationTrack,
  profile: TasteProfile,
) {
  let score = 0;
  const artistScores = signalMap(profile.artists);
  const producerScores = signalMap(profile.producers);
  const albumScores = signalMap(profile.albums);
  const topicScores = signalMap(profile.topics);
  const languageScores = signalMap(profile.languages);

  for (const artist of track.artists || []) {
    score += (artistScores.get(normalizeKey(artist.id || artist.name)) || 0) * 0.72;
  }
  for (const producer of producerNamesForTrack(track)) {
    score += (producerScores.get(normalizeKey(producer)) || 0) * 0.62;
  }

  const albumTitle = track.album?.title?.trim();
  if (albumTitle) {
    const albumArtist = track.album?.artists?.[0]?.name || track.artists?.[0]?.name || '';
    score += (albumScores.get(normalizeKey(`${albumTitle} ${albumArtist}`)) || 0) * 0.5;
  }

  const text = evidenceText(track);
  const tokens = tokensForText(text);
  for (const topic of TOPIC_HINTS) {
    const matches = hintScore(text, tokens, topic);
    if (matches > 0) score += (topicScores.get(topic.id) || 0) * matches * 0.32;
  }
  for (const language of LANGUAGE_HINTS) {
    const matches = languageScore(tokens, language);
    if (matches >= language.minimumMatches) {
      score += (languageScores.get(language.id) || 0) * matches * 0.24;
    }
  }

  if (track.artworkUrl) score += 0.3;
  if (track.durationMs && track.durationMs >= 60_000 && track.durationMs <= 12 * 60_000) score += 0.35;
  if (track.durationMs && track.durationMs > 20 * 60_000) score -= 1.5;
  return score;
}

const deterministicTieBreak = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
};

export function rankRecommendedTracks<TTrack extends RecommendationTrack>(
  batches: SeededRecommendationResult<TTrack>[],
  profile: TasteProfile,
  options: {
    exclude?: RecommendationTrack[];
    limit?: number;
    includeKnown?: boolean;
    preferences?: RecommendationPreferences;
    now?: number;
    /** Optional shared affinity scorer (0..1) from the taste-affinity core. */
    affinity?: (track: TTrack) => number;
  } = {},
): TTrack[] {
  const preferences = options.preferences
    ? normalizeRecommendationPreferences(options.preferences, options.now)
    : null;
  const includeKnown = options.includeKnown === true
    || Boolean(preferences && preferences.discoveryLevel <= 25);
  const excludedIds = new Set(includeKnown ? [] : profile.trackIds);
  const excludedTitles = new Set<string>();
  for (const track of options.exclude || []) {
    excludedIds.add(trackKey(track));
    excludedTitles.add(trackTitleArtistKey(track));
  }

  const scored = new Map<string, {
    track: TTrack;
    score: number;
    seedIds: Set<string>;
    originalIndex: number;
  }>();
  let originalIndex = 0;

  for (const batch of batches) {
    batch.tracks.forEach((track, index) => {
      if (!track?.id || track.id === 'placeholder' || track.previewOnly) return;
      const idKey = trackKey(track);
      const titleKey = trackTitleArtistKey(track);
      if (preferences && isRecommendationHidden(track, preferences, options.now)) return;
      if (excludedIds.has(idKey) || excludedTitles.has(titleKey)) return;

      const providerOrderBonus = Math.max(0, 1.8 - index * 0.08);
      const seedScore = Math.log1p(Math.max(0, batch.seed.weight)) * 3.5;
      const explorationScale = preferences
        ? 0.15 + (preferences.discoveryLevel / 100) * 0.5
        : 0.45;
      const exploration = deterministicTieBreak(`${batch.seed.id}:${idKey}`) * explorationScale;
      const score = seedScore
        + providerOrderBonus
        + personalizationTrackScore(track, profile)
        + exploration
        + (options.affinity ? options.affinity(track) * 1.2 : 0)
        + (preferences ? recommendationPreferenceScoreAdjustment({
          knownTrack: profile.trackIds.has(idKey),
          discoveryLevel: preferences.discoveryLevel,
        }) : 0);
      const existing = scored.get(titleKey);
      if (!existing) {
        scored.set(titleKey, {
          track,
          score,
          seedIds: new Set([batch.seed.id]),
          originalIndex: originalIndex++,
        });
        return;
      }

      existing.seedIds.add(batch.seed.id);
      const shouldReplaceTrack = score > existing.score;
      existing.score = Math.max(existing.score, score) + 0.9;
      if (shouldReplaceTrack) existing.track = track;
    });
  }

  const remaining = Array.from(scored.values());
  const selected: TTrack[] = [];
  const artistCounts = new Map<string, number>();
  const seedCounts = new Map<string, number>();
  const limit = Math.max(0, options.limit ?? 12);

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestOriginalIndex = Number.POSITIVE_INFINITY;

    remaining.forEach((entry, index) => {
      const artistKeys = entry.track.artists.map((artist) => normalizeKey(artist.id || artist.name)).filter(Boolean);
      const repeatedArtistCount = artistKeys.reduce(
        (highest, key) => Math.max(highest, artistCounts.get(key) ?? 0),
        0,
      );
      const repeatedSeedCount = Array.from(entry.seedIds).reduce(
        (highest, key) => Math.max(highest, seedCounts.get(key) ?? 0),
        0,
      );
      const adjusted = entry.score - repeatedArtistCount * 3.2 - repeatedSeedCount * 0.7;
      if (adjusted > bestScore || (adjusted === bestScore && entry.originalIndex < bestOriginalIndex)) {
        bestIndex = index;
        bestScore = adjusted;
        bestOriginalIndex = entry.originalIndex;
      }
    });

    const [next] = remaining.splice(bestIndex, 1);
    selected.push(next.track);
    next.track.artists.forEach((artist) => {
      const key = normalizeKey(artist.id || artist.name);
      if (key) artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    });
    next.seedIds.forEach((seedId) => seedCounts.set(seedId, (seedCounts.get(seedId) ?? 0) + 1));
  }

  return selected;
}

export function buildRecommendationShelves<TTrack extends RecommendationTrack>(
  batches: SeededRecommendationResult<TTrack>[],
  profile: TasteProfile,
  options: {
    exclude?: RecommendationTrack[];
    limitPerShelf?: number;
    minimumTracks?: number;
    preferences?: RecommendationPreferences;
    now?: number;
  } = {},
): RecommendationShelf<TTrack>[] {
  const usedTracks = [...(options.exclude ?? [])];
  const shelves: RecommendationShelf<TTrack>[] = [];
  const limitPerShelf = options.limitPerShelf ?? 8;
  const minimumTracks = options.minimumTracks ?? 3;

  for (const batch of batches) {
    const tracks = rankRecommendedTracks([batch], profile, {
      exclude: usedTracks,
      limit: limitPerShelf,
      preferences: options.preferences,
      now: options.now,
    });
    if (tracks.length < minimumTracks) continue;
    shelves.push({ seed: batch.seed, tracks });
    usedTracks.push(...tracks);
  }

  return shelves;
}
