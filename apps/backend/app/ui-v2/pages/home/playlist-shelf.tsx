'use client';

import { useId } from 'react';

import type { Playlist } from '../../../spice-app';
import { useNavigation, usePlayback } from '../../actions';
import { useSpiceUi } from '../../context';
import { formatCount, MediaCard, PlaylistArtwork, Shelf } from '../../media';
import { Button, useIsMobile, type MenuEntry } from '../../primitives';
import s from '../home.module.css';

/** "Your playlists": every custom playlist; clicking a card opens it. */
export function PlaylistShelf() {
  const m = useSpiceUi();
  const id = useId();
  const isMobile = useIsMobile();
  const { goTo, openPlaylist } = useNavigation();
  const playback = usePlayback();
  const playlists = m.customPlaylists;
  if (playlists.length === 0) return null;

  const playlistMenu = (playlist: Playlist): MenuEntry[] => {
    const empty = playlist.tracks.length === 0;
    return [
      { key: 'open', label: 'Open playlist', icon: 'listMusic', onSelect: () => openPlaylist(playlist) },
      {
        key: 'play',
        label: 'Play',
        icon: 'play',
        disabled: empty,
        onSelect: () => playback.playAll(playlist.tracks, 0, playlist.id),
      },
      { key: 'shuffle', label: 'Shuffle play', icon: 'shuffle', disabled: empty, onSelect: () => m.shufflePlaylistPlay(playlist) },
    ];
  };

  return (
    <Shelf
      id={id}
      title="Your playlists"
      action={
        <Button variant="ghost" size={isMobile ? 'md' : 'sm'} onClick={() => goTo('library')}>
          View all
        </Button>
      }
    >
      {playlists.map((playlist) => {
        const count = playlist.tracks.length;
        return (
          <MediaCard
            key={playlist.id}
            className={s.mediaCard}
            title={playlist.title}
            subtitle={`${formatCount(count, 'track')}${playlist.shared ? ' · Shared' : ''}`}
            artwork={<PlaylistArtwork playlist={playlist} fallbackGradient={m.PRESET_GRADIENTS[0]} />}
            onOpen={() => openPlaylist(playlist)}
            onPlay={count > 0 ? () => playback.playAll(playlist.tracks, 0, playlist.id) : undefined}
            playLabel={`Play ${playlist.title}`}
            menu={playlistMenu(playlist)}
          />
        );
      })}
    </Shelf>
  );
}
