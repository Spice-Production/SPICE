import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { normalizeTmdbMovieId } from '@/lib/movie-provider';
import { getShowDetails } from '@/lib/tmdb';

import { ChevronLeftIcon } from '../../../media-icons';
import ShowPlayer from '../../../shows/watch/[id]/show-player';
import { resolveSpiceUiV2ForRequest, SPICE_UI_V2_COOKIE } from '../../../ui-v2/preference';
import { ShowWatchView } from '../../../ui-v2/watch/watch-detail';
import { WatchPageStyles } from '../../../watch-frame';

interface WatchParams {
  id: string;
}

export async function generateMetadata({ params }: { params: Promise<WatchParams> }) {
  const { id } = await params;
  if (!normalizeTmdbMovieId(id)) return { title: 'Spice Anime' };
  const details = await getShowDetails(id).catch(() => null);
  return { title: details ? `${details.title} - Spice Anime` : 'Spice Anime' };
}

export default async function AnimeWatchPage({
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

  if (resolveSpiceUiV2ForRequest((await cookies()).get(SPICE_UI_V2_COOKIE)?.value, query.ui)) {
    return (
      <ShowWatchView
        kind="anime"
        info={{
          title: details.title,
          tagline: details.tagline ?? null,
          meta: [details.year, details.status, ...details.genres].filter((item): item is string => Boolean(item)),
          overview: details.overview ?? null,
          backdropUrl: details.backdropUrl ?? null,
          posterUrl: details.posterUrl ?? null,
        }}
        player={{
          kind: 'anime',
          tmdbId: details.tmdbId,
          title: details.title,
          posterUrl: details.posterUrl,
          year: details.year,
          releaseDate: details.releaseDate,
          seasons: details.seasons,
          initialSeason,
          initialEpisode,
        }}
      />
    );
  }

  return (
    <main className="watch-page">
      <WatchPageStyles />
      {details.backdropUrl && (
        <div className="watch-backdrop" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={details.backdropUrl} alt="" />
          <div className="watch-backdrop__fade" />
        </div>
      )}
      <div className="watch-shell">
        <Link href="/anime" className="watch-back">
          <ChevronLeftIcon size={16} /> Back to anime
        </Link>
        <ShowPlayer
          kind="anime"
          tmdbId={details.tmdbId}
          title={details.title}
          tagline={details.tagline}
          meta={meta || null}
          overview={details.overview}
          posterUrl={details.posterUrl}
          year={details.year}
          releaseDate={details.releaseDate}
          seasons={details.seasons}
          initialSeason={initialSeason}
          initialEpisode={initialEpisode}
        />
      </div>
    </main>
  );
}
