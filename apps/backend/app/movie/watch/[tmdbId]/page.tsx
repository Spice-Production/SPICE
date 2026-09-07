import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildMovieEmbedUrl, normalizeTmdbMovieId } from '@/lib/movie-provider';

interface WatchParams {
  tmdbId: string;
}

export async function generateMetadata({ params }: { params: Promise<WatchParams> }) {
  const { tmdbId } = await params;
  const valid = normalizeTmdbMovieId(tmdbId);
  return {
    title: valid ? `Watching movie ${valid} - Spice Movies` : 'Spice Movies',
  };
}

export default async function MovieWatchPage({ params }: { params: Promise<WatchParams> }) {
  const { tmdbId } = await params;
  const embedUrl = buildMovieEmbedUrl(tmdbId);
  if (!embedUrl) notFound();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050509',
        color: 'var(--text-primary, #f1f5f9)',
        fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 24px 24px',
      }}
    >
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        <Link href="/movie" style={{ color: 'var(--accent-pink, #c084fc)', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
          ← Back to movies
        </Link>
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            background: '#000',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <iframe
            src={embedUrl}
            title="Spice movie player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      </div>
    </main>
  );
}
