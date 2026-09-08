import type { NextRequest } from 'next/server';

import { jsonResponse, optionsResponse } from '@/lib/cors';
import { normalizeTmdbMovieId } from '@/lib/movie-provider';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { getSeasonEpisodes, getShowDetails } from '@/lib/tmdb';

/**
 * Browser proof: one series record with its season list, plus the episode
 * list when ?season=N is given. Feeds the watch-page episode picker.
 */
export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  if (!normalizeTmdbMovieId(id)) {
    return jsonResponse({ error: 'invalid_id', message: 'Not a valid TMDB id.' }, { status: 400 }, request);
  }

  const seasonParam = request.nextUrl.searchParams.get('season');
  const season = seasonParam === null ? null : Number(seasonParam);

  try {
    const show = await getShowDetails(id);
    if (!show) {
      return jsonResponse({ error: 'show_not_found', message: 'No such series.' }, { status: 404 }, request);
    }
    if (season === null) return jsonResponse({ show }, {}, request);
    if (!Number.isInteger(season) || season < 1 || season > 99) {
      return jsonResponse({ error: 'invalid_season', message: 'Pick a real season number.' }, { status: 400 }, request);
    }
    const episodes = await getSeasonEpisodes(id, season);
    return jsonResponse({ show, season, episodes }, {}, request);
  } catch (error) {
    const code = (error as Error & { code?: string })?.code;
    if (code === 'tmdb_key_missing') {
      return jsonResponse(
        { error: 'tmdb_key_missing', message: 'Series data needs a TMDB API key (TMDB_API_KEY).' },
        { status: 503 },
        request,
      );
    }
    return jsonResponse(
      {
        error: 'shows_details_failed',
        message: error instanceof Error ? error.message : 'Series lookup failed.',
      },
      { status: 502 },
      request,
    );
  }
}
