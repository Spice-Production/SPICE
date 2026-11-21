'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  MediaBrowseStyles,
  MediaPosterCard,
  MediaSearchBar,
  MediaShelf,
  MediaShelfSkeleton,
} from '../media-browse';
import MediaChrome from '../media-chrome';
import MediaHero from '../media-hero';
import { FilmIcon, TvIcon } from '../media-icons';
import { useSpiceUiV2 } from '../ui-v2/preference-client';
import { WatchBrowseView } from '../ui-v2/watch/browse-view';
import { fetchWatchState, readAccountToken, type WatchState } from '../watch-client';
import { WatchShelves } from '../watch-shelves';

interface ShowSpotlight {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate?: string | null;
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

const DIM = 'var(--text-secondary, #94a3b8)';

async function fetchShelf(key: ShelfKey): Promise<MovieHit[]> {
  const res = await fetch(`/api/movies/browse?list=${key}&limit=12`, {
    headers: { 'x-spice-api-namespace': 'local' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.movies) ? data.movies : [];
}

export default function MoviePage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MovieHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [shelves, setShelves] = useState<Partial<Record<ShelfKey, MovieHit[]>>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const ui = useSpiceUiV2();
  const [watchState, setWatchState] = useState<WatchState | null>(null);
  const [spotlight, setSpotlight] = useState<ShowSpotlight[]>([]);

  function refreshWatchState(next: string) {
    setToken(next);
    fetchWatchState(next).then(setWatchState).catch(() => null);
  }

  function clearWatchState() {
    setToken(null);
    setWatchState(null);
  }

  useEffect(() => {
    if (!token) return;
    fetchWatchState(token).then(setWatchState).catch(() => setToken(null));
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/shows/browse?list=trending&limit=10', {
          headers: { 'x-spice-api-namespace': 'local' },
        });
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

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(q)}&limit=18`, {
        headers: { 'x-spice-api-namespace': 'local' },
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

  function clearSearch() {
    setSearched(false);
    setHits([]);
    setQuery('');
    setError(null);
  }

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

  if (ui.enabled) {
    return (
      <WatchBrowseView
        model={{
          kind: 'movie',
          session: { token, watchState, onSignedIn: refreshWatchState, onSignOut: clearWatchState },
          query,
          setQuery,
          runSearch: () => void runSearch(),
          loading,
          error,
          searched,
          hits,
          resetSearch: clearSearch,
          shelves: SHELVES.map((shelf) => ({ key: shelf.key, title: shelf.title, items: shelves[shelf.key] })),
          shelvesLoading,
          shelvesError,
          heroItems,
          savedIds: savedMovieIds,
          onHeroListChange,
          onListRemoved: (tmdbId) =>
            setWatchState((prev) =>
              prev ? { ...prev, watchlist: prev.watchlist.filter((entry) => entry.tmdbId !== tmdbId) } : prev,
            ),
          spotlight,
        }}
      />
    );
  }

  return (
    <MediaChrome active="movies" section="SPICE MOVIES" token={token} watchState={watchState} onSignedIn={refreshWatchState} onSignOut={clearWatchState}>
      <MediaBrowseStyles />
      {!searched && heroItems.length > 0 && (
        <MediaHero
          kicker="SPICE MOVIES · TRENDING"
          items={heroItems}
          kind="movie"
          token={token}
          savedIds={savedMovieIds}
          onListChange={onHeroListChange}
        />
      )}

      <div className="browse-container">
        {heroItems.length === 0 && !searched && !shelvesLoading && (
          <div style={{ margin: '10px 0 16px' }}>
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.74rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
              SPICE MOVIES
            </p>
            <h1 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.5rem)', lineHeight: 1.08, margin: '6px 0 0' }}>
              Find a movie, press play.
            </h1>
          </div>
        )}

        <MediaSearchBar
          value={query}
          onChange={setQuery}
          onSubmit={runSearch}
          onClear={clearSearch}
          placeholder="Search movies…"
          ariaLabel="Search movies"
          loading={loading}
        />

        {error && (
          <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af', marginBottom: '18px' }}>
            {error}
          </p>
        )}

        {searched ? (
          <>
            {hits.length === 0 && !loading && !error && <p style={{ color: DIM }}>No movies found. Try another title.</p>}
            <div className="browse-grid">
              {hits.map((hit) => (
                <MediaPosterCard
                  key={hit.tmdbId}
                  href={`/movie/watch/${hit.tmdbId}`}
                  item={hit}
                  fallbackIcon={<FilmIcon size={32} />}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={clearSearch}
              style={{ marginTop: '20px', background: 'none', border: 'none', color: 'var(--accent-pink, #c084fc)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, padding: 0 }}
            >
              ← Back to browse
            </button>
          </>
        ) : (
          <>
            {token && watchState && (
              <WatchShelves
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
            {shelvesLoading && (
              <>
                <MediaShelfSkeleton />
                <MediaShelfSkeleton />
              </>
            )}
            {shelvesError && (
              <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af' }}>
                {shelvesError}
              </p>
            )}
            {spotlight.length > 0 && (
              <MediaShelf
                ariaLabel="TV series spotlight"
                title={
                  <>
                    <TvIcon size={18} /> TV series spotlight
                  </>
                }
                action={
                  <Link href="/shows" style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Explore all series →
                  </Link>
                }
              >
                {spotlight.map((show) => (
                  <MediaPosterCard
                    key={show.tmdbId}
                    href={`/shows/watch/${show.tmdbId}`}
                    item={{ ...show, releaseDate: show.releaseDate ?? null }}
                    fallbackIcon={<TvIcon size={32} />}
                  />
                ))}
              </MediaShelf>
            )}
            {SHELVES.map((shelf) => {
              const items = shelves[shelf.key];
              if (!items || items.length === 0) return null;
              return (
                <MediaShelf key={shelf.key} title={shelf.title}>
                  {items.map((hit) => (
                    <MediaPosterCard
                      key={hit.tmdbId}
                      href={`/movie/watch/${hit.tmdbId}`}
                      item={hit}
                      fallbackIcon={<FilmIcon size={32} />}
                    />
                  ))}
                </MediaShelf>
              );
            })}
          </>
        )}
      </div>
      <div style={{ height: '48px' }} />
    </MediaChrome>
  );
}
