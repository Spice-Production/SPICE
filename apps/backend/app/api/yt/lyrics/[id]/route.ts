import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { resolveLyrics } from '@/lib/lrclib';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getTrackDetails, getYouTube } from '@/lib/youtube';

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

    let title = titleOverride;
    let artist = artistOverride;
    let durationMs = durationOverrideMs || 180000;

    if (!title || !artist || !durationOverrideMs) {
      try {
        const yt = await getYouTube();
        const info = await yt.getBasicInfo(id);
        title = title || info.basic_info.title || '';
        artist = artist || info.basic_info.author || '';
        durationMs = durationOverrideMs || (info.basic_info.duration ? info.basic_info.duration * 1000 : 180000);
      } catch {
        const details = await getTrackDetails(id);
        title = title || details.track.title;
        artist = artist || details.track.artists?.[0]?.name || '';
        durationMs = durationOverrideMs || details.track.durationMs || 180000;
      }
    }

    return jsonResponse(await resolveLyrics({
      trackId: id,
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
        error: error instanceof Error ? error.message : 'Could not resolve track details',
      },
      { status: 502 },
      request,
    );
  }
}
