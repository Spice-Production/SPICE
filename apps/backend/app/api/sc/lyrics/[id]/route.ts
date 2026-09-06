import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { resolveLyrics } from '@/lib/lrclib';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getSoundCloudTrackMetadata } from '@/lib/soundcloud';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;

  try {
    const titleOverride = request.nextUrl.searchParams.get('title')?.trim() ?? '';
    const artistOverride = request.nextUrl.searchParams.get('artist')?.trim() ?? '';
    const parsedDurationMs = Number(request.nextUrl.searchParams.get('durationMs') ?? '');
    const durationOverrideMs = Number.isFinite(parsedDurationMs) && parsedDurationMs > 0
      ? Math.round(parsedDurationMs)
      : 0;

    let trackId = id;
    let title = titleOverride;
    let artist = artistOverride;
    let durationMs = durationOverrideMs || 180000;

    if (!title || !artist || !durationOverrideMs) {
      const track = await getSoundCloudTrackMetadata(id);
      trackId = track.id;
      title = title || track.title;
      artist = artist || track.artists[0]?.name || '';
      durationMs = durationOverrideMs || track.durationMs || 180000;
    }

    return jsonResponse(await resolveLyrics({
      trackId,
      title,
      artist,
      durationMs,
    }), {}, request);
  } catch (error) {
    return jsonResponse(
      {
        trackId: id,
        plainLyrics: '',
        syncedLyrics: '',
        isSynced: false,
        error: error instanceof Error ? error.message : 'Could not resolve SoundCloud lyrics.',
      },
      { status: 502 },
      request,
    );
  }
}
