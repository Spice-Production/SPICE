import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { browseMovies, type TmdbBrowseList } from '@/lib/tmdb';

const LISTS: TmdbBrowseList[] = ['trending', 'popular', 'top_rated'];

/**
 * Browser proof: curated TMDB shelves (trending / popular / top rated) for
 * the movies browse page. Same namespace gate and key handling as search.
 */
export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const list = request.nextUrl.searchParams.get('list') ?? 'trending';
  if (!(LISTS as string[]).includes(list)) {
    return jsonResponse({ error: 'unknown_list', message: 'Pick trending, popular, or top_rated.' }, { status: 400 }, request);
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '12');
  const limit = Number.isFinite(limitParam) ? Math.trunc(limitParam) : 12;

  try {
    const movies = await browseMovies(list as TmdbBrowseList, limit);
    return jsonResponse({ list, movies }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Movie browsing needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'movies_browse_failed',
        message: error instanceof Error ? error.message : 'Movie browsing failed.',
      },
      { status: 502 },
      request,
    );
  }
}
