import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { resolveSoundCloudUrl } from '@/lib/soundcloud';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const url = request.nextUrl.searchParams.get('url')?.trim() || '';
  if (!url) {
    return jsonResponse(
      { error: 'missing_soundcloud_url', message: 'Paste a SoundCloud track or playlist link.' },
      { status: 400 },
      request,
    );
  }

  try {
    return jsonResponse(await resolveSoundCloudUrl(url), {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'soundcloud_resolve_failed',
        message: error instanceof Error ? error.message : 'Could not resolve the SoundCloud link.',
      },
      { status: 502 },
      request,
    );
  }
}
