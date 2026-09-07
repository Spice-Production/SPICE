import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildMovieEmbedUrl, normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getMovieDetails } from '@/lib/tmdb';

interface WatchParams {
  tmdbId: string;
}

export async function generateMetadata({ params }: { params: Promise<WatchParams> }) {
  const { tmdbId } = await params;
  if (!normalizeTmdbMovieId(tmdbId)) return { title: 'Spice Movies' };
  const details = await getMovieDetails(tmdbId).catch(() => null);
  return { title: details ? `${details.title} - Spice Movies` : 'Spice Movies' };
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export default async function MovieWatchPage({ params }: { params: Promise<WatchParams> }) {
  const { tmdbId } = await params;
  const embedUrl = buildMovieEmbedUrl(tmdbId);
  if (!embedUrl) notFound();
  const details = await getMovieDetails(tmdbId).catch(() => null);

  const meta = details
    ? [details.year, formatRuntime(details.runtimeMinutes), ...details.genres].filter(Boolean).join(' · ')
    : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050509',
        color: 'var(--text-primary, #f1f5f9)',
        fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
        paddingBottom: '48px',
      }}
    >
      {details?.backdropUrl && (
        <div style={{ position: 'relative', height: '300px', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={details.backdropUrl} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #050509 2%, rgba(5,5,9,0.4) 60%, rgba(5,5,9,0.15))' }} />
        </div>
      )}
      <div style={{ maxWidth: '1080px', margin: details?.backdropUrl ? '-120px auto 0' : '0 auto', padding: '32px 24px 0', position: 'relative' }}>
        <Link href="/movie" style={{ color: 'var(--accent-pink, #c084fc)', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
          ← Back to movies
        </Link>
        <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', margin: '12px 0 6px', lineHeight: 1.1 }}>
          {details?.title ?? `Movie ${tmdbId}`}
        </h1>
        {details?.tagline && (
          <p style={{ color: 'var(--accent-pink, #c084fc)', fontStyle: 'italic', fontSize: '0.95rem', margin: '0 0 6px 0' }}>
            “{details.tagline}”
          </p>
        )}
        {meta && <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 10px 0' }}>{meta}</p>}
        {details?.overview && (
          <p style={{ color: '#d4d4d8', fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 22px 0', maxWidth: '720px' }}>
            {details.overview}
          </p>
        )}
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
            title={details ? `${details.title} player` : 'Spice movie player'}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      </div>
    </main>
  );
}
