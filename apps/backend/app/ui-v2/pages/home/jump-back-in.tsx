'use client';

import { useId, useMemo, type ReactNode } from 'react';

import type { Playlist, Track } from '../../../spice-app';
import { useNavigation, usePlayback } from '../../actions';
import { useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { artistNames, formatCount, NowPlayingBars, PlaylistArtwork, TileGrid, TrackArtwork, trackKey } from '../../media';
import s from '../home.module.css';

const JUMP_BACK_LIMIT = 8;
const JUMP_BACK_PLAYLIST_SHARE = 4;

type JumpItem = { kind: 'playlist'; playlist: Playlist } | { kind: 'track'; track: Track };

/** Up to four playlists, recent tracks for the rest, then more playlists if room remains. */
function pickJumpItems(playlists: Playlist[], recent: Track[]): JumpItem[] {
  const leadPlaylists = playlists.slice(0, JUMP_BACK_PLAYLIST_SHARE);
  const tracks = recent.slice(0, JUMP_BACK_LIMIT - leadPlaylists.length);
  const room = JUMP_BACK_LIMIT - leadPlaylists.length - tracks.length;
  const morePlaylists = room > 0 ? playlists.slice(leadPlaylists.length, leadPlaylists.length + room) : [];
  return [
    ...[...leadPlaylists, ...morePlaylists].map((playlist): JumpItem => ({ kind: 'playlist', playlist })),
    ...tracks.map((track): JumpItem => ({ kind: 'track', track })),
  ];
}

function JumpTile({
  title,
  meta,
  artwork,
  onOpen,
  openLabel,
  onPlay,
  playLabel,
  playFocusable,
  active,
  playing,
}: {
  title: string;
  meta: string;
  artwork: ReactNode;
  onOpen: () => void;
  openLabel: string;
  onPlay?: () => void;
  playLabel: string;
  /** False when the play button repeats the tile's own action (keyboard users use the tile). */
  playFocusable: boolean;
  active?: boolean;
  playing?: boolean;
}) {
  return (
    <div className={s.jumpTile} data-active={active ? 'true' : undefined}>
      <button type="button" className={s.jumpMain} onClick={onOpen} aria-label={openLabel} aria-current={active ? 'true' : undefined}>
        <span className={s.jumpArt}>{artwork}</span>
        <span className={s.jumpText}>
          <span className={s.jumpTitle}>{title}</span>
          <span className={s.jumpMeta}>
            {active ? <NowPlayingBars paused={!playing} /> : null}
            <span className={s.jumpMetaText}>{meta}</span>
          </span>
        </span>
      </button>
      {onPlay ? (
        <button
          type="button"
          className={s.jumpPlay}
          onClick={onPlay}
          aria-label={playLabel}
          title={playLabel}
          tabIndex={playFocusable ? undefined : -1}
          aria-hidden={playFocusable ? undefined : true}
        >
          <Icon name={active && playing ? 'pause' : 'play'} size={14} filled />
        </button>
      ) : null}
    </div>
  );
}

/** Quick-access grid at the top of Home: your playlists and what you played last. */
export function JumpBackIn() {
  const m = useSpiceUi();
  const headingId = useId();
  const { openPlaylist } = useNavigation();
  const playback = usePlayback();
  const playlists = m.customPlaylists;
  const recent = m.homeHistoryShelves.recentlyPlayed;
  const items = useMemo(() => pickJumpItems(playlists, recent), [playlists, recent]);

  if (items.length === 0) return null;

  return (
    <section className={s.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={s.srOnly}>
        Jump back in
      </h2>
      <TileGrid className={s.jumpGrid}>
        {items.map((item, index) => {
          if (item.kind === 'playlist') {
            const { playlist } = item;
            const count = playlist.tracks.length;
            return (
              <JumpTile
                key={`playlist:${playlist.id}`}
                title={playlist.title}
                meta={`Playlist · ${formatCount(count, 'track')}${playlist.shared ? ' · Shared' : ''}`}
                artwork={<PlaylistArtwork playlist={playlist} fallbackGradient={m.PRESET_GRADIENTS[0]} />}
                onOpen={() => openPlaylist(playlist)}
                openLabel={`Open playlist ${playlist.title}`}
                onPlay={count > 0 ? () => playback.playAll(playlist.tracks, 0, playlist.id) : undefined}
                playLabel={`Play ${playlist.title}`}
                playFocusable
              />
            );
          }
          const { track } = item;
          const name = track.title || 'Untitled';
          // Same queue the classic "Recently Played" carousel uses.
          const state = playback.trackState(track, recent);
          return (
            <JumpTile
              key={`track:${trackKey(track, index)}`}
              title={name}
              meta={artistNames(track)}
              artwork={<TrackArtwork track={track} />}
              onOpen={state.onPlay}
              openLabel={`Play ${name}`}
              onPlay={state.onTogglePlayback}
              playLabel={state.playing ? `Pause ${name}` : state.active ? `Resume ${name}` : `Play ${name}`}
              playFocusable={state.active}
              active={state.active}
              playing={state.playing}
            />
          );
        })}
      </TileGrid>
    </section>
  );
}
