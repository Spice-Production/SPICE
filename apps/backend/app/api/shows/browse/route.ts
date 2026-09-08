import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { browseShows, type TmdbShowBrowseList } from '@/lib/tmdb';

const LISTS: TmdbShowBrowseList[] = ['trending', 'popular', 'top_rated'];

/**
 * Browser proof: curated TMDB series shelves for the shows browse page.
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
    const shows = await browseShows(list as TmdbShowBrowseList, limit);
    return jsonResponse({ list, shows }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        {
          error: 'tmdb_key_missing',
          message: 'Show browsing needs a TMDB API key (TMDB_API_KEY).',
        },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'shows_browse_failed',
        message: error instanceof Error ? error.message : 'Show browsing failed.',
      },
      { status: 502 },
      request,
    );
  }
}
