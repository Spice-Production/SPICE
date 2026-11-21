const DEFAULT_MOVIE_PROVIDER_BASE_URL = 'https://vidsrc.me/';
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
  sandboxed: boolean;
  /** Full movie embed URL, or null when this provider cannot play movies. */
  movieUrl: (tmdbId: string) => string | null;
  /** Full series-episode embed URL, or null when unsupported. */
  tvUrl: (tmdbId: string, season: number, episode: number) => string | null;
}

/**
 * Strict iframe sandbox applied to every video embed: permits scripts,
 * same-origin media/DRM requests, forms, and fullscreen presentation while
 * blocking popups (`allow-popups`), new-tab escapes, and top-level redirects
 * (`allow-top-navigation`).
 */
export const PLAYER_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation';

const VIDZEE_BASE_URL = 'https://player.vidzee.wtf';
const VIDPRIME_BASE_URL = 'https://vidprime.top';

function hasValidCustomBaseUrl(configuredBaseUrl?: string): boolean {
  if (!configuredBaseUrl?.trim()) return false;
  try {
    const parsed = new URL(configuredBaseUrl.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Playable sources verified to work inside `PLAYER_IFRAME_SANDBOX` with no
 * popup/redirect escape hatches. VidZee leads (movies, TV, and anime);
 * VidPrime is an independent sandbox-safe fallback. When
 * `SPICE_MOVIE_PROVIDER_BASE_URL` is explicitly configured to a valid HTTPS
 * origin, a `Custom` entry (`id: 'vidsrc'`) is appended.
 */
export function streamProviders(
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
): StreamProvider[] {
  const providers: StreamProvider[] = [
    {
      id: 'vidzee',
      label: 'VidZee',
      sandboxed: true,
      movieUrl: (id) => {
        const clean = normalizeTmdbMovieId(id);
        return clean ? `${VIDZEE_BASE_URL}/embed/movie/${clean}` : null;
      },
      tvUrl: (id, season, episode) => {
        const clean = normalizeTmdbMovieId(id);
        if (!clean || !normalizeSeasonEpisode(season) || !normalizeSeasonEpisode(episode)) return null;
        return `${VIDZEE_BASE_URL}/embed/tv/${clean}/${season}/${episode}`;
      },
    },
    {
      id: 'vidprime',
      label: 'VidPrime',
      sandboxed: true,
      movieUrl: (id) => {
        const clean = normalizeTmdbMovieId(id);
        return clean ? `${VIDPRIME_BASE_URL}/movie/${clean}` : null;
      },
      tvUrl: (id, season, episode) => {
        const clean = normalizeTmdbMovieId(id);
        if (!clean || !normalizeSeasonEpisode(season) || !normalizeSeasonEpisode(episode)) return null;
        return `${VIDPRIME_BASE_URL}/tv/${clean}/${season}/${episode}`;
      },
    },
  ];

  if (hasValidCustomBaseUrl(configuredBaseUrl)) {
    providers.push({
      id: 'vidsrc',
      label: 'Custom',
      sandboxed: true,
      movieUrl: (id) => buildMovieEmbedUrl(id, configuredBaseUrl),
      tvUrl: (id, season, episode) => buildShowEmbedUrl(id, season, episode, configuredBaseUrl),
    });
  }

  return providers;
}

export function allowedEmbedFrameOrigins(
  configuredBaseUrl = process.env.SPICE_MOVIE_PROVIDER_BASE_URL,
): string[] {
  const origins = [VIDZEE_BASE_URL, VIDPRIME_BASE_URL];
  if (hasValidCustomBaseUrl(configuredBaseUrl)) {
    const customOrigin = getMovieProviderBaseUrl(configuredBaseUrl).origin;
    if (!origins.includes(customOrigin)) origins.push(customOrigin);
  }
  return origins;
}

export const DEFAULT_STREAM_PROVIDER_ID = 'vidzee';

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
