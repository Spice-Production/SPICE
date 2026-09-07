import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { searchMovies } from '@/lib/tmdb';

/**
 * Browser proof: search TMDB for movies and return minimal watch-routing hits.
 * The API key stays server-side (`TMDB_API_KEY`); browsers never see it.
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
    const movies = await searchMovies(q, limit);
    return jsonResponse({ movies }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Movie search needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'movies_search_failed',
        message: error instanceof Error ? error.message : 'Movie search failed.',
      },
      { status: 502 },
      request,
    );
  }
}
