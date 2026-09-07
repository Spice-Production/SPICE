'use client';

import Link from 'next/link';
import { useState } from 'react';

interface MovieHit {
  tmdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
  overview: string;
}

export default function MoviePage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MovieHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

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

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050509',
        color: 'var(--text-primary, #f1f5f9)',
        fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
        padding: '48px 24px 64px',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
          SPICE MOVIES
        </p>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.05, margin: '10px 0 8px', letterSpacing: 0 }}>
          Find a movie, press play.
        </h1>
        <p style={{ color: '#94a3b8', margin: '0 0 28px' }}>
          Search the catalog, then watch right here through the embedded provider.
        </p>

        <form onSubmit={runSearch} style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies…"
            aria-label="Search movies"
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              color: 'inherit',
              padding: '12px 16px',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              padding: '12px 24px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading || !query.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af' }}>
            {error}
          </p>
        )}

        {!loading && searched && hits.length === 0 && !error && (
          <p style={{ color: '#94a3b8' }}>No movies found. Try another title.</p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '20px',
          }}
        >
          {hits.map((hit) => (
            <Link
              key={hit.tmdbId}
              href={`/movie/watch/${hit.tmdbId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease',
                }}
              >
                {hit.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hit.posterUrl} alt={`${hit.title} poster`} style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', display: 'block' }} loading="lazy" />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '2 / 3', display: 'grid', placeItems: 'center', background: 'rgba(124,58,237,0.18)', color: '#c4b5fd', fontSize: '2rem' }}>
                    ♪
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.3 }}>{hit.title}</div>
                  {hit.year && <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '2px' }}>{hit.year}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
