import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { remoteMediaDevices } from '@/db/schema';
import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { accountModerationErrorPayload } from '@/lib/moderation';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'unauthenticated', message: 'A session bearer token is required to manage media devices.' },
      { status: 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return jsonResponse(
      { error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' },
      { status: 500 },
    );
  }

  let userId: string;
  try {
    const session = await verifySession(auth.substring(7));
    userId = session.userId;
  } catch (error) {
    const moderationPayload = accountModerationErrorPayload(error);
    if (moderationPayload) {
      return jsonResponse(moderationPayload, { status: 403 });
    }
    return jsonResponse(
      { error: 'unauthenticated', message: 'The session token is invalid.' },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return jsonResponse(
      { error: 'device_not_found', message: 'No such media device on this account.' },
      { status: 404 },
    );
  }

  // Ownership is enforced in the WHERE clause: missing-or-not-yours revokes
  // zero rows and reports 404 without revealing which case applied.
  const existing = await db
    .select({ tokenHash: remoteMediaDevices.tokenHash })
    .from(remoteMediaDevices)
    .where(and(eq(remoteMediaDevices.id, id), eq(remoteMediaDevices.userId, userId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) {
    return jsonResponse(
      { error: 'device_not_found', message: 'No such media device on this account.' },
      { status: 404 },
    );
  }

  await db.delete(remoteMediaDevices).where(
    and(eq(remoteMediaDevices.id, id), eq(remoteMediaDevices.userId, userId)),
  );

  return jsonResponse({ revoked: true });
}
