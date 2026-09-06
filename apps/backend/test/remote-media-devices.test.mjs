import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tsImport } from 'tsx/esm/api';

import { enableDatabaseIntegrationTests } from './database-test-helper.mjs';

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const importTs = (path) => tsImport(path, {
  parentURL: import.meta.url,
  tsconfig,
});

const devices = await importTs('../lib/remote-media-devices.ts');
const {
  REMOTE_MEDIA_DEVICE_TOKEN_PREFIX,
  REMOTE_MEDIA_DEVICE_NAME_MAX_LENGTH,
  REMOTE_MEDIA_DEVICE_LIMIT,
  createRemoteMediaDeviceToken,
  isRemoteMediaDeviceToken,
  hashRemoteMediaDeviceToken,
  normalizeRemoteMediaDeviceName,
  isRegisteredRemoteMediaDeviceToken,
} = devices;

test('media device tokens carry the spice_rm_ prefix and hash to sha256 hex', () => {
  const token = createRemoteMediaDeviceToken();
  assert.ok(isRemoteMediaDeviceToken(token), 'generated token must validate');
  assert.ok(token.startsWith('spice_rm_'), 'token must carry the spice_rm_ prefix');
  const expected = createHash('sha256').update(token).digest('hex');
  assert.equal(hashRemoteMediaDeviceToken(token), expected);
  assert.match(hashRemoteMediaDeviceToken(token), /^[0-9a-f]{64}$/);
});

test('media device token helpers reject foreign values', () => {
  assert.equal(REMOTE_MEDIA_DEVICE_TOKEN_PREFIX, 'spice_rm_');
  assert.equal(isRemoteMediaDeviceToken('Bearer abc'), false);
  assert.equal(isRemoteMediaDeviceToken(''), false);
  assert.equal(isRemoteMediaDeviceToken(null), false);
  assert.equal(hashRemoteMediaDeviceToken('not-a-device-token'), null);
  assert.equal(hashRemoteMediaDeviceToken(null), null);
});

test('media device names are trimmed, required, and capped at 64 chars', () => {
  assert.equal(REMOTE_MEDIA_DEVICE_NAME_MAX_LENGTH, 64);
  assert.equal(REMOTE_MEDIA_DEVICE_LIMIT, 10);
  assert.equal(normalizeRemoteMediaDeviceName('  Living Room  '), 'Living Room');
  assert.equal(normalizeRemoteMediaDeviceName(''), null);
  assert.equal(normalizeRemoteMediaDeviceName('   '), null);
  assert.equal(normalizeRemoteMediaDeviceName(null), null);
  assert.equal(normalizeRemoteMediaDeviceName(42), null);
  const long = normalizeRemoteMediaDeviceName('x'.repeat(200));
  assert.ok(long && long.length <= 64, 'over-long names must be capped');
});

test('device account routes require a session bearer token', async () => {
  const collectionRoute = await importTs('../app/api/account/devices/route.ts');
  const itemRoute = await importTs('../app/api/account/devices/[id]/route.ts');

  const base = 'https://music.spice-app.xyz/api/account/devices';
  const get = await collectionRoute.GET(new Request(base));
  assert.equal(get.status, 401);

  const post = await collectionRoute.POST(
    new Request(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Living Room' }),
    }),
  );
  assert.equal(post.status, 401);

  const del = await itemRoute.DELETE(
    new Request(`${base}/3c4703df-00f7-4cb8-82b7-0fa6ea4a15b2`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: '3c4703df-00f7-4cb8-82b7-0fa6ea4a15b2' }) },
  );
  assert.equal(del.status, 401);
});

test('device account routes never leak token hashes', async () => {
  const collectionSource = await readFile(
    new URL('../app/api/account/devices/route.ts', import.meta.url),
    'utf8',
  );
  const itemSource = await readFile(
    new URL('../app/api/account/devices/[id]/route.ts', import.meta.url),
    'utf8',
  );
  // GET reads an explicit column allowlist and maps only id/name/createdAt.
  assert.match(collectionSource, /id: remoteMediaDevices\.id,/);
  assert.match(collectionSource, /deviceName: remoteMediaDevices\.deviceName,/);
  assert.match(collectionSource, /createdAt: remoteMediaDevices\.createdAt,/);
  assert.match(collectionSource, /devices: devices\.map/);
  assert.match(
    collectionSource,
    /id: device\.id,\s+name: device\.deviceName,\s+createdAt: device\.createdAt\.toISOString\(\),/,
  );
  // POST returns the plaintext token once; the revoke response is a bare flag.
  assert.match(collectionSource, /token,\s+createdAt: row\.createdAt\.toISOString\(\),/);
  assert.doesNotMatch(itemSource, /jsonResponse\(\{[^}]*tokenHash/s);
  assert.match(collectionSource, /device_limit/);
  assert.match(itemSource, /revoked/);
});

test('remote_media_devices table matches the auth contract', async () => {
  const schema = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /pgTable\(\s*['"]remote_media_devices['"]/);
  assert.match(schema, /deviceName:\s*text\(['"]device_name['"]\)/);
  assert.match(schema, /tokenHash:\s*text\(['"]token_hash['"]\)[^;]*?\.unique\(\)/s);
  assert.match(schema, /remoteMediaDevices/);
});

test('selfhost media gate accepts per-device tokens by token_hash lookup', async () => {
  const source = await readFile(new URL('../lib/runtime-target.ts', import.meta.url), 'utf8');
  assert.match(source, /SPICE_SELFHOST_MEDIA_TOKEN/);
  assert.match(
    source,
    /if \(token && request\.headers\.get\('authorization'\)\?\.trim\(\) === `Bearer \$\{token\}`\) return null;/,
    'shared media token still passes first, unchanged',
  );
  assert.match(source, /isRegisteredRemoteMediaDeviceToken\(request\.headers\.get\('authorization'\)\)/);

  const libSource = await readFile(new URL('../lib/remote-media-devices.ts', import.meta.url), 'utf8');
  assert.match(libSource, /eq\(remoteMediaDevices\.tokenHash, tokenHash\)/);
  assert.match(libSource, /sha256/);
  assert.match(libSource, /remoteMediaDevices/);
});

test('unregistered and foreign bearers fail without touching the database', async () => {
  // No SPICE_TEST_DATABASE_URL here: these must resolve false on shape
  // alone (or fail closed when the DB is unreachable) — never throw.
  assert.equal(await isRegisteredRemoteMediaDeviceToken(null), false);
  assert.equal(await isRegisteredRemoteMediaDeviceToken(''), false);
  assert.equal(await isRegisteredRemoteMediaDeviceToken('Bearer shared-secret'), false);
  assert.equal(
    await isRegisteredRemoteMediaDeviceToken(`Bearer ${createRemoteMediaDeviceToken()}`),
    false,
    'well-formed but unregistered token must fail closed',
  );
});

const hasTestDb = enableDatabaseIntegrationTests();

test('device bearer passes the live selfhost gate and fails after revoke', { skip: !hasTestDb }, async () => {
  const saved = {
    target: process.env.SPICE_RUNTIME_TARGET,
    origin: process.env.SPICE_PUBLIC_ORIGIN,
    token: process.env.SPICE_SELFHOST_MEDIA_TOKEN,
  };
  process.env.SPICE_RUNTIME_TARGET = 'selfhost';
  process.env.SPICE_PUBLIC_ORIGIN = 'https://box.example';
  process.env.SPICE_SELFHOST_MEDIA_TOKEN = 'test-shared-token-nobody-uses';
  try {
    const { db } = await import('../db/index.ts');
    const { remoteMediaDevices, users } = await import('../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const { requireLocalMediaNamespace } = await importTs('../lib/runtime-target.ts');

    const mediaRequest = (authorization) => new Request('https://box.example/api/yt/track/x', {
      headers: {
        'x-spice-api-namespace': 'local',
        ...(authorization ? { authorization } : {}),
      },
    });

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [owner] = await db.insert(users).values({ email: `rmd-gate-${suffix}@example.com` }).returning();
    try {
      const token = createRemoteMediaDeviceToken();
      const tokenHash = hashRemoteMediaDeviceToken(token);
      assert.ok(tokenHash);
      await db.insert(remoteMediaDevices).values({
        userId: owner.id,
        deviceName: 'Gate Probe',
        tokenHash,
      });

      // Registered device bearer passes the full namespace + media gate.
      assert.equal(await requireLocalMediaNamespace(mediaRequest(`Bearer ${token}`)), null);
      // Shared server token still passes first, unchanged.
      assert.equal(await requireLocalMediaNamespace(mediaRequest('Bearer test-shared-token-nobody-uses')), null);

      // Revoke via the same ownership-scoped delete the route uses.
      await db.delete(remoteMediaDevices).where(eq(remoteMediaDevices.tokenHash, tokenHash));
      const denied = await requireLocalMediaNamespace(mediaRequest(`Bearer ${token}`));
      assert.ok(denied instanceof Response, 'revoked token must block');
      assert.equal(denied.status, 401);
      assert.equal((await denied.json()).error, 'media_auth_required');
    } finally {
      await db.delete(users).where(eq(users.id, owner.id));
    }

    // Loopback callers pass without any database involvement.
    assert.equal(
      await requireLocalMediaNamespace(
        new Request('http://127.0.0.1:3000/api/yt/track/x', {
          headers: { 'x-spice-api-namespace': 'local' },
        }),
      ),
      null,
    );
  } finally {
    if (saved.target === undefined) delete process.env.SPICE_RUNTIME_TARGET;
    else process.env.SPICE_RUNTIME_TARGET = saved.target;
    if (saved.origin === undefined) delete process.env.SPICE_PUBLIC_ORIGIN;
    else process.env.SPICE_PUBLIC_ORIGIN = saved.origin;
    if (saved.token === undefined) delete process.env.SPICE_SELFHOST_MEDIA_TOKEN;
    else process.env.SPICE_SELFHOST_MEDIA_TOKEN = saved.token;
  }
});

test('devices persist per user and enforce ownership on revoke', { skip: !hasTestDb }, async () => {
  const { db } = await import('../db/index.ts');
  const { remoteMediaDevices, users } = await import('../db/schema.ts');
  const { and, eq } = await import('drizzle-orm');

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [owner] = await db.insert(users).values({ email: `rmd-owner-${suffix}@example.com` }).returning();
  const [stranger] = await db.insert(users).values({ email: `rmd-stranger-${suffix}@example.com` }).returning();
  try {
    const token = createRemoteMediaDeviceToken();
    const tokenHash = hashRemoteMediaDeviceToken(token);
    assert.ok(tokenHash);
    const [row] = await db.insert(remoteMediaDevices).values({
      userId: owner.id,
      deviceName: 'Living Room',
      tokenHash,
    }).returning();
    assert.equal(row.deviceName, 'Living Room');

    const found = await db.query.remoteMediaDevices.findFirst({
      where: eq(remoteMediaDevices.tokenHash, tokenHash),
    });
    assert.equal(found?.id, row.id);

    // Another user's revoke must match zero rows (404 when missing-or-not-yours).
    const foreignRevoke = await db.delete(remoteMediaDevices).where(
      and(eq(remoteMediaDevices.id, row.id), eq(remoteMediaDevices.userId, stranger.id)),
    ).returning({ id: remoteMediaDevices.id });
    assert.equal(foreignRevoke.length, 0);

    const ownRevoke = await db.delete(remoteMediaDevices).where(
      and(eq(remoteMediaDevices.id, row.id), eq(remoteMediaDevices.userId, owner.id)),
    ).returning({ id: remoteMediaDevices.id });
    assert.equal(ownRevoke.length, 1);
  } finally {
    await db.delete(users).where(eq(users.id, owner.id));
    await db.delete(users).where(eq(users.id, stranger.id));
  }
});
