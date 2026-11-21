import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { searchAnime } from '@/lib/tmdb';

/**
 * Search TMDB for anime series and movies. Same namespace gate and key
 * handling as movies and shows search.
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
    const anime = await searchAnime(q, limit);
    return jsonResponse({ anime }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Anime search needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'anime_search_failed',
        message: error instanceof Error ? error.message : 'Anime search failed.',
      },
      { status: 502 },
      request,
    );
  }
}
