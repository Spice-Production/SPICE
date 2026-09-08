import type { NextRequest } from 'next/server';

import { db } from '@/db';
import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { WATCH_KINDS, WATCH_LIST_STATUSES, watchlistItems, type WatchKind, type WatchListStatus } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

function isWatchKind(value: unknown): value is WatchKind {
  return typeof value === 'string' && (WATCH_KINDS as readonly string[]).includes(value);
}

function isWatchListStatus(value: unknown): value is WatchListStatus {
  return typeof value === 'string' && (WATCH_LIST_STATUSES as readonly string[]).includes(value);
}

function isReleaseDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

/** Add, remove, or re-shelve one watchlist row. Removing a missing row still succeeds. */
export async function POST(request: NextRequest) {
  const userId = await requireUserId(request);
  if (!userId) {
    return jsonResponse({ error: 'unauthorized', message: 'Sign in to sync your list.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const { kind, tmdbId, title, posterUrl, year, status, releaseDate, action } = body as {
    kind?: unknown;
    tmdbId?: unknown;
    title?: unknown;
    posterUrl?: unknown;
    year?: unknown;
    status?: unknown;
    releaseDate?: unknown;
    action?: unknown;
  };
  if (!isWatchKind(kind)) return badRequest('kind must be movie, show, or anime.');
  if (typeof tmdbId !== 'string' || !/^\d+$/.test(tmdbId)) return badRequest('tmdbId must be a numeric id.');
  if (action !== 'add' && action !== 'remove' && action !== 'set-status') {
    return badRequest('action must be add, remove, or set-status.');
  }
  if (status !== undefined && !isWatchListStatus(status)) {
    return badRequest('status must be watch_later, watching, completed, or dropped.');
  }
  if (releaseDate !== undefined && releaseDate !== null && !isReleaseDate(releaseDate)) {
    return badRequest('releaseDate must be YYYY-MM-DD.');
  }

  const where = and(
    eq(watchlistItems.userId, userId),
    eq(watchlistItems.kind, kind),
    eq(watchlistItems.tmdbId, tmdbId),
  );

  if (action === 'remove') {
    await db.delete(watchlistItems).where(where);
    return jsonResponse({ ok: true, saved: false });
  }

  if (action === 'set-status') {
    if (!status) return badRequest('status is required to re-shelve.');
    const updated = await db
      .update(watchlistItems)
      .set({ status })
      .where(where)
      .returning({ id: watchlistItems.id });
    if (updated.length === 0) {
      return jsonResponse({ error: 'not_found', message: 'That title is not on your list.' }, { status: 404 });
    }
    return jsonResponse({ ok: true, saved: true, status });
  }

  if (typeof title !== 'string' || !title.trim()) return badRequest('title is required to save.');
  await db
    .insert(watchlistItems)
    .values({
      userId,
      kind,
      tmdbId,
      title: title.trim().slice(0, 300),
      posterUrl: typeof posterUrl === 'string' ? posterUrl.slice(0, 500) : null,
      year: typeof year === 'string' ? year.slice(0, 12) : null,
      status: status ?? 'watch_later',
      releaseDate: isReleaseDate(releaseDate) ? releaseDate : null,
    })
    .onConflictDoNothing();
  return jsonResponse({ ok: true, saved: true });
}
