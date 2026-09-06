import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { remoteMediaDevices } from '@/db/schema';
import { verifySession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { accountModerationErrorPayload } from '@/lib/moderation';
import {
  REMOTE_MEDIA_DEVICE_LIMIT,
  createRemoteMediaDeviceToken,
  hashRemoteMediaDeviceToken,
  normalizeRemoteMediaDeviceName,
  noteRemoteMediaDeviceTokenHash,
} from '@/lib/remote-media-devices';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

function unauthenticated(message: string) {
  return jsonResponse({ error: 'unauthenticated', message }, { status: 401 });
}

async function sessionUserId(request: Request): Promise<string | Response> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return unauthenticated('A session bearer token is required to manage media devices.');
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse(
      { error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' },
      { status: 500 },
    );
  }
  try {
    const session = await verifySession(auth.substring(7));
    return session.userId;
  } catch (error) {
    const moderationPayload = accountModerationErrorPayload(error);
    if (moderationPayload) {
      return jsonResponse(moderationPayload, { status: 403 });
    }
    return unauthenticated('The session token is invalid.');
  }
}

export async function GET(request: Request) {
  const userIdOrResponse = await sessionUserId(request);
  if (typeof userIdOrResponse !== 'string') return userIdOrResponse;

  const devices = await db.query.remoteMediaDevices.findMany({
    columns: { id: true, deviceName: true, createdAt: true },
    where: eq(remoteMediaDevices.userId, userIdOrResponse),
    orderBy: asc(remoteMediaDevices.createdAt),
  });

  return jsonResponse({
    devices: devices.map((device) => ({
      id: device.id,
      name: device.deviceName,
      createdAt: device.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const userIdOrResponse = await sessionUserId(request);
  if (typeof userIdOrResponse !== 'string') return userIdOrResponse;
  const userId = userIdOrResponse;

  const body = await request.json().catch(() => ({}));
  const name = normalizeRemoteMediaDeviceName((body as Record<string, unknown>).name);
  if (!name) {
    return jsonResponse(
      { error: 'invalid_device_name', message: 'A non-empty device name (max 64 characters) is required.' },
      { status: 400 },
    );
  }

  const existing = await db.query.remoteMediaDevices.findMany({
    columns: { id: true },
    where: eq(remoteMediaDevices.userId, userId),
  });
  if (existing.length >= REMOTE_MEDIA_DEVICE_LIMIT) {
    return jsonResponse(
      { error: 'device_limit', message: `Up to ${REMOTE_MEDIA_DEVICE_LIMIT} media devices per account.` },
      { status: 409 },
    );
  }

  const token = createRemoteMediaDeviceToken();
  const tokenHash = hashRemoteMediaDeviceToken(token);
  if (!tokenHash) {
    return jsonResponse(
      { error: 'device_token_failed', message: 'Failed to mint a media device token.' },
      { status: 500 },
    );
  }

  const [row] = await db.insert(remoteMediaDevices).values({
    userId,
    deviceName: name,
    tokenHash,
  }).returning({
    id: remoteMediaDevices.id,
    deviceName: remoteMediaDevices.deviceName,
    createdAt: remoteMediaDevices.createdAt,
  });

  // Write through to the gate allowlist so the token passes immediately.
  noteRemoteMediaDeviceTokenHash(tokenHash);

  // The plaintext token is returned exactly once; only its hash is stored.
  return jsonResponse({
    id: row.id,
    name: row.deviceName,
    token,
    createdAt: row.createdAt.toISOString(),
  });
}
