'use client';

import { useEffect, useRef, useState } from 'react';

import { EmptyState } from '@/components/ui';
import type { EngineTrack } from './engine';

export interface LyricWord {
  word: string;
  start: number;
  duration: number;
}

export interface LyricLine {
  time: number;
  text: string;
  words: LyricWord[];
}

/**
 * LRC parsing, faithful to the original player: [mm:ss.xx] tags (also
 * [mm:ss] and [mm:ss:xxx]), lines sorted by time, words split with
 * character-proportional timing inside each line's window.
 */
export function parseLrc(lrcText: string, totalDurationSec = 0): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const parsed: LyricLine[] = [];
  const timeRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
  for (const line of lines) {
    timeRegex.lastIndex = 0;
    const match = timeRegex.exec(line);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const msStr = match[3] || '0';
    let ms = 0;
    if (msStr.length === 1) ms = parseInt(msStr, 10) * 100;
    else if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
    else ms = parseInt(msStr.slice(0, 3), 10);
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    if (!text) continue;
    parsed.push({ time: min * 60 + sec + ms / 1000, text, words: [] });
  }
  parsed.sort((a, b) => a.time - b.time);

  for (let i = 0; i < parsed.length; i++) {
    const currentLine = parsed[i];
    const nextLineTime = i < parsed.length - 1 ? parsed[i + 1].time : totalDurationSec;
    const lineDuration = Math.max(0.5, nextLineTime - currentLine.time);
    const rawWords = currentLine.text.split(/(\s+)/).filter((w) => w.length > 0);
    if (rawWords.length === 0) continue;
    const totalChars = rawWords.reduce((sum, w) => sum + w.length, 0);
    let elapsed = 0;
    for (const raw of rawWords) {
      const wordDuration = (raw.length / totalChars) * lineDuration;
      currentLine.words.push({ word: raw, start: currentLine.time + elapsed, duration: wordDuration });
      elapsed += wordDuration;
    }
  }
  return parsed;
}

export function parsePlainLyrics(lyricsText: string): LyricLine[] {
  if (!lyricsText) return [];
  return lyricsText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ time: 0, text, words: [] }));
}

function isSoundCloudTrack(track: EngineTrack): boolean {
  return track.sourceId === 'soundcloud' || track.id.startsWith('soundcloud:');
}

function lyricsMetadataQuery(track: EngineTrack): string {
  const params = new URLSearchParams();
  if (track.title) params.set('title', track.title);
  const artist = track.artists?.map((entry) => entry.name).filter(Boolean).join(', ');
  if (artist) params.set('artist', artist);
  if (track.durationMs && Number.isFinite(track.durationMs)) {
    params.set('durationMs', String(Math.round(track.durationMs)));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface LyricsData {
  lines: LyricLine[];
  synced: boolean;
}

/**
 * Lyrics for the current track: same endpoints and metadata query as
 * the original (lrclib-backed, synced LRC preferred, plain fallback).
 * Refetches per track id with stale-response guards for fast skips.
 */
export function useLyrics(track: EngineTrack | null) {
  const [data, setData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(track !== null);
  const [lyricTrackId, setLyricTrackId] = useState<string | null>(track?.id ?? null);

  // Derived state: a new (or cleared) track drops the old lyrics.
  if ((track?.id ?? null) !== lyricTrackId) {
    setLyricTrackId(track?.id ?? null);
    setData(null);
    setLoading(track !== null);
  }

  useEffect(() => {
    if (!track) return;
    let active = true;
    (async () => {
      try {
        const id = isSoundCloudTrack(track) && track.id.startsWith('soundcloud:')
          ? track.id.slice('soundcloud:'.length)
          : track.id;
        const lane = isSoundCloudTrack(track) ? 'sc' : 'yt';
        const res = await fetch(`/api/local/${lane}/lyrics/${encodeURIComponent(id)}${lyricsMetadataQuery(track)}`);
        if (!res.ok) throw new Error(`lyrics failed (${res.status})`);
        const payload = (await res.json()) as { plainLyrics?: string; syncedLyrics?: string; isSynced?: boolean };
        if (!active) return;
        const totalSec = track.durationMs ? track.durationMs / 1000 : 0;
        const lines = payload.isSynced ? parseLrc(payload.syncedLyrics ?? '', totalSec) : parsePlainLyrics(payload.plainLyrics ?? '');
        setData(lines.length > 0 ? { lines, synced: !!payload.isSynced } : null);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [track]);

  return { data, loading };
}

/** Karaoke-style lyric view: active line follows playback progress. */
export function LyricsView({ track, progressMs }: { track: EngineTrack; progressMs: number }) {
  const { data, loading } = useLyrics(track);
  const activeRef = useRef<HTMLDivElement | null>(null);

  const progressSec = progressMs / 1000;
  let activeIndex = -1;
  if (data?.synced) {
    data.lines.forEach((line, i) => {
      if (line.time <= progressSec) activeIndex = i;
    });
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  if (loading) return <EmptyState message="Loading lyrics…" />;
  if (!data) return <EmptyState message="No lyrics found for this track." />;

  return (
    <>
      <style>{`
        .v2-lyrics { display: grid; gap: 6px; max-height: 320px; overflow-y: auto;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); padding: 4px 2px; }
        .v2-lyric { margin: 0; font-size: 0.92rem; line-height: 1.55; color: var(--spk-text-3, #71717a);
          transition: color 200ms ease; }
        .v2-lyric[data-on="true"] { color: var(--spk-text, #fafafa); }
        .v2-lyric-word { transition: color 150ms linear; }
        .v2-lyric-word[data-sung="true"] { color: var(--spk-accent, #fafafa); font-weight: 650; }
      `}</style>
      <div className="v2-lyrics" aria-label={`Lyrics for ${track.title}`}>
        {data.lines.map((line, i) => {
          const isActive = data.synced && i === activeIndex;
          return (
            <p
              key={i}
              ref={isActive ? activeRef : undefined}
              data-on={isActive ? 'true' : 'false'}
              className="v2-lyric"
            >
              {isActive && line.words.length > 0
                ? line.words.map((word, j) => (
                    <span
                      key={j}
                      data-sung={progressSec >= word.start ? 'true' : 'false'}
                      className="v2-lyric-word"
                    >
                      {word.word}
                    </span>
                  ))
                : line.text}
            </p>
          );
        })}
      </div>
    </>
  );
}
