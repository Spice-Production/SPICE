import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getPlaylistTracks } from '@/lib/youtube';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) {
    return jsonResponse({ error: 'missing playlist id' }, { status: 400 }, request);
  }

  try {
    const data = await getPlaylistTracks(id);
    return jsonResponse(data, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'yt_playlist_failed',
        message: error instanceof Error ? error.message : 'YouTube playlist import failed.',
      },
      { status: 502 },
      request,
    );
  }
}
