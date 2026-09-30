'use client';

/**
 * Floating, draggable mini player. Mirrors the classic widget
 * (app/spice-app.tsx ~20758-21251): same drag handlers/position state, the
 * prev/play/next-only transport, and the inline lyrics/queue toggles.
 */

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { artistNames, TrackArtwork } from '../media';
import { IconButton, useIsMobile } from '../primitives';
import { DevicePicker } from './device-picker';
import { LyricsCompact } from './lyrics-view';
import { MiniQueueList } from './queue-panel';
import { SeekSlider, TransportButtons, VolumeControl } from './transport';
import s from './mini-player.module.css';

function persistViewMode(mode: 'bar' | 'expanded' | 'mini') {
  try {
    localStorage.setItem('spice_player_view_mode', mode);
  } catch {
    // Best-effort persistence only.
  }
}

export function MiniPlayer() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const liked = m.likedTracks.has(m.playerTrack.id);
  const actionSize = isMobile ? 'md' : 'sm';

  const toBar = () => {
    m.setPlayerViewMode('bar');
    persistViewMode('bar');
  };
  const toExpanded = () => {
    m.setPlayerViewMode('expanded');
    persistViewMode('expanded');
  };

  const style = m.miniPlayerPos ? { left: m.miniPlayerPos.x, top: m.miniPlayerPos.y } : undefined;

  return (
    <section
      aria-label="Mini player"
      className={s.card}
      style={style}
      data-positioned={m.miniPlayerPos ? 'true' : undefined}
      data-dragging={m.isDraggingMini || undefined}
      onPointerDown={m.handleMiniPointerDown}
      onPointerMove={m.handleMiniPointerMove}
      onPointerUp={m.handleMiniPointerUp}
    >
      <div className={s.main}>
        <button
          type="button"
          className={s.artButton}
          title={m.playerIsPlaying ? 'Pause' : 'Play'}
          aria-label={m.playerIsPlaying ? 'Pause' : 'Play'}
          onClick={m.toggleReceiverPlayPause}
        >
          <TrackArtwork track={m.playerTrack} size={52} />
          <span className={s.artOverlay} aria-hidden="true">
            <Icon name={m.playerIsPlaying ? 'pause' : 'play'} size={18} filled />
          </span>
        </button>
        <div className={s.text}>
          <span className={s.title}>{m.playerTrack.title}</span>
          <span className={s.artist}>
            {m.isControllingRemoteReceiver ? `${m.receiverLabel} - ` : ''}
            {artistNames(m.playerTrack)}
          </span>
          <div className={s.device}>
            <DevicePicker variant="mini" />
          </div>
        </div>
        <TransportButtons size={isMobile ? 'touch' : 'sm'} compact className={s.transport} />
      </div>

      <SeekSlider className={s.seek} />

      <div className={s.tools}>
        <VolumeControl size={isMobile ? 'touch' : 'sm'} showValue fluid />
        <div className={s.actions}>
          <IconButton
            icon="heart"
            label={liked ? 'Unlike' : 'Like'}
            active={liked}
            filled={liked}
            size={actionSize}
            disabled={m.playerIsPlaceholder}
            onClick={() => m.toggleLike(m.playerTrack)}
          />
          <IconButton
            icon="listPlus"
            label="Add to playlist"
            size={actionSize}
            disabled={m.playerIsPlaceholder}
            onClick={() => m.openPlaylistPicker(m.playerTrack)}
          />
          <IconButton icon="share" label="Share" size={actionSize} disabled={m.playerIsPlaceholder} onClick={() => m.shareSongLink(m.playerTrack)} />
          <IconButton
            icon="users"
            label="Listen Together"
            size={actionSize}
            active={Boolean(m.listenTogetherSession || m.listenTogetherHostSessionId)}
            onClick={() => m.setListenTogetherDialogOpen(true)}
          />
          <IconButton
            icon="list"
            label="Toggle mini queue"
            size={actionSize}
            active={m.showMiniQueue}
            aria-pressed={m.showMiniQueue}
            onClick={() => m.setShowMiniQueue(!m.showMiniQueue)}
          />
          <IconButton
            icon="mic"
            label="Toggle lyrics"
            size={actionSize}
            active={m.showMiniLyrics}
            aria-pressed={m.showMiniLyrics}
            disabled={m.isControllingRemoteReceiver}
            onClick={() => !m.isControllingRemoteReceiver && m.setShowMiniLyrics(!m.showMiniLyrics)}
          />
          <IconButton icon="maximize" label="Expand player" size={actionSize} onClick={toExpanded} />
          <IconButton icon="x" label="Minimize to bar" size={actionSize} onClick={toBar} />
        </div>
      </div>

      {m.showMiniLyrics ? (
        <div className={s.panel}>
          <LyricsCompact />
        </div>
      ) : null}

      {m.showMiniQueue ? (
        <div className={s.panel}>
          <MiniQueueList />
        </div>
      ) : null}
    </section>
  );
}
