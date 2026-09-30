'use client';

import type { ReactNode } from 'react';

import type { Playlist } from '../../../spice-app';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { CardGrid, formatCount, MediaCard, NowPlayingBars, PlaylistArtwork } from '../../media';
import { IconButton, type MenuEntry } from '../../primitives';
import s from '../library.module.css';
import { useCurrentPlaylistIds, usePlaylistPlayback } from './helpers';

/** "12 songs" plus "by Owner" for shared playlists someone else owns (classic card copy). */
function playlistSubtitle(playlist: Playlist, shared: boolean) {
  const songs = formatCount(playlist.tracks.length, 'song');
  if (shared && playlist.ownerDisplayName && playlist.shareRole !== 'owner') return `${songs} · by ${playlist.ownerDisplayName}`;
  return songs;
}

function SharedRoleBadge({ playlist, className }: { playlist: Playlist; className?: string }) {
  const own = playlist.shareRole === 'owner';
  return (
    <span className={className} title={own ? 'Shared playlist you own' : 'Shared with you'}>
      <Icon name={own ? 'userCheck' : 'users'} size={11} />
      {own ? 'Yours' : 'Shared'}
    </span>
  );
}

/**
 * Library playlists as a card grid or compact rows (Settings-free per-view
 * toggle: `libraryView`). Opening sets `selectedPlaylist`, like the classic
 * cards; the play control starts the playlist or pauses it when current.
 */
export function PlaylistCollection({
  playlists,
  view,
  shared = false,
  ariaLabel,
  empty,
}: {
  playlists: Playlist[];
  view: 'grid' | 'list';
  /** Shared playlists show the Yours/Shared role and the owner name. */
  shared?: boolean;
  ariaLabel: string;
  empty: ReactNode;
}) {
  const m = useSpiceUi();
  const currentIds = useCurrentPlaylistIds();
  const playPlaylist = usePlaylistPlayback();

  if (playlists.length === 0) return <>{empty}</>;

  const menuFor = (playlist: Playlist, current: boolean, playing: boolean): MenuEntry[] => {
    const entries: MenuEntry[] = [{ key: 'open', label: 'Open playlist', icon: 'listMusic', onSelect: () => m.setSelectedPlaylist(playlist) }];
    if (playlist.tracks.length > 0) {
      entries.push(
        {
          key: 'play',
          label: current && playing ? 'Pause' : current ? 'Resume' : 'Play',
          icon: current && playing ? 'pause' : 'play',
          onSelect: () => playPlaylist(playlist, current),
        },
        { key: 'shuffle', label: 'Shuffle play', icon: 'shuffle', onSelect: () => m.shufflePlaylistPlay(playlist) },
      );
    }
    return entries;
  };

  if (view === 'grid') {
    return (
      <CardGrid minItemWidth={168} className={s.playlistGrid}>
        {playlists.map((playlist) => {
          const current = currentIds.has(playlist.id);
          const playing = current && m.playerIsPlaying;
          const title = playlist.title || 'Untitled Playlist';
          return (
            <MediaCard
              key={playlist.id}
              title={title}
              subtitle={playlistSubtitle(playlist, shared)}
              artwork={
                <div className={s.cover}>
                  <PlaylistArtwork playlist={playlist} />
                  {shared ? <SharedRoleBadge playlist={playlist} className={s.coverBadge} /> : null}
                </div>
              }
              onOpen={() => m.setSelectedPlaylist(playlist)}
              onPlay={playlist.tracks.length > 0 ? () => playPlaylist(playlist, current) : undefined}
              playLabel={playing ? `Pause ${title}` : `Play ${title}`}
              active={current}
              playing={playing}
              menu={menuFor(playlist, current, playing)}
            />
          );
        })}
      </CardGrid>
    );
  }

  return (
    <ul className={s.playlistList} aria-label={ariaLabel}>
      {playlists.map((playlist) => {
        const current = currentIds.has(playlist.id);
        const playing = current && m.playerIsPlaying;
        const title = playlist.title || 'Untitled Playlist';
        return (
          <li key={playlist.id} className={s.playlistRow} data-active={current ? 'true' : undefined}>
            <button type="button" className={s.playlistRowMain} onClick={() => m.setSelectedPlaylist(playlist)} aria-label={`Open ${title}`}>
              <PlaylistArtwork playlist={playlist} size={48} className={s.playlistRowArt} />
              <span className={s.playlistRowText}>
                <span className={s.playlistRowTitle}>
                  {current ? <NowPlayingBars paused={!playing} /> : null}
                  <span className={s.truncate}>{title}</span>
                </span>
                <span className={s.playlistRowMeta}>
                  {shared ? 'Shared playlist' : 'Playlist'} · {playlistSubtitle(playlist, shared)}
                </span>
              </span>
            </button>
            {shared ? <SharedRoleBadge playlist={playlist} className={s.roleBadge} /> : null}
            {playlist.tracks.length > 0 ? (
              <IconButton
                icon={playing ? 'pause' : 'play'}
                filled
                label={playing ? `Pause ${title}` : `Play ${title}`}
                variant="secondary"
                className={s.playlistRowPlay}
                data-visible={current ? 'true' : undefined}
                onClick={() => playPlaylist(playlist, current)}
              />
            ) : null}
            <Icon name="chevronRight" size={16} className={s.playlistRowChevron} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}
