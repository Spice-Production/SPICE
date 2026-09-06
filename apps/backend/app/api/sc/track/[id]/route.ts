import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { getSoundCloudTrackDetails } from '@/lib/soundcloud';
import { buildSignedStreamUrl } from '@/lib/stream-signing';
import { effectiveRequestOrigin } from '@/lib/request-host';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';

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
  const requestedQuality = request.nextUrl.searchParams.get('quality');
  const quality = requestedQuality === 'high' || requestedQuality === 'low'
    ? requestedQuality
    : 'standard';

  try {
    const details = await getSoundCloudTrackDetails(id, quality);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    return jsonResponse({
      track: details.track,
      streams: details.streams.map((stream) => ({
        ...stream,
        url: stream.protocol === 'progressive'
          ? buildSignedStreamUrl(effectiveRequestOrigin(request), {
              id,
              itag: stream.itag,
              upstreamUrl: stream.url,
              expiresAt,
            }, '/api/local/sc/stream')
          : stream.url,
        expiresAt: new Date(expiresAt).toISOString(),
      })),
    }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'sc_track_failed',
        message: error instanceof Error ? error.message : 'Could not resolve this SoundCloud track.',
      },
      { status: 502 },
      request,
    );
  }
}
