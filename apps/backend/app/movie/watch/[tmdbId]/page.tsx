import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildMovieEmbedUrl, normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getMovieDetails } from '@/lib/tmdb';

import { ChevronLeftIcon } from '../../../media-icons';
import { resolveSpiceUiV2ForRequest, SPICE_UI_V2_COOKIE } from '../../../ui-v2/preference';
import { MovieWatchView } from '../../../ui-v2/watch/watch-detail';
import { WatchPageStyles } from '../../../watch-frame';
import WatchSync from '../../../watch-sync';
import MoviePlayer from './movie-player';

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

export default async function MovieWatchPage({
  params,
  searchParams,
}: {
  params: Promise<WatchParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tmdbId } = await params;
  const embedUrl = buildMovieEmbedUrl(tmdbId);
  if (!embedUrl) notFound();
  const details = await getMovieDetails(tmdbId).catch(() => null);

  const meta = details
    ? [details.year, formatRuntime(details.runtimeMinutes), ...details.genres].filter(Boolean).join(' · ')
    : null;

  const query = (await searchParams?.catch(() => undefined)) ?? {};
  if (resolveSpiceUiV2ForRequest((await cookies()).get(SPICE_UI_V2_COOKIE)?.value, query.ui)) {
    const title = details?.title ?? `Movie ${tmdbId}`;
    return (
      <MovieWatchView
        tmdbId={tmdbId}
        info={{
          title,
          tagline: details?.tagline ?? null,
          meta: details ? [details.year, formatRuntime(details.runtimeMinutes), ...details.genres].filter((item): item is string => Boolean(item)) : [],
          overview: details?.overview ?? null,
          backdropUrl: details?.backdropUrl ?? null,
          posterUrl: details?.posterUrl ?? null,
        }}
        sync={{ title, posterUrl: details?.posterUrl ?? null, year: details?.year ?? null, releaseDate: details?.releaseDate ?? null }}
      />
    );
  }

  return (
    <main className="watch-page">
      <WatchPageStyles />
      {details?.backdropUrl && (
        <div className="watch-backdrop" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={details.backdropUrl} alt="" />
          <div className="watch-backdrop__fade" />
        </div>
      )}
      <div className="watch-shell">
        <Link href="/movie" className="watch-back">
          <ChevronLeftIcon size={16} /> Back to movies
        </Link>

        <MoviePlayer tmdbId={tmdbId} title={details?.title ?? `Movie ${tmdbId}`} />

        <section className="watch-details">
          <h1 className="watch-title">{details?.title ?? `Movie ${tmdbId}`}</h1>
          {details?.tagline && (
            <p style={{ color: 'var(--accent-pink, #c084fc)', fontStyle: 'italic', fontSize: '0.92rem', margin: '0 0 6px 0' }}>
              “{details.tagline}”
            </p>
          )}
          {meta && <p className="watch-meta">{meta}</p>}
          <WatchSync
            kind="movie"
            tmdbId={tmdbId}
            title={details?.title ?? `Movie ${tmdbId}`}
            posterUrl={details?.posterUrl ?? null}
            year={details?.year ?? null}
            releaseDate={details?.releaseDate ?? null}
          />
          {details?.overview && <p className="watch-overview">{details.overview}</p>}
        </section>
      </div>
    </main>
  );
}
