import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { browseAnime, type TmdbAnimeBrowseList } from '@/lib/tmdb';

const LISTS: TmdbAnimeBrowseList[] = ['trending', 'popular', 'top_rated', 'airing', 'movies'];

/**
 * Curated TMDB Japanese-animation shelves for the anime browse page.
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
    return jsonResponse({ error: 'unknown_list', message: 'Pick trending, popular, top_rated, airing, or movies.' }, { status: 400 }, request);
  }

  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '12');
  const limit = Number.isFinite(limitParam) ? Math.trunc(limitParam) : 12;

  try {
    const anime = await browseAnime(list as TmdbAnimeBrowseList, limit);
    return jsonResponse({ list, anime }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Anime browsing needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'anime_browse_failed',
        message: error instanceof Error ? error.message : 'Anime browsing failed.',
      },
      { status: 502 },
      request,
    );
  }
}
