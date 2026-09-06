import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { buildSignedStreamUrl } from '@/lib/stream-signing';
import { effectiveRequestOrigin } from '@/lib/request-host';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getTrackDetails } from '@/lib/youtube';

/**
 * Browser proof: resolve a YT Music id to playable stream variants.
 * Returns short-TTL signed URLs the player passes to /api/local/yt/stream.
 */
export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const details = await getTrackDetails(id);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const origin = effectiveRequestOrigin(request);
    return jsonResponse({
      track: details.track,
      streams: details.streams.map((stream) => ({
        ...stream,
        url: buildSignedStreamUrl(
          origin,
          {
            id,
            itag: stream.itag,
            upstreamUrl: stream.url,
            expiresAt,
          },
          streamRoutePrefix(request, 'yt'),
        ),
        expiresAt: new Date(expiresAt).toISOString(),
      })),
    }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'yt_track_failed',
        message:
          error instanceof Error ? error.message : 'Could not resolve this track.',
      },
      { status: 502 },
      request,
    );
  }
}

function streamRoutePrefix(request: NextRequest, provider: 'yt' | 'sc') {
  return request.headers.get('x-spice-api-namespace') === 'local'
    ? `/api/local/${provider}/stream`
    : `/api/${provider}/stream`;
}
