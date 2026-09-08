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
