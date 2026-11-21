'use client';

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
import { AnimeIcon } from '../media-icons';
import { useSpiceUiV2 } from '../ui-v2/preference-client';
import { WatchBrowseView } from '../ui-v2/watch/browse-view';
import { fetchWatchState, readAccountToken, type WatchState } from '../watch-client';
import { WatchShelves } from '../watch-shelves';

interface AnimeHit {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
  mediaType: 'tv' | 'movie';
}

type ShelfKey = 'trending' | 'airing' | 'popular' | 'top_rated' | 'movies';

const SHELVES: { key: ShelfKey; title: string }[] = [
  { key: 'trending', title: 'Trending anime' },
  { key: 'airing', title: 'Airing now' },
  { key: 'popular', title: 'Popular anime' },
  { key: 'top_rated', title: 'Top rated' },
  { key: 'movies', title: 'Anime movies' },
];

const DIM = 'var(--text-secondary, #94a3b8)';

async function fetchShelf(key: ShelfKey): Promise<AnimeHit[]> {
  const res = await fetch(`/api/anime/browse?list=${key}&limit=12`, {
    headers: { 'x-spice-api-namespace': 'local' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.anime) ? data.anime : [];
}

function animeHref(hit: AnimeHit): string {
  return hit.mediaType === 'movie' ? `/movie/watch/${hit.tmdbId}` : `/anime/watch/${hit.tmdbId}`;
}

export default function AnimePage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AnimeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [shelves, setShelves] = useState<Partial<Record<ShelfKey, AnimeHit[]>>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const ui = useSpiceUiV2();
  const [watchState, setWatchState] = useState<WatchState | null>(null);

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
        const settled = await Promise.allSettled(SHELVES.map((s) => fetchShelf(s.key)));
        if (cancelled) return;
        const next: Partial<Record<ShelfKey, AnimeHit[]>> = {};
        let failed = 0;
        settled.forEach((result, i) => {
          if (result.status === 'fulfilled') next[SHELVES[i].key] = result.value;
          else failed += 1;
        });
        setShelves(next);
        if (failed === SHELVES.length) setShelvesError('Could not load the anime catalog.');
      } catch {
        if (!cancelled) setShelvesError('Could not load the anime catalog.');
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
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}&limit=18`, {
        headers: { 'x-spice-api-namespace': 'local' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Anime search failed.');
      setHits(Array.isArray(data.anime) ? data.anime : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anime search failed.');
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
  const savedAnimeIds = new Set(
    (watchState?.watchlist ?? []).filter((entry) => entry.kind === 'anime').map((entry) => entry.tmdbId),
  );

  function onHeroListChange(tmdbId: string, saved: boolean, title: string) {
    setWatchState((prev) => {
      if (!prev) return prev;
      if (saved) {
        if (prev.watchlist.some((entry) => entry.kind === 'anime' && entry.tmdbId === tmdbId)) return prev;
        return {
          ...prev,
          watchlist: [{ kind: 'anime', tmdbId, title, posterUrl: null, year: null, addedAt: new Date().toISOString() }, ...prev.watchlist],
        };
      }
      return { ...prev, watchlist: prev.watchlist.filter((entry) => !(entry.kind === 'anime' && entry.tmdbId === tmdbId)) };
    });
  }

  if (ui.enabled) {
    return (
      <WatchBrowseView
        model={{
          kind: 'anime',
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
          savedIds: savedAnimeIds,
          onHeroListChange,
          onListRemoved: (tmdbId) =>
            setWatchState((prev) =>
              prev ? { ...prev, watchlist: prev.watchlist.filter((entry) => entry.tmdbId !== tmdbId) } : prev,
            ),
        }}
      />
    );
  }

  return (
    <MediaChrome active="anime" section="SPICE ANIME" token={token} watchState={watchState} onSignedIn={refreshWatchState} onSignOut={clearWatchState}>
      <MediaBrowseStyles />
      {!searched && heroItems.length > 0 && (
        <MediaHero
          kicker="SPICE ANIME · TRENDING"
          items={heroItems}
          kind="anime"
          token={token}
          savedIds={savedAnimeIds}
          onListChange={onHeroListChange}
        />
      )}

      <div className="browse-container">
        {heroItems.length === 0 && !searched && !shelvesLoading && (
          <div style={{ margin: '10px 0 16px' }}>
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.74rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
              SPICE ANIME
            </p>
            <h1 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.5rem)', lineHeight: 1.08, margin: '6px 0 0' }}>
              Find an anime, press play.
            </h1>
          </div>
        )}

        <MediaSearchBar
          value={query}
          onChange={setQuery}
          onSubmit={runSearch}
          onClear={clearSearch}
          placeholder="Search anime series & movies…"
          ariaLabel="Search anime"
          loading={loading}
        />

        {error && (
          <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af', marginBottom: '18px' }}>
            {error}
          </p>
        )}

        {searched ? (
          <>
            {hits.length === 0 && !loading && !error && <p style={{ color: DIM }}>No anime found. Try another title.</p>}
            <div className="browse-grid">
              {hits.map((hit) => (
                <MediaPosterCard
                  key={`${hit.mediaType}:${hit.tmdbId}`}
                  href={animeHref(hit)}
                  item={{ ...hit, badge: hit.mediaType === 'movie' ? 'Movie' : null }}
                  fallbackIcon={<AnimeIcon size={32} />}
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
                kind="anime"
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
            {SHELVES.map((shelf) => {
              const items = shelves[shelf.key];
              if (!items || items.length === 0) return null;
              return (
                <MediaShelf key={shelf.key} title={shelf.title}>
                  {items.map((hit) => (
                    <MediaPosterCard
                      key={`${hit.mediaType}:${hit.tmdbId}`}
                      href={animeHref(hit)}
                      item={hit}
                      fallbackIcon={<AnimeIcon size={32} />}
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
