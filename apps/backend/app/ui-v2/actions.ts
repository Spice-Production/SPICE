'use client';

/**
 * Shared UI v2 behaviors built only from model handlers, so every surface
 * navigates, plays, and exposes track actions exactly like the classic UI.
 */

import type { AppPage, Playlist, Track } from '../spice-app';
import { useSpiceUi } from './context';
import type { MenuEntry } from './primitives';

const PLACEHOLDER_TRACK_IDS = new Set(['placeholder', 'spice-connect-placeholder']);

/** False for the empty-player placeholder tracks SpiceApp uses. */
export function isRealTrack(track: Pick<Track, 'id'> | null | undefined): track is Track {
  return Boolean(track && track.id && !PLACEHOLDER_TRACK_IDS.has(track.id));
}

export function useNavigation() {
  const m = useSpiceUi();
  return {
    currentPage: m.currentPage,
    /** Same as the classic sidebar/command palette: clears playlist and user views. */
    goTo: (page: AppPage) => m.openCommandPage(page),
    /** Opens a playlist over the current page (Back returns to it). */
    openPlaylist: (playlist: Playlist) => m.setSelectedPlaylist(playlist),
    /** Opens another listener's public profile. */
    openUser: (user: unknown) => {
      void m.handleSelectUser(user);
    },
    /** Leaves the playlist/user detail view. */
    closeDetail: () => {
      m.setSelectedPlaylist(null);
      m.setSelectedUser(null);
    },
  };
}

export interface TrackPlaybackState {
  active: boolean;
  playing: boolean;
  /** Starts this track (with its list as the new queue) on the active receiver. */
  onPlay: () => void;
  /** Pauses/resumes when this track is already current, otherwise starts it. */
  onTogglePlayback: () => void;
}

export function usePlayback() {
  const m = useSpiceUi();
  const isActive = (track: Pick<Track, 'id'>) => isRealTrack(m.playerTrack) && m.playerTrack.id === track.id;

  const play = (track: Track, queue?: Track[], playlistOriginId?: string) => {
    m.startTrackOnActiveReceiver(track, queue, playlistOriginId);
  };

  const trackState = (track: Track, queue?: Track[], playlistOriginId?: string): TrackPlaybackState => {
    const active = isActive(track);
    return {
      active,
      playing: active && m.playerIsPlaying,
      onPlay: () => play(track, queue, playlistOriginId),
      onTogglePlayback: () => {
        if (active) m.toggleReceiverPlayPause();
        else play(track, queue, playlistOriginId);
      },
    };
  };

  return {
    isActive,
    isPlaying: (track: Pick<Track, 'id'>) => isActive(track) && m.playerIsPlaying,
    play,
    trackState,
    /** Plays a list from the first track (or a given index). */
    playAll: (tracks: Track[], startIndex = 0, playlistOriginId?: string) => {
      const first = tracks[startIndex];
      if (first) play(first, tracks, playlistOriginId);
    },
    /** True when this list's current track is playing (for list-level play/pause buttons). */
    isListPlaying: (tracks: Track[]) => m.playerIsPlaying && tracks.some((track) => isActive(track)),
    togglePlayPause: m.toggleReceiverPlayPause,
  };
}

export interface TrackMenuOptions {
  /** Adds the recommendation feedback actions (Not for me / Hide / Snooze artist). */
  recommendation?: boolean;
  /** Adds a destructive remove action at the end. */
  onRemove?: () => void;
  removeLabel?: string;
  /** Extra entries appended after the defaults. */
  extra?: ReadonlyArray<MenuEntry>;
}

/** Standard track "more" menu used by every list, card, and the player. */
export function useTrackMenu() {
  const m = useSpiceUi();
  return (track: Track, options: TrackMenuOptions = {}): MenuEntry[] => {
    if (!isRealTrack(track)) return [];
    const liked = m.likedTracks.has(track.id);
    const sourceUrl = m.profileOriginUrl(track);
    const entries: MenuEntry[] = [
      { key: 'add', label: 'Add to playlist', icon: 'listPlus', onSelect: () => m.openPlaylistPicker(track) },
      {
        key: 'like',
        label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs',
        icon: 'heart',
        onSelect: () => m.toggleLike(track),
      },
      { key: 'share', label: 'Share', icon: 'share', onSelect: () => m.shareSongLink(track) },
    ];
    if (sourceUrl) {
      entries.push({
        key: 'source',
        label: `Open in ${m.trackSourceLabel(track)}`,
        icon: 'externalLink',
        onSelect: () => {
          window.open(sourceUrl, '_blank', 'noopener,noreferrer');
        },
      });
    }
    if (options.recommendation) {
      entries.push(
        { type: 'separator', key: 'rec-sep' },
        { key: 'dislike', label: 'Not for me', description: 'Tell SPICE this track is not for you', icon: 'thumbsDown', onSelect: () => m.dislikeRecommendation(track) },
        { key: 'hide', label: 'Hide this track', description: 'Do not recommend this track', icon: 'eyeOff', onSelect: () => m.hideRecommendation(track) },
        { key: 'snooze', label: 'Snooze artist', description: 'Pause this artist for 7 days', icon: 'moon', onSelect: () => m.snoozeRecommendationArtist(track) },
      );
    }
    if (options.extra?.length) entries.push(...options.extra);
    if (options.onRemove) {
      entries.push(
        { type: 'separator', key: 'remove-sep' },
        { key: 'remove', label: options.removeLabel ?? 'Remove from playlist', icon: 'trash', destructive: true, onSelect: options.onRemove },
      );
    }
    return entries;
  };
}
