import type { SpiceCliConfig } from './config.js';
import { resolveEndpoints } from './config.js';

// ---- shared types mirroring apps/backend/lib/youtube.ts ----

export interface SpiceArtist { id: string; name: string; artworkUrl?: string; }
export interface SpiceTrack {
  sourceId: string;
  id: string;
  title: string;
  artists: SpiceArtist[];
  album?: { id: string; title: string; artists: SpiceArtist[]; artworkUrl?: string; year?: number; };
  durationMs?: number;
  artworkUrl?: string;
}
export interface SpiceStreamVariant {
  url: string;
  codec: string;
  bitrate: number;
  container: string;
  itag: number;
  expiresAt?: string;
  capped?: boolean;
}
export interface SpiceTrackDetails {
  track: SpiceTrack;
  streams: SpiceStreamVariant[];
}

// Use global fetch (Node 18+). No extra deps.
async function fetchJson(url: string, opts: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = opts;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ac.signal,
      headers: {
        Accept: 'application/json',
        'x-spice-cli': '1',
        ...(rest.headers as any),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { res, json, text };
  } finally { clearTimeout(t); }
}

function pickError(json: any, res: Response) {
  return json?.message || json?.error || `HTTP ${res.status} ${res.statusText}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---- probing helpers ----

export async function probeLocalRuntime(cfg: SpiceCliConfig) {
  const { localRuntime } = resolveEndpoints(cfg);
  try {
    const { res, json } = await fetchJson(localRuntime, { timeoutMs: 2000 });
    if (res.ok) return { ok: true as const, data: json };
    return { ok: false as const, status: res.status, message: pickError(json, res) };
  } catch (e: any) {
    return { ok: false as const, status: 0, message: e?.message || String(e) };
  }
}

// ---- search ----

export async function searchTracks(cfg: SpiceCliConfig, query: string, limit: number, source: 'yt' | 'sc' | 'all') {
  const ep = resolveEndpoints(cfg);

  // Try local runtime first (authoritative for media). Fallback is explicit — cloud
  // no longer hosts media scraping (see local-mode-feature-status).
  if (source === 'yt' || source === 'all') {
    const url = ep.localSearch(query, limit, 'tracks');
    const { res, json } = await fetchJson(url);
    if (res.ok && Array.isArray(json?.tracks)) return { tracks: json.tracks as SpiceTrack[], source: 'yt' as const };
    if (source === 'yt') throw new ApiError(pickError(json, res), res.status, json?.error);
    // for 'all', swallow and try sc before throwing
  }

  if (source === 'sc' || source === 'all') {
    const url = ep.localScSearch(query, limit);
    const { res, json } = await fetchJson(url);
    if (res.ok && Array.isArray(json?.tracks)) return { tracks: json.tracks as SpiceTrack[], source: 'sc' as const };
    if (source === 'sc') throw new ApiError(pickError(json, res), res.status, json?.error);
  }

  if (source === 'all') {
    // Both failed — surface the yt error if available, else sc
    // We already threw for single-source case; aggregate here:
    // Retry yt to get its error for the message
    const url = ep.localSearch(query, limit, 'tracks');
    const { res, json } = await fetchJson(url);
    throw new ApiError(pickError(json, res), res.status, json?.error);
  }

  throw new ApiError('search failed', 502);
}

export async function searchWebVideos(cfg: SpiceCliConfig, query: string, limit: number) {
  const ep = resolveEndpoints(cfg);
  const url = ep.localSearch(query, limit, 'web_videos');
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new ApiError(pickError(json, res), res.status, json?.error);
  return json.tracks as SpiceTrack[];
}

// ---- track details / streams ----

export async function getTrackDetails(cfg: SpiceCliConfig, id: string, sourceHint: 'yt' | 'sc' = 'yt'): Promise<SpiceTrackDetails> {
  const ep = resolveEndpoints(cfg);
  const ytUrl = ep.localTrack(id);
  // Try YT first, then SC (SC ids are numeric). We distinguish by probing error,
  // but allow explicit hint to pick the right endpoint first.
  const order = sourceHint === 'sc' ? ['sc', 'yt'] as const : ['yt', 'sc'] as const;
  let lastErr: ApiError | null = null;
  for (const kind of order) {
    const url = kind === 'yt' ? ytUrl : ep.localScTrack(id);
    try {
      const { res, json } = await fetchJson(url);
      if (res.ok && json?.track && Array.isArray(json?.streams)) {
        return { track: json.track, streams: json.streams } as SpiceTrackDetails;
      }
      lastErr = new ApiError(pickError(json, res), res.status, json?.error);
      // 404 on one provider -> try the other. 5xx -> also try other.
      if (res.status === 404) continue;
      // If it was yt and we got streams=[] with 200, treat as not found for yt
      if (res.ok && Array.isArray(json?.streams) && json.streams.length === 0) continue;
      // otherwise try next provider before giving up
      continue;
    } catch (e: any) {
      lastErr = new ApiError(e?.message || String(e), 0);
    }
  }
  throw lastErr ?? new ApiError('could not resolve track', 502);
}

// ---- lyrics ----

export async function getLyrics(cfg: SpiceCliConfig, id: string, _track?: SpiceTrack) {
  const ep = resolveEndpoints(cfg);
  // Lyrics are resolved via /api/yt/lyrics/[id] on local runtime (lrclib).
  // The backend route expects title/artist/duration fallback when no cache,
  // but plain GET /api/yt/lyrics/[id] works when called from the app.
  const url = ep.localLyrics(id);
  const { res, json } = await fetchJson(url);
  if (!res.ok) throw new ApiError(pickError(json, res), res.status, json?.error);
  return json as { trackId: string; title: string; artist: string; plainLyrics: string; syncedLyrics: string; isSynced: boolean };
}

// ---- stream proxy download (signed URL already in track details) ----

export function pickBestStream(streams: SpiceStreamVariant[], prefer: 'm4a' | 'opus' | 'mp3' | 'original' = 'original'): SpiceStreamVariant | null {
  if (!streams.length) return null;
  if (prefer === 'original') {
    // Prefer AAC/m4a for compatibility, then highest bitrate — mirrors backend sort.
    const sorted = [...streams].sort((a, b) => {
      const aAac = a.codec.includes('mp4a') || a.container === 'mp4';
      const bAac = b.codec.includes('mp4a') || b.container === 'mp4';
      if (aAac !== bAac) return aAac ? -1 : 1;
      return b.bitrate - a.bitrate;
    });
    return sorted[0];
  }
  if (prefer === 'mp3') return streams.find(s => s.container === 'mp3') ?? streams[0];
  const opus = streams.find(s => s.codec.includes('opus') || s.container === 'webm');
  if (prefer === 'opus' && opus) return opus;
  const m4a = streams.find(s => s.container === 'mp4' || s.container === 'm4a');
  if (prefer === 'm4a' && m4a) return m4a;
  return streams[0];
}
