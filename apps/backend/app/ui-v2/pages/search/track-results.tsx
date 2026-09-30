'use client';

import { useId, useMemo } from 'react';

import type { Track } from '../../../spice-app';
import { filterTracksForYou } from '../../../taste-affinity';
import { useScrollContainer, useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { formatCount, TrackList } from '../../media';
import { Badge, Button, EmptyState, SectionHeader } from '../../primitives';
import { useSetSearchForYou } from './search-controls';
import { SkeletonRows, TopResultCard, useSearchRowOptions } from './track-bits';
import s from '../search.module.css';

/** v2 glyphs for the classic genre list (its icons are classic-only SVGs). */
const GENRE_ICONS: Record<string, IconName> = {
  'Pop Hits': 'micVocal',
  'Hip-Hop': 'headphones',
  'Rock Charts': 'flame',
  'Lofi Chill': 'moon',
  Electronic: 'audioLines',
  'Jazz Beats': 'disc',
};

/**
 * Tracks tab body. Mirrors the classic branches: results (optionally the
 * "For you" subset), the For-you empty message, and, with nothing to show,
 * recommended searches (empty query only) plus the category grid.
 */
export function TrackSearchResults() {
  const m = useSpiceUi();
  const { searchForYouOnly, searchResults, tasteAffinityContext } = m;
  const visible = useMemo(
    () => (searchForYouOnly ? filterTracksForYou(searchResults, tasteAffinityContext) : searchResults),
    [searchForYouOnly, searchResults, tasteAffinityContext],
  );
  const hasQuery = m.searchQuery.trim().length > 0;
  const empty = visible.length === 0;
  const loading = empty && m.isSearching && hasQuery;
  const forYouEmpty = empty && !loading && searchForYouOnly && (hasQuery || searchResults.length > 0);
  const noResults = empty && !loading && !forYouEmpty && hasQuery;
  const showDiscover = empty && !loading && !forYouEmpty;
  const showRecommended = showDiscover && !hasQuery && (m.isLoadingRecommendations || m.homeRecommended.length > 0);

  return (
    <>
      {!empty ? <ResultsSection tracks={visible} /> : null}
      {loading ? <LoadingSection /> : null}
      {forYouEmpty ? <ForYouEmpty /> : null}
      {noResults ? <NoResults /> : null}
      {showRecommended ? <RecommendedSection /> : null}
      {showDiscover ? <BrowseSection /> : null}
    </>
  );
}

function ResultsSection({ tracks }: { tracks: Track[] }) {
  const m = useSpiceUi();
  const rowOptions = useSearchRowOptions();
  const headingId = useId();
  // Rows queue the full result list, exactly like the classic list.
  const queue = m.searchResults;
  const withTop = tracks.length >= 2;
  const songs = useMemo(() => (withTop ? tracks.slice(1, 5) : []), [tracks, withTop]);
  const rest = useMemo(() => (withTop ? tracks.slice(5) : tracks), [tracks, withTop]);
  const getRow = (track: Track) => rowOptions(track, queue, { quickAdd: true });
  const summary = m.searchForYouOnly
    ? `${formatCount(tracks.length, 'match', 'matches')} from ${formatCount(queue.length, 'result')}`
    : formatCount(tracks.length, 'result');

  return (
    <section className={s.section} aria-labelledby={headingId} aria-busy={m.isSearching || undefined}>
      <SectionHeader
        id={headingId}
        title={m.searchForYouOnly ? 'Results for you' : 'Search results'}
        description={summary}
        action={
          m.searchResultsSource === 'cache' ? (
            <Badge variant="outline" icon="hardDrive" title="These results were saved on this device from an earlier search">
              Saved locally
            </Badge>
          ) : null
        }
      />
      {withTop ? (
        <div className={s.topGrid}>
          <div className={s.topColumn}>
            <h3 className={s.subheading}>Top result</h3>
            <TopResultCard track={tracks[0]} queue={queue} />
          </div>
          <div className={s.songsColumn}>
            <h3 className={s.subheading}>Songs</h3>
            <TrackList tracks={songs} getRowOptions={getRow} ariaLabel="Songs" showIndex={false} />
          </div>
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className={s.moreResults}>
          {withTop ? <h3 className={s.subheading}>More results</h3> : null}
          <TrackList
            tracks={rest}
            getRowOptions={getRow}
            ariaLabel={withTop ? 'More results' : 'Search results'}
            showIndex={false}
            resetKey={m.searchQuery}
          />
        </div>
      ) : null}
    </section>
  );
}

function LoadingSection() {
  const m = useSpiceUi();
  const headingId = useId();
  return (
    <section className={s.section} aria-labelledby={headingId} aria-busy="true">
      <SectionHeader id={headingId} title="Search results" description={`Searching ${m.SEARCH_PROVIDER_LABELS[m.searchProvider]}…`} />
      <SkeletonRows count={6} label="Searching" />
    </section>
  );
}

function ForYouEmpty() {
  const setForYou = useSetSearchForYou();
  const headingId = useId();
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Results for you" />
      <EmptyState
        icon="sparkles"
        title="No strong matches yet"
        description="Nothing in these results strongly matches this profile yet. Turn off the For you filter to see everything."
        action={
          <Button variant="outline" size="sm" onClick={() => setForYou(false)}>
            Show all results
          </Button>
        }
      />
    </section>
  );
}

function NoResults() {
  const m = useSpiceUi();
  const query = m.searchQuery.trim();
  return (
    <EmptyState
      icon="search"
      title={`No results for “${query}”`}
      description="Check the spelling, try another source, or paste a YouTube or SoundCloud link and press Enter."
      action={
        <Button variant="outline" size="sm" icon="refresh" onClick={() => m.queueSearch(m.searchQuery, m.searchProvider)}>
          Search again
        </Button>
      }
    />
  );
}

function RecommendedSection() {
  const m = useSpiceUi();
  const rowOptions = useSearchRowOptions();
  const headingId = useId();
  const recommended = m.homeRecommended;
  const picks = useMemo(() => recommended.slice(0, 8), [recommended]);
  const loading = m.isLoadingRecommendations && recommended.length === 0;
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Recommended searches"
        description={m.homeRecommendationSeed?.reason || 'Suggestions are scored on this device from your local profile.'}
      />
      {loading ? (
        <>
          <p className={s.loadingNote}>
            <Icon name="loader" size={14} className={s.spin} />
            <span>
              Finding private picks… <span className={s.loadingNoteMuted}>Local taste profile, no raw history upload.</span>
            </span>
          </p>
          <SkeletonRows count={3} label="Finding private picks" />
        </>
      ) : (
        <TrackList
          tracks={picks}
          getRowOptions={(track) => rowOptions(track, recommended)}
          ariaLabel="Recommended searches"
          showIndex={false}
        />
      )}
    </section>
  );
}

function BrowseSection() {
  const m = useSpiceUi();
  const scrollContainer = useScrollContainer();
  const headingId = useId();
  // Same as the classic genre card: set the query and run it.
  const browse = (name: string) => {
    m.setSearchQuery(name);
    m.queueSearch(name);
    scrollContainer?.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Browse all categories" />
      <div className={s.genreGrid}>
        {m.genres.map((genre) => (
          <button key={genre.name} type="button" className={s.genreTile} onClick={() => browse(genre.name)} aria-label={`Search ${genre.name}`}>
            <span className={s.genreSwatch} style={{ background: genre.gradient }} aria-hidden="true">
              <Icon name={GENRE_ICONS[genre.name] ?? 'music'} size={18} />
            </span>
            <span className={s.genreName}>{genre.name}</span>
            <Icon name="arrowUpRight" size={16} className={s.genreArrow} />
          </button>
        ))}
      </div>
    </section>
  );
}
