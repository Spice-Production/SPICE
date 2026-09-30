'use client';

/**
 * Bottom/top player bar. Mirrors the classic now-playing footer
 * (app/spice-app.tsx ~19981-20239): same handlers, same guards. Save to
 * playlist, share, and open-source live in the "more" menu next to the like
 * button (useTrackMenu), one click from the bar like the classic row.
 */

import { useTrackMenu } from '../actions';
import { useSpiceUi } from '../context';
import { artistNames, TrackArtwork } from '../media';
import { cn, DropdownMenu, IconButton, useIsMobile } from '../primitives';
import { DevicePicker } from './device-picker';
import { PlayPauseButton, SeekRow, TransportButtons, VolumeControl } from './transport';
import s from './player-bar.module.css';

function persistViewMode(mode: 'bar' | 'expanded' | 'mini') {
  try {
    localStorage.setItem('spice_player_view_mode', mode);
  } catch {
    // Best-effort persistence only.
  }
}

export function PlayerBar() {
  const m = useSpiceUi();
  const isMobile = useIsMobile();
  const trackMenuFor = useTrackMenu();
  const liked = m.likedTracks.has(m.playerTrack.id);

  const openExpanded = () => {
    m.setPlayerViewMode('expanded');
    persistViewMode('expanded');
  };

  const openMini = () => {
    m.setPlayerViewMode('mini');
    persistViewMode('mini');
    m.setShowBarLyrics(false);
    m.setShowQueueDrawer(false);
  };

  if (isMobile) {
    const pct = m.playerDuration > 0 ? Math.min(100, (m.playerProgress / m.playerDuration) * 100) : 0;
    return (
      <div className={s.mobileBar}>
        <div className={s.mobileProgress} aria-hidden="true">
          <div className={s.mobileProgressFill} style={{ width: `${pct}%` }} />
        </div>
        <button type="button" className={s.mobileMain} onClick={openExpanded} title="Expand player view">
          <TrackArtwork track={m.playerTrack} size={40} />
          <span className={s.mobileText}>
            <span className={s.mobileTitle}>{m.playerTrack.title}</span>
            <span className={s.mobileArtist}>
              {m.isControllingRemoteReceiver ? `${m.receiverLabel} - ` : ''}
              {artistNames(m.playerTrack)}
            </span>
          </span>
        </button>
        <IconButton
          icon="heart"
          label={liked ? 'Unlike' : 'Like'}
          active={liked}
          filled={liked}
          disabled={m.playerIsPlaceholder}
          onClick={() => m.toggleLike(m.playerTrack)}
        />
        <PlayPauseButton size="touch" />
      </div>
    );
  }

  const menuEntries = trackMenuFor(m.playerTrack);
  // Same "save" highlight the classic bookmark button showed while the
  // playlist picker was open for the current track.
  const pickerOpenForTrack = Boolean(
    m.playlistPickerTrack && m.playbackTrackKey(m.playlistPickerTrack) === m.playbackTrackKey(m.playerTrack),
  );

  return (
    <div className={s.bar} data-density={m.playerBarDensity}>
      <div className={s.left}>
        <button type="button" className={s.identity} onClick={openExpanded} title="Expand player view">
          <TrackArtwork track={m.playerTrack} size={m.playerBarDensity === 'slim' ? 48 : 56} />
          <span className={s.identityText}>
            <span className={s.title}>{m.playerTrack.title}</span>
            <span className={s.artist}>
              {m.isControllingRemoteReceiver ? `${m.receiverLabel} - ` : ''}
              {artistNames(m.playerTrack)}
            </span>
          </span>
        </button>
        <IconButton
          icon="heart"
          label={liked ? 'Unlike' : 'Like'}
          active={liked}
          filled={liked}
          disabled={m.playerIsPlaceholder}
          className={s.leftAction}
          onClick={() => m.toggleLike(m.playerTrack)}
        />
        {menuEntries.length > 0 ? (
          <DropdownMenu
            items={menuEntries}
            label={`${m.playerTrack.title} actions`}
            side={m.playerPlacement === 'top' ? 'bottom' : 'top'}
            align="start"
            trigger={(props) => (
              <IconButton {...props} icon="more" label="More actions" active={pickerOpenForTrack} className={cn(s.leftAction, s.hideNarrow)} />
            )}
          />
        ) : (
          <IconButton icon="more" label="More actions" disabled className={cn(s.leftAction, s.hideNarrow)} />
        )}
      </div>

      <div className={s.center}>
        <TransportButtons size="md" />
        <SeekRow />
      </div>

      <div className={s.right}>
        <IconButton
          icon="mic"
          label="Synced lyrics"
          active={m.showBarLyrics}
          aria-pressed={m.showBarLyrics}
          disabled={m.isControllingRemoteReceiver}
          title={m.isControllingRemoteReceiver ? 'Lyrics open on this browser only. Switch receiver to this device first.' : 'Synced lyrics'}
          onClick={() => {
            m.setShowBarLyrics(!m.showBarLyrics);
            m.setShowQueueDrawer(false);
          }}
        />
        <IconButton
          icon="list"
          label="Up next queue"
          active={m.showQueueDrawer}
          aria-pressed={m.showQueueDrawer}
          onClick={() => {
            m.setShowQueueDrawer(!m.showQueueDrawer);
            m.setShowBarLyrics(false);
          }}
        />
        <DevicePicker variant="bar" />
        <IconButton
          icon="users"
          label="Listen Together"
          active={Boolean(m.listenTogetherSession || m.listenTogetherHostSessionId)}
          onClick={() => m.setListenTogetherDialogOpen(true)}
        />
        <IconButton icon="minimize" label="Switch to floating mini player" className={s.hideNarrow} onClick={openMini} />
        <VolumeControl showBoostToggle responsive />
        <IconButton icon="maximize" label="Expand player" onClick={openExpanded} />
      </div>
    </div>
  );
}
