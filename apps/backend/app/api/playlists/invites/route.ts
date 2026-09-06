import { randomBytes } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { effectiveRequestOrigin } from '@/lib/request-host';
import { db } from '@/db';
import { playlistInvites, playlists } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inviteTtlMs = 30 * 24 * 60 * 60 * 1000;

export function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized', message: 'Missing auth header.' }, { status: 401 });
    }

    const session = await verifySession(auth.substring(7));
    if (!process.env.DATABASE_URL) {
      return jsonResponse(
        { error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const playlistId = typeof body.playlistId === 'string' ? body.playlistId : '';
    if (!uuidPattern.test(playlistId)) {
      return jsonResponse({ error: 'invalid_playlist_id', message: 'Playlist id must be a UUID before sharing.' }, { status: 400 });
    }

    const playlist = await db.query.playlists.findFirst({
      where: and(
        eq(playlists.id, playlistId),
        eq(playlists.userId, session.userId),
        isNull(playlists.deletedAt),
      ),
    });

    if (!playlist) {
      return jsonResponse({ error: 'playlist_not_found', message: 'Only the playlist owner can create share links.' }, { status: 404 });
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + inviteTtlMs);
    await db.insert(playlistInvites).values({
      playlistId,
      ownerUserId: session.userId,
      token,
      role: 'listener',
      expiresAt,
    });

    return jsonResponse({
      token,
      inviteUrl: `${effectiveRequestOrigin(request)}/?playlistInvite=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'playlist_invite_failed',
        message: error instanceof Error ? error.message : 'Failed to create playlist invite.',
      },
      { status: 500 },
    );
  }
}
