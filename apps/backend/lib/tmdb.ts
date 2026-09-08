/**
 * TMDB movie metadata for the Spice Movies revival.
 *
 * Search runs server-side so the API key never reaches the browser. The
 * key comes from `TMDB_API_KEY`; without it callers get a coded error they
 * can surface as setup guidance instead of a broken shelf.
 */

export interface TmdbMovieHit {
  tmdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

const TMDB_SEARCH_URL = 'https://api.themoviedb.org/3/search/movie';
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

const TMDB_BROWSE_PATHS = {
  trending: '/3/trending/movie/week',
  popular: '/3/movie/popular',
  top_rated: '/3/movie/top_rated',
} as const;

export type TmdbBrowseList = keyof typeof TMDB_BROWSE_PATHS;

export function tmdbApiKey(configured = process.env.TMDB_API_KEY): string | null {
  const key = configured?.trim();
  return key ? key : null;
}

interface TmdbSearchItem {
  id?: unknown;
  title?: unknown;
  release_date?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  overview?: unknown;
}

function toHit(item: TmdbSearchItem): TmdbMovieHit | null {
  const id = typeof item.id === 'number' && Number.isInteger(item.id) && item.id > 0
    ? String(item.id)
    : null;
  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null;
  if (!id || !title) return null;
  const release = typeof item.release_date === 'string' ? item.release_date : '';
  const year = /^\d{4}/.test(release) ? release.slice(0, 4) : null;
  const poster = typeof item.poster_path === 'string' && item.poster_path.startsWith('/')
    ? `${TMDB_POSTER_BASE}${item.poster_path}`
    : null;
  const backdrop = typeof item.backdrop_path === 'string' && item.backdrop_path.startsWith('/')
    ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}`
    : null;
  return {
    tmdbId: id,
    title,
    year,
    posterUrl: poster,
    backdropUrl: backdrop,
    overview: typeof item.overview === 'string' ? item.overview : '',
  };
}

export async function searchMovies(
  query: string,
  limit = 12,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbMovieHit[]> {
  const q = query?.trim();
  if (!q) throw new Error('missing q');
  if (!apiKey) {
    const err = new Error('TMDB_API_KEY is not configured.') as Error & { code?: string };
    err.code = 'tmdb_key_missing';
    throw err;
  }
  const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 12;
  const url = new URL(TMDB_SEARCH_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', q);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('page', '1');
  const res = await fetchFn(url.toString());
  if (!res.ok) throw new Error(`tmdb search failed (${res.status})`);
  const payload = (await res.json()) as { results?: TmdbSearchItem[] };
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.map(toHit).filter((hit): hit is TmdbMovieHit => hit !== null).slice(0, bounded);
}

function requireApiKey(apiKey: string | null): string {
  if (!apiKey) {
    const err = new Error('TMDB_API_KEY is not configured.') as Error & { code?: string };
    err.code = 'tmdb_key_missing';
    throw err;
  }
  return apiKey;
}

function boundLimit(limit: number, fallback: number): number {
  return Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : fallback;
}

async function fetchList<T>(
  path: string,
  params: Record<string, string>,
  limit: number,
  fetchFn: typeof fetch,
  apiKey: string | null,
  map: (items: TmdbSearchItem[]) => T[],
  failure: string,
): Promise<T[]> {
  const key = requireApiKey(apiKey);
  const url = new URL(`https://api.themoviedb.org${path}`);
  url.searchParams.set('api_key', key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const res = await fetchFn(url.toString());
  if (!res.ok) throw new Error(`${failure} (${res.status})`);
  const payload = (await res.json()) as { results?: TmdbSearchItem[] };
  const results = Array.isArray(payload.results) ? payload.results : [];
  return map(results).slice(0, boundLimit(limit, 12));
}

/**
 * Curated shelves for the browse page: trending this week, popular, and
 * top rated. Same hit shape as search so cards render identically.
 */
export async function browseMovies(
  list: TmdbBrowseList,
  limit = 12,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbMovieHit[]> {
  const key = requireApiKey(apiKey);
  const path = TMDB_BROWSE_PATHS[list];
  if (!path) throw new Error(`unknown browse list: ${String(list)}`);
  return fetchList(
    path,
    { include_adult: 'false', page: '1' },
    limit,
    fetchFn,
    key,
    (items) => items.map(toHit).filter((hit): hit is TmdbMovieHit => hit !== null),
    'tmdb browse failed',
  );
}

export interface TmdbMovieDetails extends TmdbMovieHit {
  runtimeMinutes: number | null;
  genres: string[];
  tagline: string | null;
}

/**
 * Full record for the watch page header: meta, backdrop, and credits-light
 * fields. Returns null for unknown ids instead of throwing.
 */
export async function getMovieDetails(
  tmdbId: string,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbMovieDetails | null> {
  const key = requireApiKey(apiKey);
  if (!/^[1-9]\d{0,9}$/.test(tmdbId)) return null;
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', key);
  const res = await fetchFn(url.toString());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tmdb details failed (${res.status})`);
  const item = (await res.json()) as TmdbSearchItem & {
    backdrop_path?: unknown;
    runtime?: unknown;
    genres?: unknown;
    tagline?: unknown;
  };
  const hit = toHit(item);
  if (!hit) return null;
  return {
    ...hit,
    runtimeMinutes: typeof item.runtime === 'number' && item.runtime > 0 ? Math.round(item.runtime) : null,
    genres: Array.isArray(item.genres)
      ? item.genres.filter((g): g is { name: string } => typeof g === 'object' && g !== null && typeof (g as { name?: unknown }).name === 'string').map((g) => (g as { name: string }).name).slice(0, 4)
      : [],
    tagline: typeof item.tagline === 'string' && item.tagline.trim() ? item.tagline.trim() : null,
  };
}

export interface TmdbShowHit {
  tmdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

interface TmdbShowItem {
  id?: unknown;
  name?: unknown;
  first_air_date?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  overview?: unknown;
}

function toShowHit(item: TmdbShowItem): TmdbShowHit | null {
  const id = typeof item.id === 'number' && Number.isInteger(item.id) && item.id > 0 ? String(item.id) : null;
  const title = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;
  if (!id || !title) return null;
  const aired = typeof item.first_air_date === 'string' ? item.first_air_date : '';
  return {
    tmdbId: id,
    title,
    year: /^\d{4}/.test(aired) ? aired.slice(0, 4) : null,
    posterUrl: typeof item.poster_path === 'string' && item.poster_path.startsWith('/') ? `${TMDB_POSTER_BASE}${item.poster_path}` : null,
    backdropUrl: typeof item.backdrop_path === 'string' && item.backdrop_path.startsWith('/') ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}` : null,
    overview: typeof item.overview === 'string' ? item.overview : '',
  };
}

const TMDB_SHOW_BROWSE_PATHS = {
  trending: '/3/trending/tv/week',
  popular: '/3/tv/popular',
  top_rated: '/3/tv/top_rated',
} as const;

export type TmdbShowBrowseList = keyof typeof TMDB_SHOW_BROWSE_PATHS;

/** Series search: same contract as movies, over /search/tv. */
export async function searchShows(
  query: string,
  limit = 12,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbShowHit[]> {
  const q = query?.trim();
  if (!q) throw new Error('missing q');
  return fetchList(
    '/3/search/tv',
    { query: q, include_adult: 'false', page: '1' },
    limit,
    fetchFn,
    apiKey,
    (items) => (items as TmdbShowItem[]).map(toShowHit).filter((hit): hit is TmdbShowHit => hit !== null),
    'tmdb show search failed',
  );
}

/** Curated series shelves for the shows browse page. */
export async function browseShows(
  list: TmdbShowBrowseList,
  limit = 12,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbShowHit[]> {
  const path = TMDB_SHOW_BROWSE_PATHS[list];
  if (!path) throw new Error(`unknown browse list: ${String(list)}`);
  return fetchList(
    path,
    { include_adult: 'false', page: '1' },
    limit,
    fetchFn,
    apiKey,
    (items) => (items as TmdbShowItem[]).map(toShowHit).filter((hit): hit is TmdbShowHit => hit !== null),
    'tmdb show browse failed',
  );
}

export interface TmdbSeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  overview: string;
}

export interface TmdbShowDetails extends TmdbShowHit {
  genres: string[];
  tagline: string | null;
  status: string | null;
  numberOfSeasons: number;
  seasons: TmdbSeasonSummary[];
}

/** Full series record with its season list for the picker. */
export async function getShowDetails(
  tmdbId: string,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbShowDetails | null> {
  const key = requireApiKey(apiKey);
  if (!/^[1-9]\d{0,9}$/.test(tmdbId)) return null;
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  url.searchParams.set('api_key', key);
  const res = await fetchFn(url.toString());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tmdb show details failed (${res.status})`);
  const item = (await res.json()) as TmdbShowItem & {
    genres?: unknown;
    tagline?: unknown;
    status?: unknown;
    number_of_seasons?: unknown;
    seasons?: unknown;
  };
  const hit = toShowHit(item);
  if (!hit) return null;
  const seasons = Array.isArray(item.seasons)
    ? item.seasons
      .filter((s): s is { season_number: number } => typeof s === 'object' && s !== null && Number.isInteger((s as { season_number?: unknown }).season_number))
      .map((s) => {
        const row = s as { season_number: number; name?: unknown; episode_count?: unknown; overview?: unknown };
        return {
          seasonNumber: row.season_number,
          name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Season ${row.season_number}`,
          episodeCount: typeof row.episode_count === 'number' && row.episode_count > 0 ? Math.trunc(row.episode_count) : 0,
          overview: typeof row.overview === 'string' ? row.overview : '',
        };
      })
      .filter((s) => s.seasonNumber > 0)
    : [];
  return {
    ...hit,
    genres: Array.isArray(item.genres)
      ? (item.genres as unknown[]).filter((g): g is { name: string } => typeof g === 'object' && g !== null && typeof (g as { name?: unknown }).name === 'string').map((g) => (g as { name: string }).name).slice(0, 4)
      : [],
    tagline: typeof item.tagline === 'string' && item.tagline.trim() ? item.tagline.trim() : null,
    status: typeof item.status === 'string' ? item.status : null,
    numberOfSeasons: typeof item.number_of_seasons === 'number' ? item.number_of_seasons : seasons.length,
    seasons,
  };
}

export interface TmdbEpisode {
  episodeNumber: number;
  name: string;
  overview: string;
  stillUrl: string | null;
  runtimeMinutes: number | null;
}

/** Episode list for one season, feeding the episode picker. */
export async function getSeasonEpisodes(
  tmdbId: string,
  season: number,
  fetchFn: typeof fetch = fetch,
  apiKey: string | null = tmdbApiKey(),
): Promise<TmdbEpisode[]> {
  const key = requireApiKey(apiKey);
  if (!/^[1-9]\d{0,9}$/.test(tmdbId) || !Number.isInteger(season) || season < 1 || season > 99) return [];
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}`);
  url.searchParams.set('api_key', key);
  const res = await fetchFn(url.toString());
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`tmdb season failed (${res.status})`);
  const payload = (await res.json()) as { episodes?: unknown };
  if (!Array.isArray(payload.episodes)) return [];
  return payload.episodes
    .filter((e): e is { episode_number: number } => typeof e === 'object' && e !== null && Number.isInteger((e as { episode_number?: unknown }).episode_number))
    .map((e) => {
      const row = e as { episode_number: number; name?: unknown; overview?: unknown; still_path?: unknown; runtime?: unknown };
      return {
        episodeNumber: row.episode_number,
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Episode ${row.episode_number}`,
        overview: typeof row.overview === 'string' ? row.overview : '',
        stillUrl: typeof row.still_path === 'string' && row.still_path.startsWith('/') ? `${TMDB_BACKDROP_BASE}${row.still_path}` : null,
        runtimeMinutes: typeof row.runtime === 'number' && row.runtime > 0 ? Math.round(row.runtime) : null,
      };
    });
}
