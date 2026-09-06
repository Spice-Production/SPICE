import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getAlbumTracks } from '@/lib/youtube';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) {
    return jsonResponse(
      { error: 'missing_album_id', message: 'The YouTube Music album id is missing.' },
      { status: 400 },
      request,
    );
  }

  try {
    return jsonResponse(await getAlbumTracks(id), {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'yt_album_failed',
        message: error instanceof Error ? error.message : 'YouTube Music album import failed.',
      },
      { status: 502 },
      request,
    );
  }
}
