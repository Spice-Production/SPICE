'use client';

import { useState } from 'react';

import type { Track } from '../../../spice-app';
import { usePlayback, useTrackMenu } from '../../actions';
import { useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { artistNames, formatCount, formatDurationMs, NowPlayingBars, TrackArtwork, type TrackRowOptions } from '../../media';
import { Badge, Card, DropdownMenu, IconButton, Skeleton, useMediaQuery, VisuallyHidden, type MenuEntry } from '../../primitives';
import s from '../search.module.css';

const SOURCE_ICONS: Record<string, IconName> = {
  'Offline Library': 'hardDrive',
  SoundCloud: 'cloud',
  'YouTube Video': 'video',
  'YouTube Music': 'youtube',
};

/** Where a result streams from (the classic inline source badge). Icon-only on phones. */
export function SourceBadge({ track }: { track: Track }) {
  const m = useSpiceUi();
  const label = m.trackSourceLabel(track);
  return (
    <Badge variant="outline" icon={SOURCE_ICONS[label] ?? 'music'} className={s.sourceBadge} title={label}>
      <span className={s.sourceLabel}>{label}</span>
    </Badge>
  );
}

/**
 * One-step "add to playlist" menu (the classic per-row playlist select):
 * same handler and notices; entries are only built while the menu is open.
 */
export function QuickAddMenu({ track, className, size = 'sm' }: { track: Track; className?: string; size?: 'sm' | 'md' }) {
  const m = useSpiceUi();
  const [open, setOpen] = useState(false);
  const title = track.title || 'Untitled';

  const addTo = async (playlistId: string) => {
    const added = await m.addTrackToPlaylist(track, playlistId);
    if (added) m.showSpiceNotice('Added track to playlist.', 'success');
    else m.showSpiceNotice('Song already in playlist.', 'info');
  };

  const items: MenuEntry[] = open
    ? [
        { type: 'label', key: 'label', label: 'Add to playlist' },
        ...m.allEditablePlaylists.map((playlist): MenuEntry => {
          const saved = playlist.tracks.some((entry) => entry.id === track.id);
          return {
            key: playlist.id,
            label: playlist.title,
            icon: saved ? 'check' : 'listMusic',
            description: saved
              ? 'Already added'
              : playlist.shared
                ? 'Shared playlist'
                : formatCount(playlist.tracks.length, 'song'),
            onSelect: () => {
              void addTo(playlist.id);
            },
          };
        }),
      ]
    : [];

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      items={items}
      width={260}
      label={`Add ${title} to a playlist`}
      trigger={(props) => (
        <IconButton {...props} icon="listPlus" label={`Add ${title} to a playlist`} size={size} className={className} />
      )}
    />
  );
}

/**
 * Row behavior shared by every search list: play with the given queue, like,
 * source badge, the standard track menu, and (optionally) the quick-add menu.
 */
export function useSearchRowOptions() {
  const m = useSpiceUi();
  const playback = usePlayback();
  const trackMenu = useTrackMenu();
  // Matches the TrackList breakpoint that hides the duration column.
  const compact = useMediaQuery('(max-width: 640px)');
  const canQuickAdd = m.allEditablePlaylists.length > 0;
  return (track: Track, queue: Track[], { quickAdd = false }: { quickAdd?: boolean } = {}): TrackRowOptions => {
    const state = playback.trackState(track, queue);
    const duration = compact ? formatDurationMs(track.durationMs) : '';
    return {
      active: state.active,
      playing: state.playing,
      onPlay: state.onPlay,
      onTogglePlayback: state.onTogglePlayback,
      liked: m.likedTracks.has(track.id),
      onToggleLike: () => m.toggleLike(track),
      subtitle: duration ? `${artistNames(track)} · ${duration}` : undefined,
      subtitleExtra: <SourceBadge track={track} />,
      menu: trackMenu(track),
      trailing: quickAdd && canQuickAdd ? <QuickAddMenu track={track} className={s.rowHoverAction} /> : undefined,
    };
  };
}

/** Large card for the first result, beside the next few songs. */
export function TopResultCard({ track, queue }: { track: Track; queue: Track[] }) {
  const m = useSpiceUi();
  const playback = usePlayback();
  const trackMenu = useTrackMenu();
  const state = playback.trackState(track, queue);
  const liked = m.likedTracks.has(track.id);
  const title = track.title || 'Untitled';
  const artists = artistNames(track);
  const duration = formatDurationMs(track.durationMs);
  return (
    <Card className={s.topCard}>
      <button type="button" className={s.topMain} onClick={state.onPlay} aria-label={`Play ${title}`}>
        <span className={s.topArt}>
          <TrackArtwork track={track} eager />
        </span>
        <span className={s.topText}>
          <span className={s.topTitle} data-active={state.active ? 'true' : undefined}>
            {title}
          </span>
          <span className={s.topArtists}>{artists || 'Unknown artist'}</span>
        </span>
      </button>
      <div className={s.topFooter}>
        <div className={s.topMeta}>
          <SourceBadge track={track} />
          {duration ? <span className={s.topDuration}>{duration}</span> : null}
          {state.active ? (
            <span className={s.topNowPlaying}>
              <NowPlayingBars paused={!state.playing} />
              {state.playing ? 'Playing' : 'Paused'}
            </span>
          ) : null}
        </div>
        <div className={s.topActions}>
          <IconButton
            icon="heart"
            filled={liked}
            active={liked}
            label={liked ? `Unlike ${title}` : `Like ${title}`}
            onClick={() => m.toggleLike(track)}
          />
          {m.allEditablePlaylists.length > 0 ? <QuickAddMenu track={track} size="md" /> : null}
          <DropdownMenu
            items={trackMenu(track)}
            label={`${title} actions`}
            trigger={(props) => <IconButton {...props} icon="more" label={`More actions for ${title}`} />}
          />
          <button
            type="button"
            className={s.playFab}
            onClick={state.onTogglePlayback}
            aria-label={state.playing ? `Pause ${title}` : `Play ${title}`}
            title={state.playing ? 'Pause' : 'Play'}
          >
            <Icon name={state.playing ? 'pause' : 'play'} size={18} filled />
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Placeholder rows shaped like TrackList rows. */
export function SkeletonRows({ count: rows = 5, label }: { count?: number; label: string }) {
  return (
    <div className={s.skeletonList} role="status" aria-live="polite">
      <VisuallyHidden>{label}</VisuallyHidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={s.skeletonRow} aria-hidden="true">
          <Skeleton width={40} height={40} radius="var(--sx-art-radius)" />
          <div className={s.skeletonText}>
            <Skeleton width={`${58 - (index % 3) * 12}%`} height={12} />
            <Skeleton width={`${34 - (index % 2) * 8}%`} height={10} />
          </div>
          <Skeleton width={32} height={10} className={s.skeletonTrailing} />
        </div>
      ))}
    </div>
  );
}
