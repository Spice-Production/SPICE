'use client';

import { useId, useMemo } from 'react';

import type { Track } from '../../../spice-app';
import { usePlayback, useTrackMenu } from '../../actions';
import { useSpiceUi } from '../../context';
import { TrackList, type TrackRowOptions } from '../../media';
import { EmptyState, SectionHeader, Skeleton } from '../../primitives';
import s from '../home.module.css';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'];

function QuickPicksSkeleton() {
  return (
    <div className={s.quickSkeleton} aria-hidden="true">
      {SKELETON_ROWS.map((key) => (
        <div key={key} className={s.quickSkeletonRow}>
          <Skeleton width={36} height={36} radius="var(--sx-art-radius)" />
          <div className={s.quickSkeletonText}>
            <Skeleton height={12} width="62%" />
            <Skeleton height={10} width="38%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Trending tracks (reordered for this profile's taste), as a compact two-column list. */
export function QuickPicks() {
  const m = useSpiceUi();
  const id = useId();
  const playback = usePlayback();
  const trackMenu = useTrackMenu();
  const trending = m.homeTrending;
  // The classic grid skips the first trending track and shows the next six.
  const picks = useMemo(() => trending.slice(1, 7), [trending]);

  const getRowOptions = (track: Track): TrackRowOptions => {
    // Each pick queues the whole trending list, like the classic Quick Picks grid.
    const state = playback.trackState(track, trending);
    return {
      active: state.active,
      playing: state.playing,
      onPlay: state.onPlay,
      onTogglePlayback: state.onTogglePlayback,
      liked: m.likedTracks.has(track.id),
      onToggleLike: () => m.toggleLike(track),
      menu: trackMenu(track),
    };
  };

  return (
    <section className={s.section} aria-labelledby={id} aria-busy={m.isLoadingHome || undefined}>
      <SectionHeader id={id} title="Quick picks" description="Trending now, ordered for your taste." />
      {m.isLoadingHome ? (
        <>
          <span role="status" className={s.srOnly}>
            Loading quick picks
          </span>
          <QuickPicksSkeleton />
        </>
      ) : picks.length > 0 ? (
        <TrackList
          tracks={picks}
          getRowOptions={getRowOptions}
          ariaLabel="Quick picks"
          showIndex={false}
          dense
          className={s.quickList}
        />
      ) : (
        <EmptyState
          icon="trendingUp"
          title="No quick picks right now"
          description="Trending tracks will appear here as soon as they are available."
        />
      )}
    </section>
  );
}
