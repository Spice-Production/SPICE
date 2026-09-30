'use client';

/* eslint-disable @next/next/no-img-element -- remote artwork URLs are not configured for next/image. */

/**
 * SPICE UI v2 media building blocks: artwork, cards, shelves, and the
 * virtualized track list shared by every page.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { playlistArtworkCandidates } from '../playlist-artwork';
import { computePlaylistWindow } from '../playlist-performance';
import type { Playlist, Track } from '../spice-app';
import { useScrollContainer } from './context';
import { Icon, type IconName } from './icons';
import { cn, DropdownMenu, IconButton, SectionHeader, type MenuEntry } from './primitives';
import s from './media.module.css';

/* ── Formatting helpers ─────────────────────────────────────── */

export function artistNames(track: Pick<Track, 'artists'>) {
  return (track.artists ?? []).map((artist) => artist.name).filter(Boolean).join(', ');
}

export function formatDurationMs(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

export function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

export function trackKey(track: Pick<Track, 'id' | 'sourceId'>, index?: number) {
  return `${track.sourceId || 'track'}:${track.id}${index === undefined ? '' : `:${index}`}`;
}

/* ── Artwork ────────────────────────────────────────────────── */

export function Artwork({
  src,
  alt = '',
  size,
  round,
  fallbackIcon = 'music',
  background,
  className,
  style,
  eager,
}: {
  src?: string | null;
  alt?: string;
  /** Pixel size; omit to fill the parent width (square). */
  size?: number;
  round?: boolean;
  fallbackIcon?: IconName;
  /** Background behind the fallback icon (e.g. a playlist gradient). */
  background?: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <div
      className={cn(s.art, round && s['art-round'], className)}
      style={{ ...(size ? { width: size, height: size } : null), background, ...style }}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <span className={s.artFallback} style={background ? undefined : { color: 'var(--sx-fg-subtle)' }}>
          <Icon name={fallbackIcon} size={size ? Math.max(14, Math.round(size * 0.36)) : 28} />
        </span>
      )}
    </div>
  );
}

export function TrackArtwork({ track, size, className, eager }: { track: Track; size?: number; className?: string; eager?: boolean }) {
  return <Artwork src={track.artworkUrl || track.album?.artworkUrl} alt="" size={size} className={className} eager={eager} />;
}

/** Playlist cover: explicit cover, then track art candidates, then its gradient. */
export function PlaylistArtwork({
  playlist,
  size,
  className,
  fallbackGradient,
}: {
  playlist: Playlist;
  size?: number;
  className?: string;
  fallbackGradient?: string;
}) {
  const leadingTracks = playlist.tracks.slice(0, 12);
  const leadingKey = leadingTracks.map((track) => `${track.sourceId ?? ''}:${track.id}`).join('|');
  const candidates = useMemo(
    () => playlistArtworkCandidates({ coverUrl: playlist.coverUrl, tracks: leadingTracks }),
    // Recompute only when the cover or the leading tracks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist.coverUrl, leadingKey],
  );
  const [failed, setFailed] = useState<string[]>([]);
  const src = candidates.find((candidate) => !failed.includes(candidate));
  const gradient = playlist.gradient || fallbackGradient;
  return (
    <div
      className={cn(s.art, className)}
      style={{ ...(size ? { width: size, height: size } : null), background: gradient }}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((current) => (current.includes(src) ? current : [...current, src]))}
        />
      ) : (
        <span className={s.artFallback}>
          <Icon name="listMusic" size={size ? Math.max(14, Math.round(size * 0.36)) : 28} />
        </span>
      )}
    </div>
  );
}

export function NowPlayingBars({ paused, label = 'Now playing' }: { paused?: boolean; label?: string }) {
  return (
    <span className={s.bars} data-paused={paused ? 'true' : undefined} role="img" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}

/* ── Cards ──────────────────────────────────────────────────── */

export function MediaCard({
  title,
  subtitle,
  artwork,
  onOpen,
  onPlay,
  playLabel,
  active,
  playing,
  menu,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  artwork: ReactNode;
  /** Primary action (open a playlist, or play a track when there is no onPlay). */
  onOpen: () => void;
  /** Optional hover play button. */
  onPlay?: () => void;
  playLabel?: string;
  active?: boolean;
  playing?: boolean;
  menu?: ReadonlyArray<MenuEntry | false | null | undefined>;
  className?: string;
}) {
  return (
    <div className={cn(s.card, className)}>
      {/* Stretched primary action; play and menu sit above it as siblings (no nested buttons). */}
      <button type="button" className={s.cardHit} aria-label={title} onClick={onOpen} />
      <div className={s.cardArt}>
        {artwork}
        {onPlay ? (
          <button
            type="button"
            className={s.cardPlay}
            data-visible={active ? 'true' : undefined}
            aria-label={playLabel ?? `Play ${title}`}
            onClick={onPlay}
          >
            <Icon name={active && playing ? 'pause' : 'play'} size={16} filled />
          </button>
        ) : null}
      </div>
      <div className={s.cardText}>
        <span className={s.cardTitle} data-active={active ? 'true' : undefined}>
          {title}
        </span>
        {subtitle ? <span className={s.cardSubtitle}>{subtitle}</span> : null}
      </div>
      {menu && menu.some(Boolean) ? (
        <div className={s.cardMenu}>
          <DropdownMenu
            items={menu}
            label={`${title} actions`}
            trigger={(props) => <IconButton {...props} icon="more" label={`More actions for ${title}`} size="xs" variant="secondary" />}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Compact horizontal tile for quick access grids (home "jump back in"). */
export function Tile({
  title,
  artwork,
  onOpen,
  playLabel,
}: {
  title: string;
  artwork: ReactNode;
  onOpen: () => void;
  playLabel?: string;
}) {
  return (
    <button type="button" className={s.tile} onClick={onOpen} aria-label={playLabel ?? title}>
      {artwork}
      <span className={s.tileTitle}>{title}</span>
      <span className={s.tilePlay} aria-hidden="true">
        <Icon name="play" size={14} filled />
      </span>
    </button>
  );
}

export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(s.tileGrid, className)}>{children}</div>;
}

export function CardGrid({ children, minItemWidth, className }: { children: ReactNode; minItemWidth?: number; className?: string }) {
  return (
    <div className={cn(s.cardGrid, className)} style={minItemWidth ? ({ ['--sx-grid-min' as string]: `${minItemWidth}px` } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/** Titled horizontal scroller with previous/next controls. */
export function Shelf({
  title,
  description,
  action,
  children,
  itemWidth,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  itemWidth?: number;
  className?: string;
  id?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const measureEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 4;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(measureEdges);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureEdges) : null;
    observer?.observe(el);
    // Items swap in after loading (skeletons → cards); re-measure when they change.
    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(measureEdges) : null;
    mutations?.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
    };
  }, [measureEdges]);
  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(200, el.clientWidth * 0.85), behavior: 'smooth' });
  };
  const showNav = !(edges.start && edges.end);
  return (
    <section className={cn(s.shelf, className)} aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={title}
        description={description}
        action={
          <div className={s.shelfNav}>
            {action}
            {showNav ? (
              <>
                <IconButton icon="chevronLeft" label="Scroll left" size="xs" disabled={edges.start} onClick={() => scrollByPage(-1)} />
                <IconButton icon="chevronRight" label="Scroll right" size="xs" disabled={edges.end} onClick={() => scrollByPage(1)} />
              </>
            ) : null}
          </div>
        }
      />
      <div
        ref={scrollerRef}
        className={s.shelfScroller}
        onScroll={measureEdges}
        style={itemWidth ? ({ ['--sx-shelf-item' as string]: `${itemWidth}px` } as CSSProperties) : undefined}
      >
        {children}
      </div>
    </section>
  );
}

/* ── Track rows ─────────────────────────────────────────────── */

export interface TrackRowOptions {
  /** Highlights the row as the current track. */
  active?: boolean;
  /** Current track and playing (animated bars instead of the index). */
  playing?: boolean;
  onPlay: () => void;
  /** Index-column button on the current row: pause/resume instead of restarting. */
  onTogglePlayback?: () => void;
  liked?: boolean;
  onToggleLike?: () => void;
  /** Middle column content (album, source, added-by...). Needs showMeta on the list. */
  meta?: ReactNode;
  /** Inline badge after the artist line. */
  subtitleExtra?: ReactNode;
  menu?: ReadonlyArray<MenuEntry | false | null | undefined>;
  /** Extra always-visible trailing controls (e.g. a remove button). */
  trailing?: ReactNode;
  /** Replaces the artist line. */
  subtitle?: ReactNode;
  duration?: string;
}

interface TrackRowProps extends TrackRowOptions {
  track: Track;
  index: number;
  showIndex: boolean;
  showArtwork: boolean;
  showMeta: boolean;
  showDuration: boolean;
  dense?: boolean;
}

function TrackRow({
  track,
  index,
  showIndex,
  showArtwork,
  showMeta,
  showDuration,
  dense,
  active,
  playing,
  onPlay,
  onTogglePlayback,
  liked,
  onToggleLike,
  meta,
  subtitleExtra,
  menu,
  trailing,
  subtitle,
  duration,
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = track.title || 'Untitled';
  const artists = subtitle ?? artistNames(track);
  const resolvedDuration = duration ?? formatDurationMs(track.durationMs);
  const hasMenu = Boolean(menu && menu.some(Boolean));
  return (
    <div
      className={cn(s.trackRow, dense && s['trackRow-dense'])}
      data-active={active ? 'true' : undefined}
      data-menu-open={menuOpen ? 'true' : undefined}
      onDoubleClick={onPlay}
    >
      {showIndex ? (
        <div className={s.trackIndex}>
          {active ? (
            <NowPlayingBars paused={!playing} />
          ) : (
            <span className={s.trackIndexNumber}>{index + 1}</span>
          )}
          <button
            type="button"
            className={s.trackIndexPlay}
            onClick={active && onTogglePlayback ? onTogglePlayback : onPlay}
            aria-label={active && playing ? `Pause ${title}` : `Play ${title}`}
            tabIndex={-1}
          >
            <Icon name={active && playing ? 'pause' : 'play'} size={14} filled />
          </button>
        </div>
      ) : null}
      <button type="button" className={s.trackMain} onClick={onPlay} aria-label={`Play ${title}`} aria-current={active ? 'true' : undefined}>
        {showArtwork ? <TrackArtwork track={track} size={dense ? 36 : 40} /> : null}
        <span className={s.trackText}>
          <span className={s.trackTitle}>{title}</span>
          <span className={s.trackSubtitle}>
            {!showIndex && active ? <NowPlayingBars paused={!playing} /> : null}
            <span className={s.trackSubtitleText}>{artists}</span>
            {subtitleExtra}
          </span>
        </span>
      </button>
      {showMeta ? <div className={cn(s.trackMeta, s.trackMetaColumn)}>{meta}</div> : null}
      {showDuration ? <div className={cn(s.trackDuration, s.trackDurationColumn)}>{resolvedDuration}</div> : null}
      <div className={s.trackActions}>
        {trailing}
        {onToggleLike ? (
          <IconButton
            icon="heart"
            filled={liked}
            active={liked}
            label={liked ? `Unlike ${title}` : `Like ${title}`}
            size="sm"
            className={s.trackHoverAction}
            data-pinned={liked ? 'true' : undefined}
            onClick={onToggleLike}
          />
        ) : null}
        {hasMenu ? (
          <DropdownMenu
            items={menu ?? []}
            label={`${title} actions`}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={(props) => (
              <IconButton {...props} icon="more" label={`More actions for ${title}`} size="sm" className={s.trackHoverAction} />
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

export interface TrackListProps {
  tracks: Track[];
  /** Per-row behavior: play handler, liked state, menu, meta column... */
  getRowOptions: (track: Track, index: number) => TrackRowOptions;
  ariaLabel: string;
  showIndex?: boolean;
  showArtwork?: boolean;
  showMeta?: boolean;
  metaLabel?: string;
  showDuration?: boolean;
  showHeader?: boolean;
  dense?: boolean;
  /** Virtualize when longer than this many rows (default 60). */
  virtualizeAbove?: number;
  /** Scroll this index into view (e.g. the playing queue item). */
  focusIndex?: number;
  /** Changing this resets virtualization measurements (e.g. playlist id). */
  resetKey?: string;
  className?: string;
}

const ROW_HEIGHT = 56;
const DENSE_ROW_HEIGHT = 48;

/**
 * Track table. Short lists render in full; long lists virtualize against the
 * nearest ScrollContainerContext (the page scroll) so there are no nested
 * scroll boxes.
 */
export function TrackList({
  tracks,
  getRowOptions,
  ariaLabel,
  showIndex = true,
  showArtwork = true,
  showMeta = false,
  metaLabel = 'Album',
  showDuration = true,
  showHeader = false,
  dense = false,
  virtualizeAbove = 60,
  focusIndex,
  resetKey,
  className,
}: TrackListProps) {
  const rowHeight = dense ? DENSE_ROW_HEIGHT : ROW_HEIGHT;
  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer();
  const virtualize = tracks.length > virtualizeAbove;
  const trackCount = tracks.length;
  const [range, setRange] = useState({ start: 0, end: Math.min(tracks.length, 40) });

  const columns = useMemo(() => {
    const desktop = [
      showIndex ? '28px' : null,
      'minmax(0, 4fr)',
      showMeta ? 'minmax(0, 2fr)' : null,
      showDuration ? '52px' : null,
      'auto',
    ].filter(Boolean).join(' ');
    const mobile = [showIndex ? '28px' : null, 'minmax(0, 1fr)', 'auto'].filter(Boolean).join(' ');
    return { desktop, mobile };
  }, [showDuration, showIndex, showMeta]);

  useLayoutEffect(() => {
    if (!virtualize) return;
    const scroller = scrollContainer?.current ?? null;
    const measureWindow = () => {
      const list = listRef.current;
      if (!list) return;
      let offset = 0;
      let viewport = window.innerHeight;
      if (scroller) {
        const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        offset = Math.max(0, scroller.scrollTop - listTop);
        viewport = scroller.clientHeight;
      } else {
        offset = Math.max(0, -list.getBoundingClientRect().top);
      }
      const win = computePlaylistWindow({ itemCount: trackCount, scrollOffset: offset, viewportHeight: viewport, rowHeight, overscan: 8 });
      setRange((current) => (current.start === win.startIndex && current.end === win.endIndex ? current : { start: win.startIndex, end: win.endIndex }));
    };
    const target: HTMLElement | Window = scroller ?? window;
    let frame = requestAnimationFrame(measureWindow);
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureWindow);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [resetKey, rowHeight, scrollContainer, trackCount, virtualize]);

  useEffect(() => {
    if (focusIndex === undefined || focusIndex < 0 || focusIndex >= trackCount) return;
    const list = listRef.current;
    const scroller = scrollContainer?.current ?? null;
    if (!list || !scroller) return;
    const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const rowTop = listTop + focusIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < scroller.scrollTop || rowBottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTo({ top: Math.max(0, rowTop - scroller.clientHeight / 2 + rowHeight / 2) });
    }
  }, [focusIndex, resetKey, rowHeight, scrollContainer, trackCount]);

  const start = virtualize ? Math.min(range.start, tracks.length) : 0;
  const end = virtualize ? Math.min(Math.max(range.end, start), tracks.length) : tracks.length;
  const visible = tracks.slice(start, end);
  const styleVars = {
    ['--sx-track-columns' as string]: columns.desktop,
    ['--sx-track-columns-mobile' as string]: columns.mobile,
  } as CSSProperties;

  return (
    <div className={cn(s.trackList, className)} style={styleVars}>
      {showHeader ? (
        <div className={s.trackListHeader} aria-hidden="true">
          {showIndex ? <span style={{ textAlign: 'center' }}>#</span> : null}
          <span>Title</span>
          {showMeta ? <span className={s.trackMetaColumn}>{metaLabel}</span> : null}
          {showDuration ? (
            <span className={s.trackDurationColumn} style={{ justifySelf: 'end' }}>
              <Icon name="clock" size={14} />
            </span>
          ) : null}
          <span />
        </div>
      ) : null}
      <div ref={listRef} role="list" aria-label={ariaLabel}>
        {virtualize && start > 0 ? <div aria-hidden="true" style={{ height: start * rowHeight }} /> : null}
        {visible.map((track, visibleIndex) => {
          const index = start + visibleIndex;
          const options = getRowOptions(track, index);
          return (
            <div key={trackKey(track, index)} role="listitem" aria-posinset={index + 1} aria-setsize={tracks.length}>
              <TrackRow
                track={track}
                index={index}
                showIndex={showIndex}
                showArtwork={showArtwork}
                showMeta={showMeta}
                showDuration={showDuration}
                dense={dense}
                {...options}
              />
            </div>
          );
        })}
        {virtualize && end < tracks.length ? <div aria-hidden="true" style={{ height: (tracks.length - end) * rowHeight }} /> : null}
      </div>
    </div>
  );
}
