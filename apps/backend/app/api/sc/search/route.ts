import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { searchSoundCloudTracks } from '@/lib/soundcloud';

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

  try {
    return jsonResponse({ tracks: await searchSoundCloudTracks(q, limit) }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'sc_search_failed',
        message: error instanceof Error ? error.message : 'SoundCloud search failed.',
      },
      { status: 502 },
      request,
    );
  }
}
