'use client';

/**
 * Shared transport primitives used by the player bar, expanded view, and
 * mini player: play/pause + shuffle/repeat/skip, the seek row, and volume.
 * All read/write through the model so every surface drives identical
 * playback behavior (see toggleReceiverPlayPause, seekActiveReceiverTo,
 * setReceiverVolume in app/spice-app.tsx).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { cn, IconButton, Popover, Slider, useMediaQuery, type SliderProps } from '../primitives';
import s from './transport.module.css';

/** `touch` is the phone-sized variant (>=36px targets) of `md`. */
export type ControlSize = 'sm' | 'md' | 'lg' | 'touch';

const ICON_BUTTON_SIZE: Record<ControlSize, 'xs' | 'sm' | 'md'> = { sm: 'xs', md: 'sm', lg: 'md', touch: 'md' };
const ICON_PX: Record<ControlSize, number> = { sm: 13, md: 15, lg: 20, touch: 17 };
const PLAY_ICON_PX: Record<ControlSize, number> = { sm: 12, md: 13, lg: 24, touch: 16 };

/** Inverse circular play/pause, disabled while a Listen Together host owns transport. */
export function PlayPauseButton({ size = 'md', className }: { size?: ControlSize; className?: string }) {
  const m = useSpiceUi();
  const hostControlled = Boolean(m.listenTogetherHostSessionId);
  const label = m.playerIsPlaying ? 'Pause' : 'Play';
  return (
    <button
      type="button"
      className={cn(s.playButton, s[`playButton-${size}`], className)}
      disabled={hostControlled}
      title={hostControlled ? 'Playback controlled by host' : label}
      aria-label={label}
      onClick={m.toggleReceiverPlayPause}
    >
      <Icon name={m.playerIsPlaying ? 'pause' : 'play'} size={PLAY_ICON_PX[size]} filled />
    </button>
  );
}

/**
 * Shuffle · previous · play/pause · next · repeat, sized for the surface.
 * `compact` drops shuffle/repeat for the mini player, which — like the
 * classic floating widget — only ever showed prev/play/next.
 */
export function TransportButtons({
  size = 'md',
  compact = false,
  className,
}: {
  size?: ControlSize;
  compact?: boolean;
  className?: string;
}) {
  const m = useSpiceUi();
  const hostControlled = Boolean(m.listenTogetherHostSessionId);
  const hostTitle = 'Playback controlled by host';
  const btnSize = ICON_BUTTON_SIZE[size];
  const iconPx = ICON_PX[size];

  return (
    <div className={cn(s.transport, size === 'lg' && s['transport-lg'], className)}>
      {compact ? null : (
        <IconButton
          icon="shuffle"
          label="Shuffle"
          size={btnSize}
          iconSize={iconPx}
          active={m.playerShuffleEnabled}
          aria-pressed={m.playerShuffleEnabled}
          disabled={hostControlled}
          title={hostControlled ? hostTitle : 'Shuffle'}
          onClick={m.toggleReceiverShuffle}
        />
      )}
      <IconButton
        icon="skipBack"
        label="Previous"
        size={btnSize}
        iconSize={iconPx}
        disabled={hostControlled}
        title={hostControlled ? hostTitle : 'Previous'}
        onClick={m.handleReceiverPrev}
      />
      <PlayPauseButton size={size} />
      <IconButton
        icon="skipForward"
        label="Next"
        size={btnSize}
        iconSize={iconPx}
        disabled={hostControlled}
        title={hostControlled ? hostTitle : 'Next'}
        onClick={m.handleReceiverNext}
      />
      {compact ? null : (
        <IconButton
          icon={m.playerRepeatMode === 'one' ? 'repeatOne' : 'repeat'}
          label={`Repeat: ${m.playerRepeatMode === 'none' ? 'off' : m.playerRepeatMode === 'all' ? 'all' : 'one'}`}
          size={btnSize}
          iconSize={iconPx}
          active={m.playerRepeatMode !== 'none'}
          aria-pressed={m.playerRepeatMode !== 'none'}
          disabled={hostControlled}
          title={hostControlled ? hostTitle : `Repeat: ${m.playerRepeatMode === 'none' ? 'Off' : m.playerRepeatMode === 'all' ? 'Repeat all' : 'Repeat one'}`}
          onClick={m.cycleReceiverRepeat}
        />
      )}
    </div>
  );
}

/**
 * Seek state shared by the seek row and the mini player slider. Drags update
 * a local value so the thumb tracks the pointer; the real seek only fires on
 * release (seekActiveReceiverTo), and only when the user actually moved the
 * thumb — a bare Tab/Shift keyup on the focused slider must never seek. After
 * a commit the thumb holds the target briefly so it does not snap back to the
 * old position while the receiver catches up. Disabled while a Listen
 * Together host owns transport, like the classic seek strip.
 */
function useSeek() {
  const m = useSpiceUi();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [settling, setSettling] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const hostControlled = Boolean(m.listenTogetherHostSessionId);
  const duration = Math.max(m.playerDuration, 0);
  const progress = Math.min(m.playerProgress, duration || m.playerProgress);
  const held = settling !== null && Math.abs(progress - settling) > 1.5 ? settling : null;
  const shown = dragValue ?? held ?? progress;

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const change = (value: number) => {
    dragRef.current = value;
    setDragValue(value);
  };
  const cancel = () => {
    dragRef.current = null;
    setDragValue(null);
  };
  const commit = () => {
    const target = dragRef.current;
    cancel();
    if (target === null) return;
    m.seekActiveReceiverTo(target);
    setSettling(target);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setSettling(null), 700);
  };

  const sliderProps: SliderProps = {
    label: 'Seek position',
    min: 0,
    max: duration > 0 ? duration : 1,
    step: 1,
    value: shown,
    accent: true,
    disabled: hostControlled || duration <= 0,
    valueText: `${m.formatTime(shown)} of ${m.formatTime(duration)}`,
    onValueChange: change,
    onValueCommit: commit,
    onPointerCancel: cancel,
    onBlur: commit,
  };
  return { shown, duration, hostControlled, sliderProps };
}

/** Bare seek slider (the mini player has no time labels, like the classic strip). */
export function SeekSlider({ className }: { className?: string }) {
  const { sliderProps } = useSeek();
  return <Slider {...sliderProps} className={className} />;
}

/** Elapsed · seek slider · duration, plus the "Resolving stream…" status. */
export function SeekRow({ className }: { className?: string }) {
  const m = useSpiceUi();
  const { shown, duration, hostControlled, sliderProps } = useSeek();
  const resolving = !m.isControllingRemoteReceiver && m.isLoadingStream;

  return (
    <div className={cn(s.seekRow, className)} data-disabled={hostControlled || undefined}>
      <span className={s.seekTime}>{m.formatTime(shown)}</span>
      <Slider {...sliderProps} className={s.seekSlider} />
      <span className={cn(s.seekTime, s['seekTime-end'])}>{m.formatTime(duration)}</span>
      {resolving ? (
        <span className={s.resolving} role="status" aria-label="Resolving stream" title="Resolving stream">
          <span className={s.resolvingText}>Resolving stream…</span>
        </span>
      ) : null}
    </div>
  );
}

function volumeIcon(volume: number, max: number) {
  if (volume <= 0) return 'volumeMute' as const;
  if (volume < max * 0.4) return 'volumeLow' as const;
  return 'volume' as const;
}

/**
 * Mute toggle + slider, with the "Boost" toggle mirroring the classic
 * now-playing volume booster button exactly, including its localStorage
 * write and the >200% clamp on disable. `responsive` drops the boost toggle
 * and slider on narrower bars so the right-hand zone never crowds the
 * transport; `fluid` stretches the slider to fill its row (mini player).
 */
export function VolumeControl({
  size = 'md',
  showBoostToggle = false,
  showValue = false,
  responsive = false,
  fluid = false,
  className,
}: {
  size?: ControlSize;
  /** Renders the "Boost" toggle. */
  showBoostToggle?: boolean;
  showValue?: boolean;
  responsive?: boolean;
  fluid?: boolean;
  className?: string;
}) {
  const m = useSpiceUi();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const boosted = !m.isControllingRemoteReceiver && m.volumeBoosterAccepted;
  // Narrow bars hide the inline slider; the speaker opens a vertical slider instead.
  const compact = useMediaQuery('(max-width: 1023px)') && responsive;
  const volume = Math.min(m.playerVolume, m.playerVolumeMax);
  const pct = m.playerVolumeMax > 0 ? (volume / m.playerVolumeMax) * 100 : 0;
  const muteLabel = m.playerVolume === 0 ? 'Unmute' : 'Mute';
  const toggleMute = () => m.setReceiverVolume(m.playerVolume === 0 ? 70 : 0);

  return (
    <div
      className={cn(s.volume, responsive && s.volumeResponsive, fluid && s.volumeFluid, className)}
      onWheel={m.adjustReceiverVolumeByWheel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showBoostToggle ? (
        <button
          type="button"
          className={s.boostToggle}
          data-active={boosted ? 'true' : undefined}
          data-over={m.playerVolume > 100 ? 'true' : undefined}
          aria-pressed={boosted}
          aria-label="Volume boost"
          title={m.isControllingRemoteReceiver ? `Volume Boost is managed on ${m.receiverLabel}` : 'Toggle volume booster'}
          onClick={() => {
            if (m.isControllingRemoteReceiver) {
              m.showSpiceNotice(`Volume Boost stays on ${m.receiverLabel}; remote volume is limited to 100%.`, 'info');
              return;
            }
            const next = !m.volumeBoosterAccepted;
            m.setVolumeBoosterAccepted(next);
            try {
              localStorage.setItem('spice_volume_booster_accepted', String(next));
            } catch {
              // Best-effort persistence only.
            }
            if (!next && m.playerVolume > 200) m.setReceiverVolume(200);
          }}
        >
          Boost
        </button>
      ) : null}
      {compact ? (
        <Popover
          side="top"
          align="center"
          label="Volume"
          className={s.volumePopover}
          trigger={(props) => (
            <IconButton
              {...props}
              icon={volumeIcon(m.playerVolume, m.playerVolumeMax)}
              label={`Volume ${m.playerVolume}%`}
              size={ICON_BUTTON_SIZE[size]}
              iconSize={ICON_PX[size]}
            />
          )}
        >
          <div className={s.volumeVerticalPanel}>
            <span className={s.volumeVerticalValue}>{m.playerVolume}%</span>
            <Slider
              label="Volume"
              min={0}
              max={m.playerVolumeMax}
              value={volume}
              accent
              showThumb
              valueText={`${m.playerVolume}%`}
              className={s.volumeVertical}
              style={{ ['--sx-vertical-pct' as string]: `${pct}%` } as CSSProperties}
              onValueChange={m.setReceiverVolume}
            />
            <IconButton icon={volumeIcon(m.playerVolume, m.playerVolumeMax)} label={muteLabel} size="sm" onClick={toggleMute} />
          </div>
        </Popover>
      ) : (
        <div className={s.volumeWrap}>
          <IconButton
            icon={volumeIcon(m.playerVolume, m.playerVolumeMax)}
            label={muteLabel}
            size={ICON_BUTTON_SIZE[size]}
            iconSize={ICON_PX[size]}
            onClick={toggleMute}
          />
          <div
            className={s.volumeTrack}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            {hovered || focused ? (
              // The thumb is 12px wide, so its center runs from 6px to width - 6px.
              <span className={s.volumeTooltip} style={{ left: `calc(${pct}% + ${6 - (pct * 12) / 100}px)` }} aria-hidden="true">
                {m.playerVolume}%
              </span>
            ) : null}
            <Slider
              label="Volume"
              min={0}
              max={m.playerVolumeMax}
              value={volume}
              accent
              valueText={`${m.playerVolume}%`}
              className={cn(s.volumeSlider, (size === 'sm' || size === 'lg') && s[`volumeSlider-${size}`])}
              onValueChange={m.setReceiverVolume}
            />
          </div>
        </div>
      )}
      {showValue ? <span className={s.volumeValue}>{m.playerVolume}%</span> : null}
    </div>
  );
}
