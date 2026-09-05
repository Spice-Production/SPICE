// Pure helpers for playlist/queue file export (json + m3u). No I/O here —
// callers handle reading config/state and writing files, so these stay testable.

export interface ExportableTrack {
  id: string;
  sourceId: string;
  title: string;
  artists: { id: string; name: string }[];
  durationMs?: number | null;
  artworkUrl?: string | null;
  trackId?: string;
  artistsJson?: string;
}

function artistNames(t: ExportableTrack): string {
  if (Array.isArray((t as any).artists) && (t as any).artists.length) {
    return (t as any).artists.map((a: any) => a.name).join(', ');
  }
  if (typeof t.artistsJson === 'string') {
    try {
      return (JSON.parse(t.artistsJson) as any[]).map((a) => a.name).join(', ');
    } catch { return ''; }
  }
  return '';
}

function durationSec(t: ExportableTrack): number {
  const ms = typeof t.durationMs === 'number' ? t.durationMs : null;
  return ms && Number.isFinite(ms) ? Math.round(ms / 1000) : -1;
}

export function trackPageUrl(t: ExportableTrack): string {
  const id = t.trackId || t.id;
  if (/^\d+$/.test(id) || t.sourceId === 'soundcloud') return `https://soundcloud.com/tracks/${id}`;
  return `https://music.youtube.com/watch?v=${id}`;
}

/** Extended M3U with EXTINF titles so mpv/VLC show names, not URLs. */
export function toM3u(headerTitle: string, tracks: ExportableTrack[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${headerTitle.replace(/[\r\n]/g, ' ')}`];
  for (const t of tracks) {
    const title = `${t.title || t.id} — ${artistNames(t) || 'Unknown Artist'}`.replace(/[\r\n]/g, ' ');
    lines.push(`#EXTINF:${durationSec(t)},${title}`, trackPageUrl(t));
  }
  return lines.join('\n') + '\n';
}

export function exportFileName(title: string, ext: string): string {
  const base = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 100) || 'playlist';
  return `${base}.${ext.replace(/^\./, '')}`;
}
