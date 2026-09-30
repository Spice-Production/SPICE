'use client';

/* eslint-disable @next/next/no-img-element -- decorative artwork tint uses an arbitrary remote URL. */

/**
 * Full-screen expanded now-playing view. Mirrors the classic overlay
 * (app/spice-app.tsx ~20240-20757): same artwork/title/seek/transport, the
 * three tabs (lyrics/queue/controls), and the same view-mode transitions —
 * including the asymmetry where the header's mini-player shortcut does not
 * close the queue/lyrics drawers but the bar's does (see player-bar.tsx).
 */

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useTrackMenu } from '../actions';
import { useSpiceUi } from '../context';
import { artistNames, TrackArtwork } from '../media';
import { DropdownMenu, IconButton, Portal, Tabs } from '../primitives';
import { DevicePicker } from './device-picker';
import { LyricsHeader, LyricsView } from './lyrics-view';
import { QueueContent } from './queue-panel';
import { SeekRow, TransportButtons, VolumeControl } from './transport';
import s from './now-playing.module.css';

function persistViewMode(mode: 'bar' | 'expanded' | 'mini') {
  try {
    localStorage.setItem('spice_player_view_mode', mode);
  } catch {
    // Best-effort persistence only.
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside the full-screen view (the page underneath is fully
 * covered), and Escape collapses it. Menus, popovers, and dialogs portal
 * outside this element, so keys pressed there are left alone.
 */
function handleOverlayKeys(event: ReactKeyboardEvent<HTMLElement>, collapse: () => void) {
  const root = event.currentTarget;
  if (!root.contains(event.target as Node)) return;
  if (event.key === 'Escape') {
    collapse();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getClientRects().length > 0);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const TAB_ITEMS = [
  { value: 'lyrics' as const, label: 'Lyrics', icon: 'mic' as const },
  { value: 'queue' as const, label: 'Up next', icon: 'list' as const },
  { value: 'controls' as const, label: 'Controls', icon: 'audioLines' as const },
];

function AudioVisualizer() {
  const m = useSpiceUi();
  // Same motion formula as the classic view, drawn as a thin centered waveform.
  const bars = Array.from({ length: 48 }, (_, i) => {
    const base = 20 + Math.abs(Math.sin((i + m.playerProgress) * 0.5)) * 60;
    const height = m.playerIsPlaying ? base + Math.abs(Math.sin(i * 12.9898 + m.playerProgress)) * 20 : 15;
    return Math.min(100, Math.max(5, height)) * 0.55;
  });
  return (
    <div className={s.visualizer} aria-hidden="true">
      {bars.map((height, index) => (
        <span key={index} className={s.visualizerBar} style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export function NowPlaying() {
  const m = useSpiceUi();
  const trackMenuFor = useTrackMenu();
  const collapseRef = useRef<HTMLButtonElement>(null);
  const liked = m.likedTracks.has(m.playerTrack.id);
  const menuEntries = trackMenuFor(m.playerTrack);
  const tintUrl = m.playerTrack.artworkUrl || m.playerTrack.album?.artworkUrl;

  // Move focus into the overlay on open (it renders after the whole page in
  // the DOM) and hand it back to whatever opened it on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    collapseRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  const toBar = () => {
    m.setPlayerViewMode('bar');
    persistViewMode('bar');
  };
  const toMini = () => {
    m.setPlayerViewMode('mini');
    persistViewMode('mini');
  };

  return (
    <Portal>
      <div
        className={s.overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Now playing"
        onKeyDown={(event) => handleOverlayKeys(event, toBar)}
      >
        <div className={s.bgTint}>{tintUrl ? <img src={tintUrl} alt="" className={s.bgTintImg} /> : null}</div>

        <header className={s.header}>
          <IconButton ref={collapseRef} icon="chevronDown" label="Collapse to player bar" onClick={toBar} />
          <div className={s.headerCenter}>
            <span className={s.headerEyebrow}>Now playing</span>
            {m.isControllingRemoteReceiver ? <span className={s.headerReceiver}>{m.receiverLabel}</span> : null}
          </div>
          <div className={s.headerActions}>
            {menuEntries.length > 0 ? (
              <DropdownMenu
                items={menuEntries}
                label={`${m.playerTrack.title} actions`}
                trigger={(props) => <IconButton {...props} icon="more" label="More actions" />}
              />
            ) : null}
            <IconButton icon="minimize" label="Floating mini player" onClick={toMini} />
          </div>
        </header>

        <div className={s.body}>
          <div className={s.grid}>
            <div className={s.leftCol}>
              <TrackArtwork track={m.playerTrack} className={s.art} eager />
              <div className={s.meta}>
                <h2 className={s.trackTitle} title={m.playerTrack.title}>
                  {m.playerTrack.title}
                </h2>
                <p className={s.trackArtist}>
                  {m.isControllingRemoteReceiver ? `${m.receiverLabel} - ` : ''}
                  {artistNames(m.playerTrack)}
                </p>
              </div>
              <div className={s.quickActions}>
                <IconButton
                  icon="heart"
                  label={liked ? 'Unlike' : 'Like'}
                  active={liked}
                  filled={liked}
                  disabled={m.playerIsPlaceholder}
                  onClick={() => m.toggleLike(m.playerTrack)}
                />
                <IconButton
                  icon="listPlus"
                  label="Add to playlist"
                  disabled={m.playerIsPlaceholder}
                  onClick={() => m.openPlaylistPicker(m.playerTrack)}
                />
                <IconButton
                  icon="share"
                  label="Share"
                  disabled={m.playerIsPlaceholder}
                  onClick={() => m.shareSongLink(m.playerTrack)}
                />
                <IconButton
                  icon="users"
                  label="Listen Together"
                  active={Boolean(m.listenTogetherSession || m.listenTogetherHostSessionId)}
                  onClick={() => m.setListenTogetherDialogOpen(true)}
                />
              </div>
              <SeekRow className={s.seek} />
              <TransportButtons size="lg" />
              <div className={s.volumeRow}>
                <VolumeControl size="lg" showBoostToggle />
                <DevicePicker variant="expanded" />
              </div>
            </div>

            <div className={s.rightCol}>
              <Tabs value={m.expandedTab} onValueChange={m.setExpandedTab} items={TAB_ITEMS} label="Expanded player panels" fullWidth />
              <div className={s.tabPanel}>
                {m.expandedTab === 'lyrics' ? (
                  <div className={s.lyricsPane}>
                    <LyricsHeader />
                    <LyricsView className={s.lyricsScroll} />
                  </div>
                ) : null}
                {m.expandedTab === 'queue' ? (
                  <div className={s.queuePane}>
                    <QueueContent />
                  </div>
                ) : null}
                {m.expandedTab === 'controls' ? <AudioVisualizer /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
