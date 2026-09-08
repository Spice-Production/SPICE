const DEFAULT_MOVIE_PROVIDER_BASE_URL = 'https://vidsrc.sbs/';
const TMDB_MOVIE_ID_PATTERN = /^[1-9]\d{0,9}$/;

export function normalizeTmdbMovieId(value: unknown) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return TMDB_MOVIE_ID_PATTERN.test(normalized) ? normalized : null;
}

export function getMovieProviderBaseUrl(
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
) {
  const fallback = new URL(DEFAULT_MOVIE_PROVIDER_BASE_URL);

  if (!configuredBaseUrl?.trim()) return fallback;

  try {
    const configured = new URL(configuredBaseUrl.trim());

    if (configured.protocol !== 'https:' || configured.username || configured.password) {
      return fallback;
    }

    configured.search = '';
    configured.hash = '';
    configured.pathname = `${configured.pathname.replace(/\/+$/, '')}/`;
    return configured;
  } catch {
    return fallback;
  }
}

export function buildMovieEmbedUrl(
  tmdbMovieId: unknown,
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
) {
  const normalizedId = normalizeTmdbMovieId(tmdbMovieId);
  if (!normalizedId) return null;

  return new URL(
    `embed/movie/${normalizedId}`,
    getMovieProviderBaseUrl(configuredBaseUrl),
  ).toString();
}

export function getMovieProviderHomeUrl(
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
) {
  return getMovieProviderBaseUrl(configuredBaseUrl).toString();
}

export interface StreamProvider {
  id: string;
  label: string;
  /** Full movie embed URL, or null when this provider cannot play movies. */
  movieUrl: (tmdbId: string) => string | null;
  /** Full series-episode embed URL, or null when unsupported. */
  tvUrl: (tmdbId: string, season: number, episode: number) => string | null;
}

const VIDLINK_BASE_URL = 'https://vidlink.pro';
const MOVIES_API_BASE_URL = 'https://moviesapi.to';

/**
 * Playable sources for the watch pages, in default order. VidSrc stays
 * first (proven live); VidLink aggregates multiple upstreams behind one
 * player; MoviesAPI is a second independent backend for movies. Every
 * entry builds URLs purely — the player switcher swaps iframe src with no
 * server round-trip. The SPICE_MOVIE_PROVIDER_BASE_URL override keeps
 * working by rehosting the VidSrc entry (same path shapes).
 */
export function streamProviders(
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
): StreamProvider[] {
  const vidsrc = (id: string, kind: 'movie' | 'tv', season?: number, episode?: number): string | null => {
    if (kind === 'movie') return buildMovieEmbedUrl(id, configuredBaseUrl);
    return buildShowEmbedUrl(id, season, episode, configuredBaseUrl);
  };
  return [
    {
      id: 'vidsrc',
      label: 'VidSrc',
      movieUrl: (id) => vidsrc(id, 'movie'),
      tvUrl: (id, season, episode) => vidsrc(id, 'tv', season, episode),
    },
    {
      id: 'vidlink',
      label: 'VidLink',
      movieUrl: (id) => {
        const clean = normalizeTmdbMovieId(id);
        return clean ? `${VIDLINK_BASE_URL}/movie/${clean}` : null;
      },
      tvUrl: (id, season, episode) => {
        const clean = normalizeTmdbMovieId(id);
        if (!clean || !normalizeSeasonEpisode(season) || !normalizeSeasonEpisode(episode)) return null;
        return `${VIDLINK_BASE_URL}/tv/${clean}/${season}/${episode}`;
      },
    },
    {
      id: 'moviesapi',
      label: 'MoviesAPI',
      movieUrl: (id) => {
        const clean = normalizeTmdbMovieId(id);
        return clean ? `${MOVIES_API_BASE_URL}/movie/${clean}` : null;
      },
      tvUrl: () => null,
    },
  ];
}

export const DEFAULT_STREAM_PROVIDER_ID = 'vidsrc';

const STREAM_PROVIDER_STORAGE_KEY = 'spice-stream-provider';

/** Remembered default source, shared by the players and the profile menu. */
export function loadPreferredProvider(defaultId: string): string {
  if (typeof window === 'undefined') return defaultId;
  try {
    return window.localStorage.getItem(STREAM_PROVIDER_STORAGE_KEY) || defaultId;
  } catch {
    return defaultId;
  }
}

export function savePreferredProvider(id: string): void {
  try {
    window.localStorage.setItem(STREAM_PROVIDER_STORAGE_KEY, id);
  } catch {
    /* private mode: the choice lasts this visit */
  }
}

export function streamProviderById(
  id: string | null | undefined,
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
): StreamProvider {
  const list = streamProviders(configuredBaseUrl);
  return list.find((p) => p.id === id) ?? list[0];
}

function normalizeSeasonEpisode(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 99) return null;
  return num;
}

/**
 * Series embed URL: provider path embed/tv/{id}/{season}/{episode}.
 * Season/episode must be sane positive integers; anything else refuses
 * rather than building a dead player URL.
 */
export function buildShowEmbedUrl(
  tmdbShowId: unknown,
  season: unknown,
  episode: unknown,
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
) {
  const normalizedId = normalizeTmdbMovieId(tmdbShowId);
  const normalizedSeason = normalizeSeasonEpisode(season);
  const normalizedEpisode = normalizeSeasonEpisode(episode);
  if (!normalizedId || !normalizedSeason || !normalizedEpisode) return null;

  return new URL(
    `embed/tv/${normalizedId}/${normalizedSeason}/${normalizedEpisode}`,
    getMovieProviderBaseUrl(configuredBaseUrl),
  ).toString();
}
