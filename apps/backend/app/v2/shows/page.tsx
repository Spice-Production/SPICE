'use client';

import { useEffect, useState } from 'react';

import {
  fetchAccountProfile,
  fetchWatchState,
  formatReleaseDate,
  readAccountToken,
  type WatchState,
} from '../../watch-client';
import {
  AppShell,
  Button,
  EmptyState,
  ErrorNote,
  PageHeader,
  PosterCard,
  ProfileButton,
  Shelf,
  Skeleton,
  TextField,
} from '@/components/ui';
import { V2_NAV } from '../nav';
import { V2MovieHero } from '../movie-hero';
import { V2WatchShelves } from '../watch-shelves';

interface ShowHit {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

type ShelfKey = 'trending' | 'popular' | 'top_rated' | 'airing';

const SHELVES: { key: ShelfKey; title: string }[] = [
  { key: 'trending', title: 'Trending series' },
  { key: 'popular', title: 'Popular now' },
  { key: 'top_rated', title: 'Top rated' },
  { key: 'airing', title: 'Airing now' },
];

const NAMESPACE_HEADERS = { 'x-spice-api-namespace': 'local' };

async function fetchShelf(key: ShelfKey): Promise<ShowHit[]> {
  const res = await fetch(`/api/shows/browse?list=${key}&limit=10`, { headers: NAMESPACE_HEADERS });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.shows) ? data.shows : [];
}

/**
 * /v2/shows — series browse rebuilt from zero on the kit. Same endpoints,
 * same shelves (trending/popular/top_rated/airing), same hero + synced
 * shelves with kind="show" so cards land in the series player.
 */
export default function V2ShowsPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ShowHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [shelves, setShelves] = useState<Partial<Record<ShelfKey, ShowHit[]>>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [accountName, setAccountName] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<WatchState | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchWatchState(token)
      .then(setWatchState)
      .catch(() => setToken(null));
    fetchAccountProfile(token)
      .then((profile) => setAccountName(profile?.displayName ?? profile?.username ?? null))
      .catch(() => null);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settled = await Promise.allSettled(SHELVES.map((s) => fetchShelf(s.key)));
        if (cancelled) return;
        const next: Partial<Record<ShelfKey, ShowHit[]>> = {};
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
      const res = await fetch(`/api/shows/search?q=${encodeURIComponent(q)}&limit=12`, {
        headers: NAMESPACE_HEADERS,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Show search failed.');
      setHits(Array.isArray(data.shows) ? data.shows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Show search failed.');
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const heroItems = (shelves.trending ?? []).filter((hit) => hit.backdropUrl).slice(0, 5);
  const savedShowIds = new Set(
    (watchState?.watchlist ?? []).filter((entry) => entry.kind === 'show').map((entry) => entry.tmdbId),
  );

  function onHeroListChange(tmdbId: string, saved: boolean, title: string) {
    setWatchState((prev) => {
      if (!prev) return prev;
      if (saved) {
        if (prev.watchlist.some((entry) => entry.kind === 'show' && entry.tmdbId === tmdbId)) return prev;
        return {
          ...prev,
          watchlist: [{ kind: 'show', tmdbId, title, posterUrl: null, year: null, addedAt: new Date().toISOString() }, ...prev.watchlist],
        };
      }
      return { ...prev, watchlist: prev.watchlist.filter((entry) => !(entry.kind === 'show' && entry.tmdbId === tmdbId)) };
    });
  }

  return (
    <AppShell
      items={V2_NAV}
      active="shows"
      topbar={<ProfileButton name={accountName} signedIn={token !== null} />}
    >
      {!searched && heroItems.length > 0 && (
        <V2MovieHero
          kicker="SPICE SHOWS · TRENDING"
          items={heroItems}
          kind="show"
          token={token}
          savedIds={savedShowIds}
          onListChange={onHeroListChange}
        />
      )}
      {(!searched && heroItems.length === 0) && (
        <PageHeader kicker="SPICE SHOWS" title="Find a series, press play." />
      )}

      <form onSubmit={runSearch} style={{ display: 'flex', gap: 10, alignItems: 'end' }} aria-label="Search series">
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField label="Search series" placeholder="Search series…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && <ErrorNote message={error} />}

      {searched ? (
        <>
          {hits.length === 0 && !loading && !error && <EmptyState message="No series found. Try another title." />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 150px)', gap: 16, justifyContent: 'start' }}>
            {hits.map((hit) => (
              <PosterCard
                key={hit.tmdbId}
                href={`/shows/watch/${hit.tmdbId}`}
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
              kind="show"
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
          {SHELVES.map((shelf) => {
            const items = shelves[shelf.key];
            if (!items || items.length === 0) return null;
            return (
              <Shelf key={shelf.key} title={shelf.title}>
                {items.map((hit) => (
                  <PosterCard
                    key={hit.tmdbId}
                    href={`/shows/watch/${hit.tmdbId}`}
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
    </AppShell>
  );
}
