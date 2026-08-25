import { db } from '@/db';
import {
  users,
  accountSubscriptions,
  remoteDeviceAuthorizations,
  remotePairingCodes,
} from '@/db/schema';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { requireAdminAccount, getAccountSnapshotForUserId } from '@/lib/accounts';
import { serializeAccount, isAdminRole } from '@/lib/account';
import {
  invalidateSpiceConnectAccount,
  invalidateSpiceConnectPairedAuthorization,
} from '@/lib/spice-connect-redis';
import { resolveAccountModerationUpdate } from '@/lib/moderation';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'unauthorized', message: 'A bearer token is required to load the accounts list.' },
      { status: 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return jsonResponse(
      { error: 'database_not_configured', message: 'DATABASE_URL is not set.' },
      { status: 500 },
    );
  }

  try {
    const session = await verifySession(auth.substring(7));
    // requireAdminAccount ensures the caller has 'admin' role in the DB
    await requireAdminAccount(session);

    const userRecords = await db.select().from(users);
    const subRecords = await db.select().from(accountSubscriptions);

    const subMap = new Map(subRecords.map((sub) => [sub.userId, sub]));
    const accounts = userRecords.map((u) => serializeAccount(u, subMap.get(u.id)));

    return jsonResponse({ accounts });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.name : 'error',
        message: error instanceof Error ? error.message : 'An error occurred.',
      },
      { status: error instanceof Error && error.name === 'AccountAuthorizationError' ? 403 : 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'unauthorized', message: 'A bearer token is required to update an account.' },
      { status: 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return jsonResponse(
      { error: 'database_not_configured', message: 'DATABASE_URL is not set.' },
      { status: 500 },
    );
  }

  try {
    const session = await verifySession(auth.substring(7));
    await requireAdminAccount(session);

    const body = await request.json();
    const { userId, accountRole, subscriptionTier, subscriptionStatus } = body;

    if (!userId) {
      return jsonResponse({ error: 'bad_request', message: 'userId is required.' }, { status: 400 });
    }

    // 1. Check if the target user exists
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) {
      return jsonResponse({ error: 'user_not_found', message: 'Target user does not exist.' }, { status: 404 });
    }

    if (isAdminRole(targetUser.accountRole)) {
      return jsonResponse(
        { error: 'admin_protected', message: 'Admin accounts cannot be timed out, banned, or unblocked here.' },
        { status: 400 },
      );
    }

    // 2. Update users table if accountRole is provided (user/admin only; the
    // legacy 'banned' role value is mapped to the moderation system below).
    if (accountRole !== undefined) {
      if (accountRole !== 'user' && accountRole !== 'admin' && accountRole !== 'banned') {
        return jsonResponse({ error: 'bad_request', message: 'Invalid account role.' }, { status: 400 });
      }
      if (accountRole === 'banned') {
        const legacyReason = typeof body.moderationReason === 'string'
          ? body.moderationReason.trim().slice(0, 500) || null
          : null;
        await applyModerationUpdate(db, userId, session.userId, {
          moderationStatus: 'banned',
          ...(legacyReason !== null ? { moderationReason: legacyReason } : {}),
        });
        await revokeAccountRemoteAccess(db, userId);
      } else {
        await db.update(users)
          .set({ accountRole })
          .where(eq(users.id, userId));
        // Account authorization is cached briefly for high-frequency Connect
        // requests. Drop it immediately whenever an admin changes the role.
        await invalidateSpiceConnectAccount(userId);
      }
    }

    // 3. Apply moderation changes (temporary timeout, permanent ban, unblock).
    const hasModerationFields = [
      'moderationStatus',
      'moderationDurationHours',
      'moderationExpiresAt',
      'moderationReason',
    ].some((field) => field in body);
    if (hasModerationFields) {
      const moderationUpdate = resolveAccountModerationUpdate(body);
      if ('error' in moderationUpdate) {
        return jsonResponse({ error: 'bad_request', message: moderationUpdate.error }, { status: 400 });
      }
      await applyModerationUpdate(db, userId, session.userId, {
        moderationStatus: moderationUpdate.status,
        ...(moderationUpdate.expiresAt ? { moderationExpiresAt: moderationUpdate.expiresAt } : {}),
        ...(moderationUpdate.reason !== null ? { moderationReason: moderationUpdate.reason } : {}),
      });
      if (moderationUpdate.status === 'banned') {
        await revokeAccountRemoteAccess(db, userId);
      } else {
        await invalidateSpiceConnectAccount(userId);
      }
    }

    // 3. Update or create accountSubscriptions if tier/status are provided
    if (subscriptionTier !== undefined || subscriptionStatus !== undefined) {
      const existingSub = await db.query.accountSubscriptions.findFirst({
        where: eq(accountSubscriptions.userId, userId),
      });

      const tier = subscriptionTier !== undefined ? subscriptionTier : (existingSub?.tier ?? 'free');
      const status = subscriptionStatus !== undefined ? subscriptionStatus : (existingSub?.status ?? 'inactive');

      if (existingSub) {
        await db.update(accountSubscriptions)
          .set({
            tier,
            status,
            updatedAt: new Date(),
          })
          .where(eq(accountSubscriptions.userId, userId));
      } else {
        await db.insert(accountSubscriptions)
          .values({
            userId,
            tier,
            status,
            updatedAt: new Date(),
          });
      }
    }

    // Return the updated snapshot
    const updatedAccount = await getAccountSnapshotForUserId(userId);
    return jsonResponse({ success: true, account: updatedAccount });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.name : 'error',
        message: error instanceof Error ? error.message : 'An error occurred.',
      },
      { status: error instanceof Error && error.name === 'AccountAuthorizationError' ? 403 : 500 },
    );
  }
}

type AdminDatabase = typeof db;

async function applyModerationUpdate(
  database: AdminDatabase,
  userId: string,
  setBy: string,
  fields: {
    moderationStatus?: string;
    moderationExpiresAt?: Date;
    moderationReason?: string | null;
  },
) {
  const set: Record<string, unknown> = {
    moderationSetBy: setBy,
    moderationSetAt: new Date(),
  };
  if (fields.moderationStatus !== undefined) set.moderationStatus = fields.moderationStatus;
  if (fields.moderationExpiresAt !== undefined) set.moderationExpiresAt = fields.moderationExpiresAt;
  if (fields.moderationReason !== undefined) set.moderationReason = fields.moderationReason;

  if (set.moderationStatus === 'active') {
    set.moderationExpiresAt = null;
    set.moderationReason = null;
    set.moderationSetBy = null;
    set.moderationSetAt = null;
  }

  await database.update(users).set(set).where(eq(users.id, userId));
}

async function revokeAccountRemoteAccess(database: AdminDatabase, userId: string) {
  const revokedAt = new Date();
  const activeAuthorizations = await database.query.remoteDeviceAuthorizations.findMany({
    columns: { deviceId: true, tokenHash: true },
    where: eq(remoteDeviceAuthorizations.userId, userId),
  });
  await Promise.all([
    database.update(remoteDeviceAuthorizations)
      .set({ revokedAt })
      .where(eq(remoteDeviceAuthorizations.userId, userId)),
    database.update(remotePairingCodes)
      .set({ revokedAt })
      .where(eq(remotePairingCodes.userId, userId)),
    ...activeAuthorizations.map((authorization) => (
      invalidateSpiceConnectPairedAuthorization(userId, authorization.deviceId, authorization.tokenHash)
    )),
  ]);
  await invalidateSpiceConnectAccount(userId);
}
