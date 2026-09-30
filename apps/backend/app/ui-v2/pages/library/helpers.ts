'use client';

/**
 * Library/playlist helpers: display formatting plus the "is this list the
 * current queue" check that drives list-level play/pause buttons.
 */

import { useMemo } from 'react';

import type { AppPage, Playlist, Track } from '../../../spice-app';
import { isRealTrack } from '../../actions';
import { useSpiceUi } from '../../context';

/** "1 hr 23 min", "23 min 12 sec", "45 sec" (empty when unknown). */
export function formatTotalDuration(totalMs: number) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return '';
  const totalSeconds = Math.round(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  if (minutes > 0) return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
  return `${seconds} sec`;
}

export function totalDurationMs(tracks: Track[]) {
  let total = 0;
  for (const track of tracks) {
    if (track.durationMs && Number.isFinite(track.durationMs) && track.durationMs > 0) total += track.durationMs;
  }
  return total;
}

/** Cloud playlists carry ISO timestamps; locally created ones are already formatted. */
export function formatPlaylistDate(value: string | undefined) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
  return value;
}

/** Per-file size exactly as the classic Downloads list prints it. */
export function formatMegabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Legacy snapshots sometimes stored a serialized object as the description. */
export function playlistDescription(playlist: Pick<Playlist, 'description'>) {
  const description = playlist.description;
  return description && description !== '[object Object]' ? description : '';
}

const BACK_LABELS: Record<AppPage, string> = {
  home: 'Back to Home',
  search: 'Back to Search',
  library: 'Back to Library',
  account: 'Back to Account',
  settings: 'Back to Settings',
};

/** Closing a playlist returns to the profile it was opened from, else the current page. */
export function playlistBackLabel(page: AppPage, fromProfile: boolean) {
  if (fromProfile) return 'Back to Profile';
  return BACK_LABELS[page] ?? 'Back';
}

/**
 * True when the player's queue was started from this track list (the active
 * track is in it and the queue holds exactly its tracks, in any order so
 * shuffle play still counts). A song that merely also appears in another
 * playlist does not make that playlist "current".
 */
export function isQueueFromTracks(tracks: Track[], activeId: string | null, queue: Track[]) {
  if (!activeId || tracks.length === 0 || queue.length !== tracks.length) return false;
  const ids = new Set(tracks.map((track) => track.id));
  return ids.has(activeId) && queue.every((track) => ids.has(track.id));
}

export function useActiveTrackId() {
  const m = useSpiceUi();
  return isRealTrack(m.playerTrack) ? m.playerTrack.id : null;
}

/** Ids of the library playlists whose tracks are the current queue. */
export function useCurrentPlaylistIds() {
  const m = useSpiceUi();
  const activeId = useActiveTrackId();
  const playlists = m.customPlaylists;
  const queue = m.playerQueue;
  return useMemo(() => {
    const ids = new Set<string>();
    if (!activeId) return ids;
    for (const playlist of playlists) {
      if (isQueueFromTracks(playlist.tracks, activeId, queue)) ids.add(playlist.id);
    }
    return ids;
  }, [activeId, playlists, queue]);
}

/**
 * List-level play button behavior shared by cards, rows, and the playlist
 * hero: pause/resume when the list is the current queue, otherwise start it
 * from the first track exactly like the classic "Play all".
 */
export function usePlaylistPlayback() {
  const m = useSpiceUi();
  return (playlist: Playlist, isCurrent: boolean) => {
    if (isCurrent) {
      m.toggleReceiverPlayPause();
      return;
    }
    if (playlist.tracks.length > 0) {
      m.startTrackOnActiveReceiver(playlist.tracks[0], playlist.tracks, playlist.id);
    }
  };
}

/**
 * Opens the shared "Edit details" dialog pre-filled from the playlist, like
 * the classic hero button. Visibility is pre-filled too so saving an
 * unrelated change never flips a private playlist back to public.
 */
export function useOpenPlaylistEditor() {
  const m = useSpiceUi();
  return (playlist: Playlist) => {
    m.setEditPlTitle(playlist.title);
    m.setEditPlDesc(playlist.description || '');
    m.setEditPlGradient(playlist.gradient);
    m.setEditPlCoverUrl(playlist.coverUrl || '');
    m.setEditPlIsPublic(playlist.isPublic !== false);
    m.setShowEditPlaylistDialog(true);
  };
}

/** The classic empty-playlist "Search Tracks" action. */
export function useFindSongs() {
  const m = useSpiceUi();
  return () => {
    m.setSelectedPlaylist(null);
    m.setSelectedUser(null);
    m.setCurrentPage('search');
  };
}
