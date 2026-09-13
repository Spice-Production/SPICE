import { notFound } from 'next/navigation';

import { normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getShowDetails } from '@/lib/tmdb';

import { V2ShowPlayer } from './show-player';

interface WatchParams {
  id: string;
}

export async function generateMetadata({ params }: { params: Promise<WatchParams> }) {
  const { id } = await params;
  if (!normalizeTmdbMovieId(id)) return { title: 'Spice Shows' };
  const details = await getShowDetails(id).catch(() => null);
  return { title: details ? `${details.title} - Spice Shows` : 'Spice Shows' };
}

/**
 * /v2/shows/watch/[id] — series watch rebuilt from zero. Same server
 * contract (id validation, details-or-404, ?s=/&e= resume parsing), same
 * player capabilities (season picker, episode grid, per-episode provider
 * frame, episode-scoped sync).
 */
export default async function V2ShowWatchPage({
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
    <>
      <style>{`
        .v2-watch { min-height: 100vh; background: var(--spk-bg, #000); color: var(--spk-text, #e8eaf0);
          font-family: var(--spk-font, Inter, system-ui, sans-serif); padding-bottom: 48px; }
        .v2-watch-backdrop { position: relative; height: 260px; overflow: hidden; }
        .v2-watch-backdrop img { width: 100%; height: 100%; object-fit: cover; opacity: 0.35; }
        .v2-watch-scrim { position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.92) 4%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1)); }
        .v2-watch-body { max-width: 1024px; margin: -100px auto 0; padding: 28px 24px 0; position: relative; }
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
        {details.backdropUrl && (
          <div className="v2-watch-backdrop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={details.backdropUrl} alt="" aria-hidden />
            <div className="v2-watch-scrim" aria-hidden="true" />
          </div>
        )}
        <div className="v2-watch-body" data-flat={details.backdropUrl ? 'false' : 'true'}>
          <a className="v2-watch-back" href="/v2/shows">
            ← Back to shows
          </a>
          <h1 className="v2-watch-title">{details.title}</h1>
          {details.tagline && <p className="v2-watch-tagline">“{details.tagline}”</p>}
          {meta && <p className="v2-watch-meta">{meta}</p>}
          {details.overview && <p className="v2-watch-overview">{details.overview}</p>}
          <V2ShowPlayer
            tmdbId={details.tmdbId}
            title={details.title}
            posterUrl={details.posterUrl}
            year={details.year}
            releaseDate={details.releaseDate}
            seasons={details.seasons}
            initialSeason={initialSeason}
            initialEpisode={initialEpisode}
          />
        </div>
      </div>
    </>
  );
}
