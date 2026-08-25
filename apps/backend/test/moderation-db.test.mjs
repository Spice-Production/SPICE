import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tsImport } from 'tsx/esm/api';

import { enableDatabaseIntegrationTests } from './database-test-helper.mjs';

const hasTestDb = enableDatabaseIntegrationTests();

if (hasTestDb && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'moderation-db-test-secret';
}

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));

test('timeouts and bans block signin, sessions, and admin moderation changes', { skip: !hasTestDb }, async () => {
  const { db } = await import('../db/index.ts');
  const { users } = await import('../db/schema.ts');
  const { eq } = await import('drizzle-orm');
  const { hashPasswordAsync } = await import('../lib/hash.ts');
  const { signSession, verifySession } = await import('../lib/auth.ts');
  const { AccountModerationError } = await import('../lib/moderation.ts');
  const signinRoute = await tsImport('../app/api/auth/spice/signin/route.ts', { parentURL: import.meta.url, tsconfig });
  const meRoute = await tsImport('../app/api/account/me/route.ts', { parentURL: import.meta.url, tsconfig });
  const adminAccountsRoute = await tsImport('../app/api/admin/accounts/route.ts', { parentURL: import.meta.url, tsconfig });

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const passwordHash = await hashPasswordAsync('CorrectHorse1!');

  const [user] = await db.insert(users).values({
    email: `moderation-${suffix}@example.com`,
    username: `moderation_${suffix}`,
    passwordHash,
    emailVerifiedAt: new Date(),
  }).returning();

  const [admin] = await db.insert(users).values({
    email: `moderation-admin-${suffix}@example.com`,
    username: `moderation_admin_${suffix}`,
    passwordHash,
    emailVerifiedAt: new Date(),
    accountRole: 'admin',
  }).returning();

  const [otherAdmin] = await db.insert(users).values({
    email: `moderation-other-admin-${suffix}@example.com`,
    username: `moderation_other_admin_${suffix}`,
    passwordHash,
    emailVerifiedAt: new Date(),
    accountRole: 'admin',
  }).returning();

  const bearer = (token) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. A clean account signs in and verifies sessions.
    const cleanToken = await signSession({ userId: user.id, email: user.email, accountRole: 'user' });
    await verifySession(cleanToken);

    // 2. Timeout: signin and every authenticated call reject with details.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(users).set({
      moderationStatus: 'timeout',
      moderationExpiresAt: future,
      moderationReason: 'Temporary cooldown',
    }).where(eq(users.id, user.id));

    await assert.rejects(
      () => verifySession(cleanToken),
      (error) => {
        assert.ok(error instanceof AccountModerationError);
        assert.equal(error.code, 'account_timed_out');
        return true;
      },
    );

    const signinResponse = await signinRoute.POST(new Request('https://music.spice-app.xyz/api/auth/spice/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'CorrectHorse1!' }),
    }));
    assert.equal(signinResponse.status, 403);
    const signinBody = await signinResponse.json();
    assert.equal(signinBody.error, 'account_timed_out');
    assert.equal(signinBody.status, 'timeout');
    assert.equal(signinBody.reason, 'Temporary cooldown');
    assert.equal(signinBody.expiresAt, future.toISOString());

    const meResponse = await meRoute.GET(new Request('https://music.spice-app.xyz/api/account/me', {
      headers: await bearer(cleanToken),
    }));
    assert.equal(meResponse.status, 403);
    const meBody = await meResponse.json();
    assert.equal(meBody.error, 'account_timed_out');
    assert.equal(meBody.expiresAt, future.toISOString());

    // 3. The timeout lifts automatically once the expiry passes.
    await db.update(users).set({ moderationExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, user.id));
    await verifySession(cleanToken);
    const liftedMe = await meRoute.GET(new Request('https://music.spice-app.xyz/api/account/me', {
      headers: await bearer(cleanToken),
    }));
    assert.equal(liftedMe.status, 200);
    const liftedBody = await liftedMe.json();
    assert.equal(liftedBody.account.moderation.status, 'active');

    // 4. A permanent ban rejects with account_banned.
    await db.update(users).set({
      moderationStatus: 'banned',
      moderationExpiresAt: null,
      moderationReason: 'Permanent spam',
    }).where(eq(users.id, user.id));

    await assert.rejects(
      () => verifySession(cleanToken),
      (error) => {
        assert.ok(error instanceof AccountModerationError);
        assert.equal(error.code, 'account_banned');
        return true;
      },
    );

    const bannedSignin = await signinRoute.POST(new Request('https://music.spice-app.xyz/api/auth/spice/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'CorrectHorse1!' }),
    }));
    assert.equal(bannedSignin.status, 403);
    assert.equal((await bannedSignin.json()).error, 'account_banned');

    // 5. Admin API: unblock the account, then apply a timeout and a ban.
    const adminToken = await signSession({ userId: admin.id, email: admin.email, accountRole: 'admin' });
    const adminHeaders = { 'Content-Type': 'application/json', ...(await bearer(adminToken)) };

    const unblockResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: user.id, moderationStatus: 'active' }),
    }));
    assert.equal(unblockResponse.status, 200);
    const unblocked = (await unblockResponse.json()).account;
    assert.equal(unblocked.moderation.status, 'active');
    await verifySession(cleanToken);

    const timeoutResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        userId: user.id,
        moderationStatus: 'timeout',
        moderationDurationHours: 24,
        moderationReason: 'Abusive behavior',
      }),
    }));
    assert.equal(timeoutResponse.status, 200);
    const timedOut = (await timeoutResponse.json()).account;
    assert.equal(timedOut.moderation.status, 'timeout');
    assert.equal(timedOut.moderation.reason, 'Abusive behavior');
    assert.ok(new Date(timedOut.moderation.expiresAt).getTime() > Date.now() + 23 * 60 * 60 * 1000);

    const banResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: user.id, moderationStatus: 'banned', moderationReason: 'Spam' }),
    }));
    assert.equal(banResponse.status, 200);
    const banned = (await banResponse.json()).account;
    assert.equal(banned.moderation.status, 'banned');

    // 6. Admin accounts cannot be blocked, and legacy role bans still map.
    const protectedResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: otherAdmin.id, moderationStatus: 'banned' }),
    }));
    assert.equal(protectedResponse.status, 400);
    assert.equal((await protectedResponse.json()).error, 'admin_protected');

    const legacyResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: otherAdmin.id, accountRole: 'banned' }),
    }));
    assert.equal(legacyResponse.status, 400);

    const legacyUserResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: user.id, accountRole: 'banned' }),
    }));
    assert.equal(legacyUserResponse.status, 200);
    const legacyBanned = (await legacyUserResponse.json()).account;
    assert.equal(legacyBanned.accountRole, 'user');
    assert.equal(legacyBanned.moderation.status, 'banned');

    // 7. Invalid moderation payloads are rejected with 400.
    const invalidResponse = await adminAccountsRoute.POST(new Request('https://music.spice-app.xyz/api/admin/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId: user.id, moderationStatus: 'timeout' }),
    }));
    assert.equal(invalidResponse.status, 400);
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(users).where(eq(users.id, admin.id));
    await db.delete(users).where(eq(users.id, otherAdmin.id));
  }
});
