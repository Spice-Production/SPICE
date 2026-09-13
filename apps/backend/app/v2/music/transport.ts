/**
 * v2 music transport. Same lane/URL/namespace rules as the original
 * player core: local-lane requests go to /api/local/* with the
 * x-spice-api-namespace header the media gates require.
 */

export type MusicSource = 'youtube' | 'soundcloud';

export const NAMESPACE_HEADERS = { 'x-spice-api-namespace': 'local' };

export function searchPath(source: MusicSource): string {
  return source === 'soundcloud' ? '/api/local/sc/search' : '/api/local/yt/search';
}

export function resolvePath(source: MusicSource, id: string): string {
  const safe = encodeURIComponent(id);
  return source === 'soundcloud' ? `/api/local/sc/track/${safe}` : `/api/local/yt/track/${safe}`;
}

export function sourceForTrack(sourceId?: string): MusicSource {
  return sourceId === 'soundcloud' ? 'soundcloud' : 'youtube';
}

export async function localGet<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString(), { headers: NAMESPACE_HEADERS });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status}).`);
  return data;
}
