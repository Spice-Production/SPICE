import type { SpiceCliConfig } from './config.js';
import { getTrackDetails, searchTracks, type SpiceTrack } from './api.js';

export function extractVideoId(input: string): string | null {
  const m = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function looksLikeTrackId(s: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(s) || /^\d+$/.test(s);
}

/** Resolve one input to a track: YouTube URL → id lookup → search top hit. */
export async function resolveInputToTrack(cfg: SpiceCliConfig, input: string, source: 'yt' | 'sc' | 'all' = 'all'): Promise<SpiceTrack> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Empty input.');
  const fromUrl = extractVideoId(trimmed);
  const candidate = fromUrl ?? (looksLikeTrackId(trimmed) ? trimmed : null);
  if (candidate) {
    try {
      const details = await getTrackDetails(cfg, candidate, source === 'sc' ? 'sc' : 'yt');
      return details.track;
    } catch (e: any) {
      // A "query" that happens to look like an id (e.g. numeric) falls through to search.
      if (fromUrl || (e as any)?.status !== 404) throw e;
    }
  }
  const { tracks } = await searchTracks(cfg, trimmed, 1, source);
  if (!tracks.length) throw new Error(`No results for "${trimmed}"`);
  return tracks[0];
}

/** Resolve many inputs in order, skipping failures with a warning when `tolerant`. */
export async function resolveInputsToTracks(
  cfg: SpiceCliConfig,
  inputs: string[],
  opts: { source?: 'yt' | 'sc' | 'all'; tolerant?: boolean; onSkip?: (input: string, reason: string) => void } = {},
): Promise<SpiceTrack[]> {
  const out: SpiceTrack[] = [];
  for (const input of inputs.map((s) => s.trim()).filter(Boolean)) {
    try {
      out.push(await resolveInputToTrack(cfg, input, opts.source ?? 'all'));
    } catch (e: any) {
      if (!opts.tolerant) throw e;
      opts.onSkip?.(input, e?.message || String(e));
    }
  }
  return out;
}
