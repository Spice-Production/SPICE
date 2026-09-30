// LRCLIB lookup helpers and synced-lyric timing, shared with the Kotlin client.

import { asObject, int, str, type Json } from './json.ts';

export type TimedLyricLine = { timeMs: number; text: string };

const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?]/g;

export function parseTimedLyrics(value: string | null | undefined): TimedLyricLine[] {
  if (!value || !value.trim()) return [];
  const lines: TimedLyricLine[] = [];
  for (const sourceLine of value.split(/\r?\n/)) {
    const matches = [...sourceLine.matchAll(TIMESTAMP)];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1]!;
    const text = sourceLine.slice((last.index ?? 0) + last[0].length).trim();
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] ?? '').padEnd(3, '0').slice(0, 3)) || 0;
      lines.push({ timeMs: minutes * 60_000 + seconds * 1_000 + fraction, text });
    }
  }
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.timeMs - b.line.timeMs || a.index - b.index)
    .map(({ line }) => line);
}

export function activeTimedLyricIndex(lines: TimedLyricLine[], positionMs: number): number {
  const position = Math.max(positionMs, 0);
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.timeMs <= position) index = i;
  }
  return index >= 0 && lines[index]!.text !== '' ? index : -1;
}

export function cleanLyricsTitle(title: string): string {
  return title
    .replace(
      /\s*(?:\([^)]*(?:official|video|audio|visualizer|lyrics?|remaster(?:ed)?|4k|hd)[^)]*\)|\[[^\]]*(?:official|video|audio|visualizer|lyrics?|remaster(?:ed)?|4k|hd)[^\]]*\])/gi,
      '',
    )
    .trim();
}

export function cleanLyricsArtist(artist: string): string {
  return artist
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s+official$/i, '')
    .replace(/vevo$/i, '')
    .trim();
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreLyricsMatch(track: Json, title: string, artist: string, durationSec: number): number {
  const normalizedTitle = normalizeMatchText(title);
  const normalizedArtist = normalizeMatchText(artist);
  const candidateTitle = normalizeMatchText(str(track, 'trackName'));
  const candidateArtist = normalizeMatchText(str(track, 'artistName'));
  let score = 0;
  if (candidateTitle === normalizedTitle) score += 8;
  else if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 4;
  if (normalizedArtist && candidateArtist === normalizedArtist) score += 6;
  else if (normalizedArtist && (candidateArtist.includes(normalizedArtist) || normalizedArtist.includes(candidateArtist))) score += 3;
  const difference = Math.abs(int(track, 'duration', durationSec) - durationSec);
  if (difference <= 3) score += 3;
  else if (difference <= 10) score += 1;
  if (str(track, 'syncedLyrics').trim()) score += 1;
  return score;
}

export function selectLyricsMatch(results: unknown[], title: string, artist: string, durationSec: number): Json | null {
  const candidates: { item: Json; score: number; index: number }[] = [];
  results.forEach((entry, index) => {
    const item = asObject(entry);
    if (!item) return;
    if (!str(item, 'syncedLyrics').trim() && !str(item, 'plainLyrics').trim()) return;
    const score = scoreLyricsMatch(item, title, artist, durationSec);
    if (score >= 7) candidates.push({ item, score, index });
  });
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.item ?? null;
}

export function cleanLyricLine(line: string): string {
  const cleaned = line.replace(/^\[[0-9:.]+]\s*/, '');
  return cleaned.trim() ? cleaned : line;
}
