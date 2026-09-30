'use client';

/**
 * Synced lyrics, shared by the lyrics sheet, the expanded view's Lyrics tab,
 * and (in compact form) the mini player strip. Mirrors the classic lyrics
 * body exactly (app/spice-app.tsx ~19886-19976 / ~20627-20738): the karaoke
 * word highlighting reads the same raw `progress`, not the receiver-aware
 * playerProgress, because karaoke sync only makes sense for local playback.
 */

import { useCallback, type ReactNode, type RefObject } from 'react';

import type { LyricLine } from '../../spice-app';
import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Badge, cn, Spinner } from '../primitives';
import s from './lyrics-view.module.css';

type WordTiming = LyricLine['words'][number];

/**
 * Attaches an externally-owned ref to its scroll container. Kept as its own
 * component (no useSpiceUi() call of its own) so the model's RefObject
 * fields can be handed off as a plain prop instead of the JSX `ref=`
 * attribute reading the model directly. Several lyrics views can be mounted
 * at once (sheet + expanded tab), so a view only clears the shared ref when
 * it is still the owner, and a fresh mount centers the current line once —
 * SpiceApp's own effect only scrolls when the active line changes.
 */
function ScrollAnchor({
  targetRef,
  className,
  children,
}: {
  targetRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      targetRef.current = node;
      const frame = requestAnimationFrame(() => {
        node.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      return () => {
        cancelAnimationFrame(frame);
        if (targetRef.current === node) targetRef.current = null;
      };
    },
    [targetRef],
  );
  return (
    <div ref={attach} className={className}>
      {children}
    </div>
  );
}

function isHeaderLine(text: string) {
  return text.startsWith('[') && text.endsWith(']');
}

function LyricWords({ line }: { line: LyricLine }) {
  const m = useSpiceUi();
  return (
    <span>
      {line.words.map((word: WordTiming, index: number) => {
        const isWordActive = m.progress >= word.start && m.progress < word.start + word.duration;
        const isWordPassed = m.progress >= word.start + word.duration;
        return (
          <span key={index} className={s.word} data-active={isWordActive || undefined} data-passed={isWordPassed || undefined}>
            {word.word}
          </span>
        );
      })}
    </span>
  );
}

/** Karaoke toggle + "Unsynced" indicator, shown above the lyrics list. */
export function LyricsHeader({ className }: { className?: string }) {
  const m = useSpiceUi();
  const unsynced = Boolean(m.lyricsData && !m.lyricsData.isSynced && m.lyricsData.lines.length > 0);
  const canKaraoke = Boolean(m.lyricsData?.isSynced);
  return (
    <div className={cn(s.header, className)}>
      <span className={s.headerTitle}>
        <Icon name="mic" size={14} />
        Karaoke
        {unsynced ? (
          <Badge variant="accent" title="These lyrics are not time-synced">
            Unsynced
          </Badge>
        ) : null}
      </span>
      <button
        type="button"
        className={s.karaokeToggle}
        data-active={m.isKaraokeMode || undefined}
        aria-pressed={m.isKaraokeMode}
        aria-label="Karaoke mode"
        disabled={!canKaraoke}
        title="Toggle karaoke mode"
        onClick={() => canKaraoke && m.setIsKaraokeMode(!m.isKaraokeMode)}
      >
        {m.isKaraokeMode ? 'On' : 'Off'}
      </button>
    </div>
  );
}

/** The synced line list itself, kept separate from LyricsView below so the
 *  scroll container's ref attachment isn't in the same render scope as the
 *  per-line mapping (works around a react-compiler ref/render false positive
 *  when both live in one component). */
function LyricsLines({ lines, isSynced }: { lines: LyricLine[]; isSynced: boolean }) {
  const m = useSpiceUi();
  return (
    <>
      {lines.map((line, index) => {
        const active = index === m.activeLineIdx;
        const past = index < m.activeLineIdx;
        const chorus = line.text.includes('[Chorus]');
        const header = isHeaderLine(line.text);
        const showKaraoke = isSynced && m.isKaraokeMode && line.words.length > 0 && !header;
        return (
          <div
            key={index}
            className={s.line}
            data-active={active || undefined}
            data-past={past || undefined}
            data-header={header || undefined}
            data-chorus={chorus || undefined}
            data-clickable={isSynced || undefined}
            onClick={() => isSynced && m.seekToPosition(line.time)}
          >
            {showKaraoke ? <LyricWords line={line} /> : line.text}
          </div>
        );
      })}
    </>
  );
}

/**
 * Full scrolling lyrics list. Attaches lyricsContainerRef so SpiceApp's
 * auto-scroll effect can keep the active line in view.
 */
export function LyricsView({ className }: { className?: string }) {
  const m = useSpiceUi();

  if (m.lyricsLoading) {
    return (
      <div className={cn(s.list, className)}>
        <div className={s.state}>
          <Spinner size={20} label="Loading lyrics" />
          <span>Tuning...</span>
        </div>
      </div>
    );
  }

  if (!m.lyricsData || m.lyricsData.lines.length === 0) {
    return (
      <div className={cn(s.list, className)}>
        <div className={s.state}>No lyrics found for this track.</div>
      </div>
    );
  }

  return (
    <ScrollAnchor targetRef={m.lyricsContainerRef} className={cn(s.list, className)}>
      <LyricsLines lines={m.lyricsData.lines} isSynced={m.lyricsData.isSynced} />
    </ScrollAnchor>
  );
}

/** Single-line strip used by the mini player (no scroll, no ref). */
export function LyricsCompact({ className }: { className?: string }) {
  const m = useSpiceUi();
  if (m.lyricsLoading) {
    return (
      <div className={cn(s.compact, s.compactMuted, className)}>
        Tuning...
      </div>
    );
  }
  if (m.activeLineIdx >= 0 && m.lyricsData) {
    return (
      <div key={m.activeLineIdx} className={cn(s.compact, className)}>
        {m.lyricsData.lines[m.activeLineIdx]?.text}
      </div>
    );
  }
  const unsynced = Boolean(m.lyricsData && !m.lyricsData.isSynced && m.lyricsData.lines.length > 0);
  return <div className={cn(s.compact, s.compactMuted, className)}>{unsynced ? 'Lyrics are not time-synced' : '(Instrumental)'}</div>;
}
