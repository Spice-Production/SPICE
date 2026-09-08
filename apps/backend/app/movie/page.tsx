'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import MediaChrome from '../media-chrome';
import MediaHero from '../media-hero';
import { fetchWatchState, readAccountToken, type WatchState } from '../watch-client';
import { WatchShelves } from '../watch-shelves';

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
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

type ShelfKey = 'trending' | 'popular' | 'top_rated';

const SHELVES: { key: ShelfKey; title: string }[] = [
  { key: 'trending', title: 'Trending this week' },
  { key: 'popular', title: 'Popular now' },
  { key: 'top_rated', title: 'Top rated' },
];

const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = '1px solid rgba(255,255,255,0.08)';
const DIM = '#94a3b8';

async function fetchShelf(key: ShelfKey): Promise<MovieHit[]> {
  const res = await fetch(`/api/movies/browse?list=${key}&limit=10`, {
    headers: { 'x-spice-api-namespace': 'local' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.movies) ? data.movies : [];
}

function PosterCard({ hit }: { hit: MovieHit }) {
  return (
    <Link href={`/movie/watch/${hit.tmdbId}`} style={{ textDecoration: 'none', color: 'inherit', minWidth: '150px', maxWidth: '150px' }}>
      <div style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: '14px', overflow: 'hidden' }}>
        {hit.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hit.posterUrl} alt={`${hit.title} poster`} style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', display: 'block' }} loading="lazy" />
        ) : (
          <div style={{ width: '100%', aspectRatio: '2 / 3', display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,0.18)', color: '#c4b5fd', fontSize: '2rem' }}>
            ♪
          </div>
        )}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.title}</div>
          {hit.year && <div style={{ color: DIM, fontSize: '0.75rem', marginTop: '2px' }}>{hit.year}</div>}
        </div>
      </div>
    </Link>
  );
}

function ShelfSkeleton() {
  return (
    <div style={{ display: 'flex', gap: '14px', overflow: 'hidden' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ minWidth: '150px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', aspectRatio: '2 / 3.4' }} />
      ))}
    </div>
  );
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
        const res = await fetch('/api/shows/browse?list=trending&limit=6', {
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
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(q)}&limit=12`, {
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
    <MediaChrome active="movies" section="SPICE MOVIES" token={token} onSignedIn={refreshWatchState} onSignOut={clearWatchState}>
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

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: searched || heroItems.length > 0 ? '8px 24px 0' : '48px 24px 0', width: '100%' }}>
        {heroItems.length === 0 && !searched && (
          <>
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
              SPICE MOVIES
            </p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.05, margin: '10px 0 8px' }}>
              Find a movie, press play.
            </h1>
          </>
        )}

        <form onSubmit={runSearch} style={{ display: 'flex', gap: '12px', margin: '24px 0 32px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies…"
            aria-label="Search movies"
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', color: 'inherit', padding: '12px 16px', fontSize: '1rem', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))', border: 'none', borderRadius: '12px', color: '#fff', padding: '12px 24px', fontSize: '1rem', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading || !query.trim() ? 0.6 : 1 }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af' }}>
            {error}
          </p>
        )}

        {searched ? (
          <>
            {hits.length === 0 && !loading && !error && <p style={{ color: DIM }}>No movies found. Try another title.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
              {hits.map((hit) => (
                <div key={hit.tmdbId} style={{ minWidth: 0 }}>
                  <PosterCard hit={hit} />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setSearched(false); setHits([]); setQuery(''); setError(null); }}
              style={{ marginTop: '24px', background: 'none', border: 'none', color: 'var(--accent-pink, #c084fc)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}
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
                <div style={{ height: '20px', width: '180px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', marginBottom: '14px' }} />
                <ShelfSkeleton />
              </>
            )}
            {shelvesError && (
              <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af' }}>
                {shelvesError}
              </p>
            )}
            {spotlight.length > 0 && (
              <section style={{ marginBottom: '32px' }} aria-label="TV series spotlight">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>TV series spotlight 📺</h2>
                  <Link href="/shows" style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
                    Explore all series →
                  </Link>
                </div>
                <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {spotlight.map((show) => (
                    <Link key={show.tmdbId} href={`/shows/watch/${show.tmdbId}`} style={{ textDecoration: 'none', color: 'inherit', minWidth: '150px', maxWidth: '150px' }}>
                      <div style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: '14px', overflow: 'hidden' }}>
                        {show.posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={show.posterUrl} alt={`${show.title} poster`} style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', display: 'block' }} loading="lazy" />
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '2 / 3', display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,0.18)', color: '#c4b5fd', fontSize: '2rem' }}>
                            📺
                          </div>
                        )}
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.title}</div>
                          {show.year && <div style={{ color: DIM, fontSize: '0.75rem', marginTop: '2px' }}>{show.year}</div>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {SHELVES.map((shelf) => {
              const items = shelves[shelf.key];
              if (!items || items.length === 0) return null;
              return (
                <section key={shelf.key} style={{ marginBottom: '32px' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 14px 0' }}>{shelf.title}</h2>
                  <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }}>
                    {items.map((hit) => (
                      <PosterCard key={hit.tmdbId} hit={hit} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
      <div style={{ height: '64px' }} />
    </MediaChrome>
  );
}
