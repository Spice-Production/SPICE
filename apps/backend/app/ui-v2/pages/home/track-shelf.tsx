'use client';

import { useId, type ReactNode } from 'react';

import type { Track } from '../../../spice-app';
import { usePlayback, useTrackMenu } from '../../actions';
import { artistNames, MediaCard, Shelf, TrackArtwork, trackKey } from '../../media';
import { SectionHeader, Skeleton } from '../../primitives';
import s from '../home.module.css';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Placeholder cards shaped like MediaCard while a shelf loads. */
export function ShelfSkeleton() {
  return (
    <>
      {SKELETON_KEYS.map((key) => (
        <div key={key} className={s.skeletonCard} aria-hidden="true">
          <Skeleton height="auto" radius="var(--sx-art-radius)" className={s.skeletonArt} />
          <Skeleton height={12} width="78%" />
          <Skeleton height={10} width="52%" />
        </div>
      ))}
    </>
  );
}

/**
 * Horizontal shelf of track cards. Clicking a card starts that track with the
 * shelf's own list as the queue (the classic carousel behavior); the hover
 * button pauses/resumes the current track, and the card menu carries the
 * standard track actions plus, for recommendations, the feedback actions.
 */
export function TrackShelf({
  title,
  description,
  action,
  tracks,
  recommendation = false,
  loading = false,
  loadingLabel = 'Loading',
  emptyState,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Also the playback queue for every card, exactly like the classic shelf. */
  tracks: Track[];
  recommendation?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Shown instead of the scroller when the shelf is loaded but empty. */
  emptyState?: ReactNode;
}) {
  const id = useId();
  const playback = usePlayback();
  const trackMenu = useTrackMenu();

  if (!loading && tracks.length === 0) {
    if (!emptyState) return null;
    return (
      <section className={s.section} aria-labelledby={id}>
        <SectionHeader id={id} title={title} description={description} action={action} />
        {emptyState}
      </section>
    );
  }

  const headerAction = loading ? (
    <>
      <span role="status" className={s.srOnly}>
        {loadingLabel}
      </span>
      {action}
    </>
  ) : (
    action
  );

  // Remount when loading ends: the scroller only re-measures its overflow on scroll
  // and resize, so its nav buttons would otherwise miss the swap from skeletons to cards.
  return (
    <Shelf key={loading ? 'loading' : 'ready'} id={id} title={title} description={description} action={headerAction}>
      {loading ? (
        <ShelfSkeleton />
      ) : (
        tracks.map((track, index) => {
          const state = playback.trackState(track, tracks);
          const name = track.title || 'Untitled';
          return (
            <MediaCard
              key={trackKey(track, index)}
              className={s.mediaCard}
              title={name}
              subtitle={artistNames(track)}
              artwork={<TrackArtwork track={track} />}
              onOpen={state.onPlay}
              onPlay={state.onTogglePlayback}
              playLabel={state.playing ? `Pause ${name}` : `Play ${name}`}
              active={state.active}
              playing={state.playing}
              menu={trackMenu(track, { recommendation })}
            />
          );
        })
      )}
    </Shelf>
  );
}
