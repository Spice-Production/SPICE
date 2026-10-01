// SoundCloud search and stream resolution over plain HTTPS, ported from the
// Android engine's SoundCloudDirectClient. Used where the native engine only
// plays audio (iOS); Android keeps resolving in Kotlin so its playback service
// can continue the queue without the JS runtime.

import { makeTrack, type ResolvedPlayback, type ResolvedStream, type StreamQuality, type Track } from './models.ts';

const API_URL = 'https://api-v2.soundcloud.com';
const TRACK_PREFIX = 'soundcloud:';
const WEB_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ASSET_REGEX = /(?:https?:)?(?:\/\/|\\u002F\\u002F)?[^"'<> ]*sndcdn\.com\/[^"'<> ]+\.js|\/[^\s"'<>]+\.js/g;
const CLIENT_ID_REGEXES = [
  /"clientId"\s*:\s*"([^"]+)"/,
  /"client_id"\s*:\s*"([^"]+)"/,
  /(?:client_id|clientId)["']?\s*[:=]\s*["']([^"']+)["']/,
];

export class SoundCloudError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'SoundCloudError';
    this.status = status;
  }
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

type Json = Record<string, unknown>;

export type TranscodingCandidate = { url: string; preset: string; protocol: string; mimeType: string };

/** Which stream formats the platform's player can decode. */
export type StreamSupport = (stream: ResolvedStream) => boolean;

/** AVPlayer has no Ogg/Opus or WebM decoder. */
export const applePlayableStream: StreamSupport = (stream) =>
  !/ogg|opus|webm/i.test(`${stream.container} ${stream.contentType}`);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

export function extractSoundCloudClientId(source: string): string | null {
  for (const regex of CLIENT_ID_REGEXES) {
    const match = regex.exec(source)?.[1];
    if (match) return match;
  }
  return null;
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function isPlayable(track: Json): boolean {
  if (track.streamable === false) return false;
  return !['BLOCK', 'SNIP'].includes(text(track.policy).toUpperCase());
}

function bestArtwork(url: string): string {
  return url && url !== 'null' ? url.replace('-large.', '-t500x500.') : '';
}

function parseTrack(item: Json): Track | null {
  const id = text(item.id);
  const title = text(item.title);
  if (!id || !title) return null;
  const user = object(item.user);
  const duration = typeof item.duration === 'number' && Number.isFinite(item.duration) ? Math.max(0, item.duration) : 0;
  return makeTrack({
    id: `${TRACK_PREFIX}${id}`,
    title,
    artist: text(user.username) || 'SoundCloud Artist',
    durationMs: duration,
    artworkUrl: bestArtwork(text(item.artwork_url) || text(user.avatar_url)),
    sourceId: 'soundcloud',
  });
}

export function parseSoundCloudTracks(payload: unknown, limit: number): Track[] {
  const collection = object(payload).collection;
  if (!Array.isArray(collection)) return [];
  const tracks: Track[] = [];
  for (const raw of collection) {
    const item = object(raw);
    if (!isPlayable(item)) continue;
    const track = parseTrack(item);
    if (track) tracks.push(track);
    if (tracks.length >= limit) break;
  }
  return tracks;
}

export function parseTranscodingCandidates(track: unknown): TranscodingCandidate[] {
  const transcodings = object(object(track).media).transcodings;
  if (!Array.isArray(transcodings)) return [];
  const candidates: TranscodingCandidate[] = [];
  for (const raw of transcodings) {
    const transcoding = object(raw);
    const format = object(transcoding.format);
    const protocol = text(format.protocol);
    const url = text(transcoding.url);
    if (!url || /encrypted/i.test(protocol)) continue;
    candidates.push({ url, preset: text(transcoding.preset) || 'unknown', protocol, mimeType: text(format.mime_type) });
  }
  return candidates;
}

function bitrateForPreset(preset: string): number {
  const match = /(\d+)k/.exec(preset)?.[1];
  if (match) return Number(match) * 1000;
  if (/opus/i.test(preset)) return 64_000;
  if (/mp3/i.test(preset)) return 128_000;
  return 0;
}

function containerForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('ogg')) return 'ogg';
  return 'unknown';
}

export function streamFromTranscoding(candidate: TranscodingCandidate, resolvedUrl: string): ResolvedStream {
  return {
    url: resolvedUrl,
    container: containerForMimeType(candidate.mimeType),
    bitrate: bitrateForPreset(candidate.preset),
    protocol: candidate.protocol,
    contentType: candidate.mimeType,
    expiresAt: '',
  };
}

/** Progressive first, then the bitrate the quality setting asks for. */
export function sortSoundCloudStreams(streams: ResolvedStream[], quality: StreamQuality): ResolvedStream[] {
  const progressive = (stream: ResolvedStream) => (stream.protocol.toLowerCase() === 'progressive' ? 1 : 0);
  const rank = (stream: ResolvedStream): number => {
    if (quality === 'High') return -stream.bitrate;
    if (stream.bitrate <= 0) return Number.MAX_SAFE_INTEGER;
    return quality === 'DataSaver' ? stream.bitrate : Math.abs(stream.bitrate - 128_000);
  };
  return streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => progressive(b.stream) - progressive(a.stream) || rank(a.stream) - rank(b.stream) || a.index - b.index)
    .map((entry) => entry.stream);
}

function assetUrl(url: string): string {
  const normalized = url.replaceAll('\\/', '/').replaceAll('\\u002F', '/');
  if (normalized.startsWith('//')) return `https:${normalized}`;
  if (normalized.startsWith('/')) return `https://soundcloud.com${normalized}`;
  return normalized;
}

export function soundCloudTrackId(id: string): string {
  return id.startsWith(TRACK_PREFIX) ? id.slice(TRACK_PREFIX.length) : id;
}

export class SoundCloudClient {
  private readonly fetchImpl: FetchLike;
  private readonly supports: StreamSupport;
  private clientId: string | null = null;
  private discovery: Promise<string> | null = null;

  constructor(fetchImpl: FetchLike, supports: StreamSupport = () => true) {
    this.fetchImpl = fetchImpl;
    this.supports = supports;
  }

  async search(query: string, limit: number): Promise<Track[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
    const payload = await this.fetchJson(`/search/tracks?q=${encodeURIComponent(query)}&limit=${safeLimit}&offset=0`);
    return parseSoundCloudTracks(payload, safeLimit);
  }

  async resolveStreams(trackId: string, quality: StreamQuality): Promise<ResolvedStream[]> {
    const track = object(await this.fetchJson(`/tracks/${encodeURIComponent(soundCloudTrackId(trackId))}`));
    if (track.streamable === false) throw new SoundCloudError('This SoundCloud track is not streamable.');
    const policy = text(track.policy).toUpperCase();
    if (policy === 'BLOCK') throw new SoundCloudError('This SoundCloud track is blocked in the current region.');
    if (policy === 'SNIP') throw new SoundCloudError('SoundCloud only exposes a preview for this track.');

    const authorization = text(track.track_authorization);
    const resolved = await Promise.all(
      parseTranscodingCandidates(track).map(async (candidate) => {
        try {
          const payload = object(await this.fetchJson(appendQuery(candidate.url, { track_authorization: authorization })));
          const url = text(payload.url);
          return url ? streamFromTranscoding(candidate, url) : null;
        } catch {
          return null;
        }
      }),
    );
    const streams = resolved.filter((stream): stream is ResolvedStream => stream !== null && this.supports(stream));
    if (streams.length === 0) {
      throw new SoundCloudError('No compatible SoundCloud stream formats were discovered on this phone.');
    }
    return sortSoundCloudStreams(streams, quality);
  }

  /** The requested track, or the closest full-length SoundCloud match when it cannot be streamed. */
  async resolvePlayable(track: Track, quality: StreamQuality): Promise<ResolvedPlayback> {
    if (track.localUri) {
      const stream = { url: track.localUri, container: 'local', bitrate: 0, protocol: 'offline', contentType: 'audio/*', expiresAt: '' };
      return { track, stream, usedFallback: false };
    }
    let failure: unknown;
    if (track.sourceId.startsWith('soundcloud')) {
      try {
        const [stream] = await this.resolveStreams(track.id, quality);
        if (stream) return { track, stream, usedFallback: false };
      } catch (error) {
        failure = error;
      }
    }
    const query = [track.title, track.artist].filter((part) => part.trim() !== '').join(' ');
    const alternatives = (await this.search(query, 30)).filter((candidate) => candidate.id !== track.id).slice(0, 6);
    for (const alternative of alternatives) {
      try {
        const [stream] = await this.resolveStreams(alternative.id, quality);
        if (stream) return { track: alternative, stream, usedFallback: true };
      } catch (error) {
        failure = error;
      }
    }
    throw new SoundCloudError(
      failure instanceof Error && alternatives.length === 0
        ? failure.message
        : 'No full-length SoundCloud source is available for this track.',
    );
  }

  private async fetchJson(pathOrUrl: string, retry = true): Promise<unknown> {
    const clientId = await this.resolveClientId();
    const base = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    const response = await this.fetchImpl(appendQuery(base, { client_id: clientId }), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      // A rotated web client id answers 401/403; rediscover it once.
      if (retry && (response.status === 401 || response.status === 403)) {
        this.clientId = null;
        return this.fetchJson(pathOrUrl, false);
      }
      throw new SoundCloudError(`SoundCloud API request failed with HTTP ${response.status}.`, response.status);
    }
    return JSON.parse(await response.text());
  }

  private resolveClientId(): Promise<string> {
    if (this.clientId) return Promise.resolve(this.clientId);
    this.discovery ??= this.discoverClientId()
      .then((clientId) => {
        this.clientId = clientId;
        return clientId;
      })
      .finally(() => {
        this.discovery = null;
      });
    return this.discovery;
  }

  private async discoverClientId(): Promise<string> {
    const homepage = await this.fetchText('https://soundcloud.com');
    const inline = extractSoundCloudClientId(homepage);
    if (inline) return inline;
    const assets = [...new Set(homepage.match(ASSET_REGEX) ?? [])].reverse();
    for (const asset of assets) {
      try {
        const found = extractSoundCloudClientId(await this.fetchText(assetUrl(asset), 'bytes=0-500000'));
        if (found) return found;
      } catch {
        // Try the next script bundle.
      }
    }
    throw new SoundCloudError('Could not discover the SoundCloud web client id on this phone.');
  }

  private async fetchText(url: string, range?: string): Promise<string> {
    const headers: Record<string, string> = { 'User-Agent': WEB_USER_AGENT };
    if (range) headers.Range = range;
    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) throw new SoundCloudError(`SoundCloud web request failed with HTTP ${response.status}.`, response.status);
    return response.text();
  }
}
