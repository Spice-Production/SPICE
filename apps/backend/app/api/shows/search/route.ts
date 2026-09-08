import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { searchShows } from '@/lib/tmdb';

/**
 * Browser proof: search TMDB for TV series. Same namespace gate and key
 * handling as the movies search route.
 */
export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const q = request.nextUrl.searchParams.get('q');
  if (!q?.trim()) {
    return jsonResponse({ error: 'missing q' }, { status: 400 }, request);
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '12');
  const limit = Number.isFinite(limitParam) ? Math.trunc(limitParam) : 12;

  try {
    const shows = await searchShows(q, limit);
    return jsonResponse({ shows }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Show search needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'shows_search_failed',
        message: error instanceof Error ? error.message : 'Show search failed.',
      },
      { status: 502 },
      request,
    );
  }
}
