// Display helpers shared by the player, library, and account surfaces.

import type { PlaylistMember, Track } from './models.ts';

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(milliseconds, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMiniDuration(positionMs: number, durationMs: number): string {
  return durationMs > 0 ? `${formatTime(positionMs)} / ${formatTime(durationMs)}` : '';
}

export function queueLabel(queueSize: number, queueIndex: number, compact = false): string {
  if (queueSize > 1 && queueIndex >= 0 && queueIndex < queueSize) {
    return compact ? `Queue ${queueIndex + 1}/${queueSize}` : `Queue ${queueIndex + 1} of ${queueSize}`;
  }
  return '';
}

export function formatBytes(bytes: number): string {
  const safe = Math.max(bytes, 0);
  if (safe < 1024) return `${safe} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = safe / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function sourceLabel(track: Pick<Track, 'sourceId'>): string {
  return track.sourceId.startsWith('soundcloud') ? 'SoundCloud' : 'YouTube';
}

export function trackSubtitle(track: Track): string {
  return `${track.artist} · ${sourceLabel(track)}`;
}

function initialsFrom(source: string): string {
  const letters = source
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return (letters || 'S').slice(0, 2);
}

export function profileInitials(email: string | null | undefined, id: string | null | undefined): string {
  const source = email && email.trim() ? email : id ?? '';
  return initialsFrom(source.split('@')[0] ?? '');
}

export function memberInitials(member: PlaylistMember): string {
  return initialsFrom(member.displayName || member.username || member.userId);
}

export function readableBlockExpiry(value: string, locale?: string): string {
  const normalized = value.trim();
  if (!normalized) return 'later';
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z?$/;
  if (!iso.test(normalized)) return 'later';
  const parsed = Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  if (!Number.isFinite(parsed)) return 'later';
  return new Date(parsed).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function addUrlBreaks(value: string): string {
  let result = '';
  for (const character of value) {
    result += character;
    if ('/-_?&='.includes(character)) result += '​';
  }
  return result;
}

export function readableReleaseNotes(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[*-]\s+/, '• ')
        .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '$1')
        .replaceAll('**', '')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
        .trimEnd(),
    )
    .join('\n')
    .trim()
    .replace(/https?:\/\/\S+/g, (match) => addUrlBreaks(match));
}
