'use client';

import { useEffect, useRef, useState } from 'react';

import {
  fetchWatchState,
  formatReleaseDate,
  readAccountToken,
  type WatchState,
} from '../../watch-client';
import {
  Button,
  EmptyState,
  ErrorNote,
  PageHeader,
  PosterCard,
  Shelf,
  Skeleton,
  TextField,
} from '@/components/ui';
import { V2MovieHero } from '../movie-hero';
import { V2WatchShelves } from '../watch-shelves';
import { usePlayer } from '../shell';

interface ShowSpotlight {
  tmdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
}

interface MovieHit {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

type ShelfKey = 'trending' | 'popular' | 'top_rated' | 'upcoming';

const SHELVES: { key: ShelfKey; title: string }[] = [
  { key: 'trending', title: 'Trending this week' },
  { key: 'popular', title: 'Popular now' },
  { key: 'top_rated', title: 'Top rated' },
  { key: 'upcoming', title: 'Coming soon' },
];

const NAMESPACE_HEADERS = { 'x-spice-api-namespace': 'local' };

async function fetchShelf(key: ShelfKey): Promise<MovieHit[]> {
  const res = await fetch(`/api/movies/browse?list=${key}&limit=10`, { headers: NAMESPACE_HEADERS });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.movies) ? data.movies : [];
}

/**
 * /v2/movie — movies browse rebuilt from zero on the kit. Same endpoints,
 * same localStorage keys, same capabilities as the original: rotating
 * hero with list toggle, search, synced shelves, four catalog shelves,
 * TV spotlight. Nothing from the old presentation is reused.
 */
export default function V2MoviePage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MovieHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [shelves, setShelves] = useState<Partial<Record<ShelfKey, MovieHit[]>>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState<string | null>(null);
  const { searchRequest } = usePlayer();
  const appliedSearchRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [watchState, setWatchState] = useState<WatchState | null>(null);
  const [spotlight, setSpotlight] = useState<ShowSpotlight[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchWatchState(token)
      .then(setWatchState)
      .catch(() => setToken(null));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/shows/browse?list=trending&limit=6', { headers: NAMESPACE_HEADERS });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.shows)) setSpotlight(data.shows);
      } catch {
        /* spotlight is decorative; shelves carry the page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settled = await Promise.allSettled(SHELVES.map((s) => fetchShelf(s.key)));
        if (cancelled) return;
        const next: Partial<Record<ShelfKey, MovieHit[]>> = {};
        let failed = 0;
        settled.forEach((result, i) => {
          if (result.status === 'fulfilled') next[SHELVES[i].key] = result.value;
          else failed += 1;
        });
        setShelves(next);
        if (failed === SHELVES.length) setShelvesError('Could not load the catalog shelves.');
      } catch {
        if (!cancelled) setShelvesError('Could not load the catalog shelves.');
      } finally {
        if (!cancelled) setShelvesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const q = (override ?? query).trim();
    if (!q || loading) return;
    if (override !== undefined) setQuery(override);
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(q)}&limit=12`, {
        headers: NAMESPACE_HEADERS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Movie search failed.');
      setHits(Array.isArray(data.movies) ? data.movies : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Movie search failed.');
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const applySearchRequest = (q: string) => {
    if (!q.trim() || appliedSearchRef.current === q) return;
    appliedSearchRef.current = q;
    void runSearch(undefined, q);
  };

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('q')?.trim();
      if (q) applySearchRequest(q);
    } catch {
      /* no URL query: plain visit */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchRequest && searchRequest.scope === 'movies') applySearchRequest(searchRequest.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest]);

  const heroItems = (shelves.trending ?? []).filter((hit) => hit.backdropUrl).slice(0, 5);
  const savedMovieIds = new Set(
    (watchState?.watchlist ?? []).filter((entry) => entry.kind === 'movie').map((entry) => entry.tmdbId),
  );

  function onHeroListChange(tmdbId: string, saved: boolean, title: string) {
    setWatchState((prev) => {
      if (!prev) return prev;
      if (saved) {
        if (prev.watchlist.some((entry) => entry.kind === 'movie' && entry.tmdbId === tmdbId)) return prev;
        return {
          ...prev,
          watchlist: [{ kind: 'movie', tmdbId, title, posterUrl: null, year: null, addedAt: new Date().toISOString() }, ...prev.watchlist],
        };
      }
      return { ...prev, watchlist: prev.watchlist.filter((entry) => !(entry.kind === 'movie' && entry.tmdbId === tmdbId)) };
    });
  }

  return (
    <>
      {!searched && heroItems.length > 0 && (
        <V2MovieHero
          kicker="SPICE MOVIES · TRENDING"
          items={heroItems}
          kind="movie"
          token={token}
          savedIds={savedMovieIds}
          onListChange={onHeroListChange}
        />
      )}
      {(!searched && heroItems.length === 0) && (
        <PageHeader kicker="SPICE MOVIES" title="Find a movie, press play." />
      )}

      <form onSubmit={runSearch} style={{ display: 'flex', gap: 10, alignItems: 'end' }} aria-label="Search movies">
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField label="Search movies" placeholder="Search movies…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && <ErrorNote message={error} />}

      {searched ? (
        <>
          {hits.length === 0 && !loading && !error && <EmptyState message="No movies found. Try another title." />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 150px)', gap: 16, justifyContent: 'start' }}>
            {hits.map((hit) => (
              <PosterCard
                key={hit.tmdbId}
                href={`/movie/watch/${hit.tmdbId}`}
                title={hit.title}
                meta={formatReleaseDate(hit.releaseDate) ?? hit.year}
                posterUrl={hit.posterUrl}
              />
            ))}
          </div>
          <div>
            <Button
              variant="ghost"
              onClick={() => {
                setSearched(false);
                setHits([]);
                setQuery('');
                setError(null);
              }}
            >
              ← Back to browse
            </Button>
          </div>
        </>
      ) : (
        <>
          {token && watchState && (
            <V2WatchShelves
              kind="movie"
              token={token}
              state={watchState}
              onToggle={(tmdbId) =>
                setWatchState((prev) =>
                  prev ? { ...prev, watchlist: prev.watchlist.filter((entry) => entry.tmdbId !== tmdbId) } : prev,
                )
              }
            />
          )}
          {shelvesLoading && <Skeleton count={6} />}
          {shelvesError && <ErrorNote message={shelvesError} />}
          {spotlight.length > 0 && (
            <Shelf
              title="TV series spotlight"
              action={
                <a href="/shows" style={{ color: 'inherit', textDecoration: 'none' }}>
                  Explore all series →
                </a>
              }
            >
              {spotlight.map((show) => (
                <PosterCard
                  key={show.tmdbId}
                  href={`/shows/watch/${show.tmdbId}`}
                  title={show.title}
                  meta={show.year}
                  posterUrl={show.posterUrl}
                />
              ))}
            </Shelf>
          )}
          {SHELVES.map((shelf) => {
            const items = shelves[shelf.key];
            if (!items || items.length === 0) return null;
            return (
              <Shelf key={shelf.key} title={shelf.title}>
                {items.map((hit) => (
                  <PosterCard
                    key={hit.tmdbId}
                    href={`/movie/watch/${hit.tmdbId}`}
                    title={hit.title}
                    meta={formatReleaseDate(hit.releaseDate) ?? hit.year}
                    posterUrl={hit.posterUrl}
                  />
                ))}
              </Shelf>
            );
          })}
        </>
      )}
    </>
  );
}
