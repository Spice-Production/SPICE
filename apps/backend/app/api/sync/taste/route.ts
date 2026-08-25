import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { db } from '@/db';
import { tasteState } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export const TASTE_SYNC_KINDS = ['adaptive', 'preferences', 'events'] as const;
export type TasteSyncKind = (typeof TASTE_SYNC_KINDS)[number];

export const TASTE_SYNC_MAX_PAYLOAD_CHARS = 512 * 1024;

export interface TasteSyncState {
  kind: TasteSyncKind;
  payload: string;
  updatedAt: number;
}

export function isTasteSyncKind(value: unknown): value is TasteSyncKind {
  return typeof value === 'string' && (TASTE_SYNC_KINDS as readonly string[]).includes(value);
}

/**
 * Last-writer-wins per taste kind. The client sends full snapshots with an
 * updatedAt stamp; the server keeps whichever side is newer so a stale device
 * cannot clobber fresher learning.
 */
export function planTasteStateUpserts(
  existing: { kind: string; payload: string; updatedAtMs: number }[],
  incoming: TasteSyncState[],
): { upserts: TasteSyncState[]; skipped: TasteSyncKind[] } {
  const existingByKind = new Map(existing.map((row) => [row.kind, row]));
  const upserts: TasteSyncState[] = [];
  const skipped: TasteSyncKind[] = [];

  for (const state of incoming) {
    const current = existingByKind.get(state.kind);
    if (current && current.updatedAtMs >= state.updatedAt) {
      skipped.push(state.kind);
      continue;
    }
    upserts.push(state);
  }

  return { upserts, skipped };
}

function normalizeIncomingState(raw: unknown): TasteSyncState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { kind?: unknown; payload?: unknown; updatedAt?: unknown };
  if (!isTasteSyncKind(candidate.kind)) return null;
  if (typeof candidate.payload !== 'string') return null;
  if (candidate.payload.length > TASTE_SYNC_MAX_PAYLOAD_CHARS) return null;
  const updatedAt = Number(candidate.updatedAt);
  return {
    kind: candidate.kind,
    payload: candidate.payload,
    updatedAt: Number.isFinite(updatedAt) ? Math.max(0, Math.trunc(updatedAt)) : 0,
  };
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized', message: 'Missing auth header.' }, { status: 401 });
    }

    const token = auth.substring(7);
    const session = await verifySession(token);

    if (!process.env.DATABASE_URL) {
      return jsonResponse({ error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId') || 'default';

    const rows = await db.query.tasteState.findMany({
      where: and(
        eq(tasteState.userId, session.userId),
        eq(tasteState.profileId, profileId),
      ),
    });

    const states: Partial<Record<TasteSyncKind, { payload: string; updatedAt: number }>> = {};
    for (const row of rows) {
      if (!isTasteSyncKind(row.kind)) continue;
      states[row.kind] = {
        payload: row.payload,
        updatedAt: new Date(row.updatedAt).getTime(),
      };
    }

    return jsonResponse({ states, profileId });
  } catch (error) {
    return jsonResponse(
      {
        error: 'sync_get_taste_failed',
        message: error instanceof Error ? error.message : 'Failed to retrieve cloud taste state.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized', message: 'Missing auth header.' }, { status: 401 });
    }

    const token = auth.substring(7);
    const session = await verifySession(token);

    if (!process.env.DATABASE_URL) {
      return jsonResponse({ error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const rawStates = Array.isArray(body?.states) ? body.states : [];
    const profileId = typeof body?.profileId === 'string' && body.profileId.trim()
      ? body.profileId.trim().slice(0, 64)
      : 'default';

    const incoming: TasteSyncState[] = [];
    for (const raw of rawStates) {
      const normalized = normalizeIncomingState(raw);
      if (normalized) incoming.push(normalized);
    }
    if (incoming.length === 0) {
      return jsonResponse({ error: 'invalid_payload', message: 'Payload must include at least one valid taste state.' }, { status: 400 });
    }

    const existingRows = await db.query.tasteState.findMany({
      where: and(
        eq(tasteState.userId, session.userId),
        eq(tasteState.profileId, profileId),
      ),
    });

    const plan = planTasteStateUpserts(
      existingRows.map((row) => ({
        kind: row.kind,
        payload: row.payload,
        updatedAtMs: new Date(row.updatedAt).getTime(),
      })),
      incoming,
    );

    for (const upsert of plan.upserts) {
      await db
        .insert(tasteState)
        .values({
          userId: session.userId,
          profileId,
          kind: upsert.kind,
          payload: upsert.payload,
          updatedAt: new Date(upsert.updatedAt),
        })
        .onConflictDoUpdate({
          target: [tasteState.userId, tasteState.profileId, tasteState.kind],
          set: {
            payload: upsert.payload,
            updatedAt: new Date(Math.max(1, upsert.updatedAt)),
          },
        });
    }

    return jsonResponse({
      success: true,
      saved: plan.upserts.map((state) => state.kind),
      skipped: plan.skipped,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'sync_post_taste_failed',
        message: error instanceof Error ? error.message : 'Failed to save cloud taste state.',
      },
      { status: 500 },
    );
  }
}
