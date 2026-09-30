'use client';

import Link from 'next/link';

import { formatReleaseDate } from '../../watch-client';
import { Shelf } from '../media';
import { Alert, Button, EmptyState, PageHeader, Skeleton } from '../primitives';
import { PosterCard, WatchHero, WatchListShelves, watchHrefFor, type HeroItem } from './watch-media';
import { WatchHost } from './watch-host';
import { WatchShell, type WatchSessionProps } from './watch-shell';
import s from './watch.module.css';

export interface BrowseHit {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate?: string | null;
  posterUrl: string | null;
}

/** Everything the Movies / TV Series pages already compute, handed to the new UI. */
export interface WatchBrowseModel {
  kind: 'movie' | 'show';
  session: WatchSessionProps;
  query: string;
  setQuery: (value: string) => void;
  runSearch: () => void;
  loading: boolean;
  error: string | null;
  searched: boolean;
  hits: BrowseHit[];
  resetSearch: () => void;
  shelves: { key: string; title: string; items: BrowseHit[] | undefined }[];
  shelvesLoading: boolean;
  shelvesError: string | null;
  heroItems: HeroItem[];
  savedIds: Set<string>;
  onHeroListChange: (tmdbId: string, saved: boolean, title: string) => void;
  onListRemoved: (tmdbId: string) => void;
  /** Movies page only: a TV series rail linking to /shows. */
  spotlight?: { tmdbId: string; title: string; year: string | null; posterUrl: string | null }[];
}

const COPY = {
  movie: {
    section: 'Movies',
    kicker: 'Trending movies',
    title: 'Find a movie, press play.',
    placeholder: 'Search movies…',
    empty: 'No movies found. Try another title.',
  },
  show: {
    section: 'TV Series',
    kicker: 'Trending series',
    title: 'Find a series, press play.',
    placeholder: 'Search series…',
    empty: 'No series found. Try another title.',
  },
} as const;

function hitSubtitle(hit: BrowseHit) {
  return formatReleaseDate(hit.releaseDate) ?? hit.year ?? undefined;
}

export function WatchBrowseView({ model }: { model: WatchBrowseModel }) {
  const copy = COPY[model.kind];
  const fallbackIcon = model.kind === 'show' ? 'tv' : 'film';
  const { token, watchState } = model.session;
  const showHero = !model.searched && model.heroItems.length > 0;

  return (
    <WatchHost>
      <WatchShell
        active={model.kind === 'show' ? 'shows' : 'movies'}
        session={model.session}
        search={{
          query: model.query,
          onQueryChange: model.setQuery,
          onSubmit: model.runSearch,
          loading: model.loading,
          placeholder: copy.placeholder,
        }}
      >
        {showHero ? (
          <WatchHero
            kicker={copy.kicker}
            items={model.heroItems}
            kind={model.kind}
            token={token}
            savedIds={model.savedIds}
            onListChange={model.onHeroListChange}
          />
        ) : null}

        <div className={s.page}>
          {!showHero && !model.searched ? <PageHeader eyebrow={`Spice ${copy.section}`} title={copy.title} /> : null}

          {model.error ? <Alert variant="danger">{model.error}</Alert> : null}

          {model.searched ? (
            <section className={s.section} aria-label="Search results">
              <div className={s.resultsHeader}>
                <h2 className={s.resultsTitle}>
                  Results for <span className={s.resultsQuery}>“{model.query.trim() || '…'}”</span>
                </h2>
                <Button variant="ghost" size="sm" icon="arrowLeft" onClick={model.resetSearch}>
                  Back to browse
                </Button>
              </div>
              {model.loading ? (
                <div className={s.posterGrid}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} height="auto" className={s.posterSkeleton} />
                  ))}
                </div>
              ) : model.hits.length === 0 && !model.error ? (
                <EmptyState icon="search" title={copy.empty} />
              ) : (
                <div className={s.posterGrid}>
                  {model.hits.map((hit) => (
                    <PosterCard
                      key={hit.tmdbId}
                      href={watchHrefFor(model.kind, hit.tmdbId)}
                      title={hit.title}
                      posterUrl={hit.posterUrl}
                      subtitle={hitSubtitle(hit)}
                      fallbackIcon={fallbackIcon}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <div className={s.stack}>
              {token && watchState ? (
                <WatchListShelves kind={model.kind} token={token} state={watchState} onRemoved={model.onListRemoved} />
              ) : null}

              {model.shelvesLoading ? (
                <section className={s.section} aria-busy="true" aria-label="Loading the catalog">
                  <Skeleton width={180} height={20} />
                  <div className={s.skeletonRow}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton key={i} height="auto" className={s.posterSkeleton} />
                    ))}
                  </div>
                </section>
              ) : null}

              {model.shelvesError ? <Alert variant="danger">{model.shelvesError}</Alert> : null}

              {model.spotlight && model.spotlight.length > 0 ? (
                <Shelf
                  id="series-spotlight"
                  title="TV series spotlight"
                  itemWidth={150}
                  action={
                    <Link href="/shows" className={s.shelfLink}>
                      Explore all series
                    </Link>
                  }
                >
                  {model.spotlight.map((show) => (
                    <PosterCard
                      key={show.tmdbId}
                      href={`/shows/watch/${show.tmdbId}`}
                      title={show.title}
                      posterUrl={show.posterUrl}
                      subtitle={show.year ?? undefined}
                      fallbackIcon="tv"
                    />
                  ))}
                </Shelf>
              ) : null}

              {model.shelves.map((shelf) =>
                shelf.items && shelf.items.length > 0 ? (
                  <Shelf key={shelf.key} id={`shelf-${shelf.key}`} title={shelf.title} itemWidth={150}>
                    {shelf.items.map((hit) => (
                      <PosterCard
                        key={hit.tmdbId}
                        href={watchHrefFor(model.kind, hit.tmdbId)}
                        title={hit.title}
                        posterUrl={hit.posterUrl}
                        subtitle={hitSubtitle(hit)}
                        fallbackIcon={fallbackIcon}
                      />
                    ))}
                  </Shelf>
                ) : null,
              )}
            </div>
          )}
        </div>
      </WatchShell>
    </WatchHost>
  );
}
