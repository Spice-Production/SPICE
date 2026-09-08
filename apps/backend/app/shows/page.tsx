'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ShowHit {
  tmdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
}

type ShelfKey = 'trending' | 'popular' | 'top_rated';

const SHELVES: { key: ShelfKey; title: string }[] = [
  { key: 'trending', title: 'Trending series' },
  { key: 'popular', title: 'Popular now' },
  { key: 'top_rated', title: 'Top rated' },
];

const BG = '#050509';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = '1px solid rgba(255,255,255,0.08)';
const DIM = '#94a3b8';

async function fetchShelf(key: ShelfKey): Promise<ShowHit[]> {
  const res = await fetch(`/api/shows/browse?list=${key}&limit=10`, {
    headers: { 'x-spice-api-namespace': 'local' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Browse failed.');
  return Array.isArray(data.shows) ? data.shows : [];
}

function PosterCard({ hit }: { hit: ShowHit }) {
  return (
    <Link href={`/shows/watch/${hit.tmdbId}`} style={{ textDecoration: 'none', color: 'inherit', minWidth: '150px', maxWidth: '150px' }}>
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

export default function ShowsPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ShowHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [shelves, setShelves] = useState<Partial<Record<ShelfKey, ShowHit[]>>>({});
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState<string | null>(null);

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
        headers: { 'x-spice-api-namespace': 'local' },
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

  const hero = shelves.trending?.find((hit) => hit.backdropUrl) ?? shelves.trending?.[0];

  return (
    <main style={{ minHeight: '100vh', background: BG, color: 'var(--text-primary, #f1f5f9)', fontFamily: 'var(--font-geist-sans), Inter, sans-serif', paddingBottom: '64px' }}>
      {hero && !searched && (
        <section style={{ position: 'relative', overflow: 'hidden' }}>
          {hero.backdropUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.backdropUrl} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #050509 4%, rgba(5,5,9,0.55) 55%, rgba(5,5,9,0.25))' }} />
          <div style={{ position: 'relative', maxWidth: '1080px', margin: '0 auto', padding: '88px 24px 56px' }}>
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '0.08em' }}>
              SPICE SHOWS · TRENDING
            </p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', lineHeight: 1.05, margin: '0 0 10px 0', maxWidth: '640px' }}>
              {hero.title}
            </h1>
            {hero.overview && (
              <p style={{ color: '#d4d4d8', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 22px 0', maxWidth: '560px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {hero.overview}
              </p>
            )}
            <Link href={`/shows/watch/${hero.tmdbId}`} style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))', borderRadius: '12px', color: '#fff', padding: '12px 28px', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
              ▶ Watch now
            </Link>
          </div>
        </section>
      )}

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: searched || !hero ? '48px 24px 0' : '8px 24px 0' }}>
        {!hero && !searched && (
          <>
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
              SPICE SHOWS
            </p>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.05, margin: '10px 0 8px' }}>
              Find a series, press play.
            </h1>
          </>
        )}

        <form onSubmit={runSearch} style={{ display: 'flex', gap: '12px', margin: '24px 0 32px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search series…"
            aria-label="Search series"
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
            {hits.length === 0 && !loading && !error && <p style={{ color: DIM }}>No series found. Try another title.</p>}
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
    </main>
  );
}
