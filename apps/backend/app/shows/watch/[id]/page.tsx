import Link from 'next/link';
import { notFound } from 'next/navigation';

import { normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getShowDetails } from '@/lib/tmdb';

import ShowPlayer from './show-player';

interface WatchParams {
  id: string;
}

export async function generateMetadata({ params }: { params: Promise<WatchParams> }) {
  const { id } = await params;
  if (!normalizeTmdbMovieId(id)) return { title: 'Spice Shows' };
  const details = await getShowDetails(id).catch(() => null);
  return { title: details ? `${details.title} - Spice Shows` : 'Spice Shows' };
}

export default async function ShowWatchPage({
  params,
  searchParams,
}: {
  params: Promise<WatchParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!normalizeTmdbMovieId(id)) notFound();
  const details = await getShowDetails(id).catch(() => null);
  if (!details) notFound();

  // Continue-watching links land here with ?s=&e= — resume that episode.
  const query = (await searchParams?.catch(() => undefined)) ?? {};
  const asPositiveInt = (value: string | string[] | undefined): number | undefined => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw || !/^\d{1,4}$/.test(raw.trim())) return undefined;
    const num = Number(raw.trim());
    return num >= 1 && num <= 5000 ? num : undefined;
  };
  const initialSeason = asPositiveInt(query.s);
  const initialEpisode = asPositiveInt(query.e);

  const meta = [details.year, details.status, ...details.genres].filter(Boolean).join(' · ');

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
      {details.backdropUrl && (
        <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={details.backdropUrl} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #050509 2%, rgba(5,5,9,0.4) 60%, rgba(5,5,9,0.15))' }} />
        </div>
      )}
      <div style={{ maxWidth: '1080px', margin: details.backdropUrl ? '-110px auto 0' : '0 auto', padding: '32px 24px 0', position: 'relative' }}>
        <Link href="/shows" style={{ color: 'var(--accent-pink, #c084fc)', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
          ← Back to shows
        </Link>
        <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', margin: '12px 0 6px', lineHeight: 1.1 }}>
          {details.title}
        </h1>
        {details.tagline && (
          <p style={{ color: 'var(--accent-pink, #c084fc)', fontStyle: 'italic', fontSize: '0.95rem', margin: '0 0 6px 0' }}>
            “{details.tagline}”
          </p>
        )}
        {meta && <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 10px 0' }}>{meta}</p>}
        {details.overview && (
          <p style={{ color: '#d4d4d8', fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 22px 0', maxWidth: '720px' }}>
            {details.overview}
          </p>
        )}
        <ShowPlayer tmdbId={details.tmdbId} title={details.title} posterUrl={details.posterUrl} year={details.year} seasons={details.seasons} initialSeason={initialSeason} initialEpisode={initialEpisode} />
      </div>
    </main>
  );
}
