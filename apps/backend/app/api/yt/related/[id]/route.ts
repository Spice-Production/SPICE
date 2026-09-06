import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getRelatedTracks } from '@/lib/youtube';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) {
    return jsonResponse({ error: 'missing track id' }, { status: 400 }, request);
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '30');
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(50, Math.trunc(limitParam)))
    : 30;

  try {
    const tracks = await getRelatedTracks(id, limit);
    return jsonResponse({ tracks }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'yt_related_failed',
        message: error instanceof Error ? error.message : 'Related-track lookup failed.',
      },
      { status: 502 },
      request,
    );
  }
}
