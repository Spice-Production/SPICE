import type { NextRequest } from 'next/server';

import { db } from '@/db';
import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { watchlistItems, watchProgress } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

async function requireUserId(request: NextRequest): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const session = await verifySession(auth.substring(7));
    return session.userId ?? null;
  } catch {
    return null;
  }
}

function unauthorized() {
  return jsonResponse({ error: 'unauthorized', message: 'Sign in to sync your list.' }, { status: 401 });
}

/**
 * One call feeds every synced shelf: the watchlist plus continue-watching
 * (incomplete progress, newest first). Anime rows ride the same shape —
 * the anime surface reuses this endpoint untouched.
 */
export async function GET(request: NextRequest) {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const list = await db
    .select({
      kind: watchlistItems.kind,
      tmdbId: watchlistItems.tmdbId,
      title: watchlistItems.title,
      posterUrl: watchlistItems.posterUrl,
      year: watchlistItems.year,
      status: watchlistItems.status,
      releaseDate: watchlistItems.releaseDate,
      addedAt: watchlistItems.addedAt,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, userId))
    .orderBy(desc(watchlistItems.addedAt))
    .limit(200);

  const progress = await db
    .select({
      kind: watchProgress.kind,
      tmdbId: watchProgress.tmdbId,
      season: watchProgress.season,
      episode: watchProgress.episode,
      title: watchProgress.title,
      posterUrl: watchProgress.posterUrl,
      completed: watchProgress.completed,
      updatedAt: watchProgress.updatedAt,
    })
    .from(watchProgress)
    .where(and(eq(watchProgress.userId, userId), eq(watchProgress.completed, false)))
    .orderBy(desc(watchProgress.updatedAt))
    .limit(60);

  const completed = await db
    .select({
      kind: watchProgress.kind,
      tmdbId: watchProgress.tmdbId,
      season: watchProgress.season,
      episode: watchProgress.episode,
    })
    .from(watchProgress)
    .where(and(eq(watchProgress.userId, userId), eq(watchProgress.completed, true)))
    .orderBy(desc(watchProgress.updatedAt))
    .limit(200);

  return jsonResponse({ watchlist: list, continueWatching: progress, completed });
}
