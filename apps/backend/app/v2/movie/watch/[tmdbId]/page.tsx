import { notFound } from 'next/navigation';

import { buildMovieEmbedUrl, normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getMovieDetails } from '@/lib/tmdb';

import { V2WatchSync } from '../../../watch-sync';
import { V2MoviePlayer } from './movie-player';

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

/**
 * /v2/movie/watch/[tmdbId] — watch page rebuilt from zero. Same server
 * contract (id validation, embed check, metadata, TMDB details), same
 * islands (progress sync, provider-tabbed player), quiet presentation.
 */
export default async function V2MovieWatchPage({ params }: { params: Promise<WatchParams> }) {
  const { tmdbId } = await params;
  const embedUrl = buildMovieEmbedUrl(tmdbId);
  if (!embedUrl) notFound();
  const details = await getMovieDetails(tmdbId).catch(() => null);

  const meta = details
    ? [details.year, formatRuntime(details.runtimeMinutes), ...details.genres].filter(Boolean).join(' · ')
    : null;

  return (
    <>
      <style>{`
        .v2-watch { min-height: 100vh; background: var(--spk-bg, #000); color: var(--spk-text, #e8eaf0);
          font-family: var(--spk-font, Inter, system-ui, sans-serif); padding-bottom: 48px; }
        .v2-watch-backdrop { position: relative; height: 280px; overflow: hidden; }
        .v2-watch-backdrop img { width: 100%; height: 100%; object-fit: cover; opacity: 0.35; }
        .v2-watch-scrim { position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.92) 4%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1)); }
        .v2-watch-body { max-width: 1024px; margin: -110px auto 0; padding: 28px 24px 0; position: relative; }
        .v2-watch-body[data-flat="true"] { margin-top: 0; }
        .v2-watch-back { color: var(--spk-text-2, #a3a7b5); text-decoration: none; font-weight: 600; font-size: 0.88rem; }
        .v2-watch-back:hover { color: var(--spk-text, #e8eaf0); }
        .v2-watch-title { font-size: clamp(1.5rem, 4vw, 2.2rem); margin: 12px 0 6px; line-height: 1.1;
          letter-spacing: -0.015em; }
        .v2-watch-tagline { color: var(--spk-text-2, #a3a7b5); font-style: italic; font-size: 0.92rem; margin: 0 0 6px; }
        .v2-watch-meta { color: var(--spk-text-3, #6b6f7d); font-size: 0.85rem; margin: 0 0 10px; }
        .v2-watch-overview { color: var(--spk-text-2, #a3a7b5); font-size: 0.9rem; line-height: 1.65;
          margin: 0 0 22px; max-width: 720px; }
      `}</style>
      <div className="v2-watch">
        {details?.backdropUrl && (
          <div className="v2-watch-backdrop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={details.backdropUrl} alt="" aria-hidden />
            <div className="v2-watch-scrim" aria-hidden="true" />
          </div>
        )}
        <div className="v2-watch-body" data-flat={details?.backdropUrl ? 'false' : 'true'}>
          <a className="v2-watch-back" href="/v2/movie">
            ← Back to movies
          </a>
          <h1 className="v2-watch-title">{details?.title ?? `Movie ${tmdbId}`}</h1>
          {details?.tagline && <p className="v2-watch-tagline">“{details.tagline}”</p>}
          {meta && <p className="v2-watch-meta">{meta}</p>}
          {details?.overview && <p className="v2-watch-overview">{details.overview}</p>}
          <V2WatchSync
            kind="movie"
            tmdbId={tmdbId}
            title={details?.title ?? `Movie ${tmdbId}`}
            posterUrl={details?.posterUrl ?? null}
            year={details?.year ?? null}
            releaseDate={details?.releaseDate ?? null}
          />
          <V2MoviePlayer tmdbId={tmdbId} title={details?.title ?? `Movie ${tmdbId}`} />
        </div>
      </div>
    </>
  );
}
