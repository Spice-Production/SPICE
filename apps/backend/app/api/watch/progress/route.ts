import type { NextRequest } from 'next/server';

import { db } from '@/db';
import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { WATCH_KINDS, watchlistItems, watchProgress, type WatchKind } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

function isWatchKind(value: unknown): value is WatchKind {
  return typeof value === 'string' && (WATCH_KINDS as readonly string[]).includes(value);
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

function badRequest(message: string) {
  return jsonResponse({ error: 'bad_request', message }, { status: 400 });
}

function asEpisodeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5000) return value;
  if (typeof value === 'string' && /^\d{1,4}$/.test(value.trim())) {
    const num = Number(value.trim());
    if (num <= 5000) return num;
  }
  return null;
}

/**
 * Record episode-granularity progress: opening a film marks it started,
 * picking an episode moves the series bookmark there, and marking watched
 * clears it from continue-watching. Embeds report no timestamps, so this
 * endpoint deliberately takes no position field.
 */
export async function POST(request: NextRequest) {
  const userId = await requireUserId(request);
  if (!userId) {
    return jsonResponse({ error: 'unauthorized', message: 'Sign in to sync your progress.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const { kind, tmdbId, title, posterUrl, season, episode, completed } = body as {
    kind?: unknown;
    tmdbId?: unknown;
    title?: unknown;
    posterUrl?: unknown;
    season?: unknown;
    episode?: unknown;
    completed?: unknown;
  };
  if (!isWatchKind(kind)) return badRequest('kind must be movie, show, or anime.');
  if (typeof tmdbId !== 'string' || !/^\d+$/.test(tmdbId)) return badRequest('tmdbId must be a numeric id.');
  if (typeof title !== 'string' || !title.trim()) return badRequest('title is required to save progress.');
  const seasonNum = season === undefined ? 0 : asEpisodeNumber(season);
  const episodeNum = episode === undefined ? 0 : asEpisodeNumber(episode);
  if (seasonNum === null || episodeNum === null) return badRequest('season and episode must be whole numbers.');
  if (kind === 'movie' && (seasonNum !== 0 || episodeNum !== 0)) {
    return badRequest('movies track no season or episode.');
  }

  const where = and(
    eq(watchProgress.userId, userId),
    eq(watchProgress.kind, kind),
    eq(watchProgress.tmdbId, tmdbId),
    eq(watchProgress.season, seasonNum),
    eq(watchProgress.episode, episodeNum),
  );
  const existing = await db.select({ id: watchProgress.id }).from(watchProgress).where(where).limit(1);
  const row = {
    title: title.trim().slice(0, 300),
    posterUrl: typeof posterUrl === 'string' ? posterUrl.slice(0, 500) : null,
    completed: completed === true,
    updatedAt: new Date(),
  };
  if (existing.length > 0) {
    await db.update(watchProgress).set(row).where(where);
  } else {
    await db.insert(watchProgress).values({ userId, kind, tmdbId, season: seasonNum, episode: episodeNum, ...row });
  }
  // Keep the list shelf truthful without asking: finishing moves the title
  // to completed, and starting a watch-later title moves it to watching.
  // Only existing rows flip — progress never creates list entries.
  const listWhere = and(
    eq(watchlistItems.userId, userId),
    eq(watchlistItems.kind, kind),
    eq(watchlistItems.tmdbId, tmdbId),
  );
  if (completed === true) {
    await db.update(watchlistItems).set({ status: 'completed' }).where(listWhere);
  } else {
    await db
      .update(watchlistItems)
      .set({ status: 'watching' })
      .where(and(listWhere, eq(watchlistItems.status, 'watch_later')));
  }
  return jsonResponse({ ok: true });
}
