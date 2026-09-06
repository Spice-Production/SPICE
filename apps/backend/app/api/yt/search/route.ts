import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { searchTracks, searchWebVideos } from '@/lib/youtube';

/**
 * Browser proof: search YouTube Music via `youtubei.js` and return Spice tracks.
 */
export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const q = request.nextUrl.searchParams.get('q');
  if (!q) {
    return jsonResponse({ error: 'missing q' }, { status: 400 }, request);
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(50, Math.trunc(limitParam)))
    : 20;
  const kind = request.nextUrl.searchParams.get('kind') ?? 'tracks';

  try {
    const tracks = kind === 'web_videos'
      ? await searchWebVideos(q, limit)
      : await searchTracks(q, limit, kind);
    return jsonResponse({ tracks }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'yt_search_failed',
        message: error instanceof Error ? error.message : 'YouTube search failed.',
      },
      { status: 502 },
      request,
    );
  }
}
