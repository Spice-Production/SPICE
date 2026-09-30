'use client';

import { useMemo, useState } from 'react';

import type { Track } from '../../../spice-app';
import { usePlayback, useTrackMenu } from '../../actions';
import { useSpiceUi } from '../../context';
import { formatCount, TrackList } from '../../media';
import { Button, DropdownMenu, EmptyState, IconButton, SectionHeader, type MenuEntry } from '../../primitives';
import s from '../library.module.css';
import { useFindSongs } from './helpers';

function hasAlbumTitles(tracks: Track[]) {
  return tracks.some((track) => Boolean(track.album?.title));
}

/**
 * The classic per-row "+ Add Playlist" select from History: adds straight to
 * an editable playlist with the same notices. Entries are only built while
 * the menu is open.
 */
function QuickAddMenu({ track }: { track: Track }) {
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
        ...m.allEditablePlaylists.map(
          (playlist): MenuEntry => {
            const saved = playlist.tracks.some((entry) => entry.id === track.id);
            return {
              key: playlist.id,
              label: playlist.title,
              icon: saved ? 'check' : 'listMusic',
              description: saved ? 'Already added' : playlist.shared ? 'Shared playlist' : formatCount(playlist.tracks.length, 'song'),
              onSelect: () => {
                void addTo(playlist.id);
              },
            };
          },
        ),
      ]
    : [];

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      items={items}
      width={260}
      label={`Add ${title} to a playlist`}
      trigger={(props) => <IconButton {...props} icon="listPlus" label={`Add ${title} to a playlist`} size="sm" className={s.quickAdd} />}
    />
  );
}

function FindSongsButton() {
  const findSongs = useFindSongs();
  return (
    <Button variant="outline" icon="search" onClick={findSongs}>
      Find songs
    </Button>
  );
}

/** Liked Songs: plays the single track (classic click handler), heart unlikes it. */
export function LikedView() {
  const m = useSpiceUi();
  const { isActive } = usePlayback();
  const trackMenu = useTrackMenu();
  const tracks = m.likedTracksList;
  const showAlbum = useMemo(() => hasAlbumTitles(tracks), [tracks]);

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon="heart"
        title="Songs you like will appear here"
        description="Tap the heart icon next to any search result to save tracks."
        action={<FindSongsButton />}
      />
    );
  }

  return (
    <section aria-labelledby="library-liked-title">
      <SectionHeader id="library-liked-title" title="Liked Songs" description={formatCount(tracks.length, 'song')} />
      <TrackList
        tracks={tracks}
        ariaLabel="Liked songs"
        resetKey="library:liked"
        showHeader
        showMeta={showAlbum}
        metaLabel="Album"
        getRowOptions={(song) => {
          const active = isActive(song);
          const play = m.getLikedTrackClickHandler(song);
          return {
            active,
            playing: active && m.playerIsPlaying,
            onPlay: play,
            onTogglePlayback: active ? m.toggleReceiverPlayPause : play,
            liked: true,
            // Same as getLikedTrackToggleHandler minus the row-click stopPropagation.
            onToggleLike: () => m.toggleLike(song),
            meta: song.album?.title,
            menu: trackMenu(song),
          };
        }}
      />
    </section>
  );
}

/** Recently played: plays with the whole history as the queue; Clear asks first. */
export function HistoryView() {
  const m = useSpiceUi();
  const { trackState } = usePlayback();
  const trackMenu = useTrackMenu();
  const tracks = m.history;
  const showAlbum = useMemo(() => hasAlbumTitles(tracks), [tracks]);
  const canQuickAdd = m.allEditablePlaylists.length > 0;

  return (
    <section aria-labelledby="library-history-title">
      <SectionHeader
        id="library-history-title"
        title="Recently played"
        description={tracks.length > 0 ? formatCount(tracks.length, 'track') : 'Tracks you play on this profile'}
        action={
          tracks.length > 0 ? (
            <Button variant="outline" icon="trash" onClick={m.clearHistory}>
              Clear history
            </Button>
          ) : null
        }
      />
      {tracks.length === 0 ? (
        <EmptyState
          icon="history"
          title="No playback history yet"
          description="Tracks you listen to will be preserved locally in chronological order."
          action={<FindSongsButton />}
        />
      ) : (
        <TrackList
          tracks={tracks}
          ariaLabel="Recently played tracks"
          resetKey="library:history"
          className={s.historyList}
          showHeader
          showMeta={showAlbum}
          metaLabel="Album"
          getRowOptions={(song) => {
            const playback = trackState(song, tracks);
            return {
              active: playback.active,
              playing: playback.playing,
              onPlay: playback.onPlay,
              onTogglePlayback: playback.onTogglePlayback,
              liked: m.likedTracks.has(song.id),
              onToggleLike: () => m.toggleLike(song),
              meta: song.album?.title,
              trailing: canQuickAdd ? <QuickAddMenu track={song} /> : undefined,
              menu: trackMenu(song),
            };
          }}
        />
      )}
    </section>
  );
}
