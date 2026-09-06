import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { isNeonDatabaseUrl } from '../db/index.ts';

const runtimeTargetSource = await readFile(new URL('../lib/runtime-target.ts', import.meta.url), 'utf8');
const nextConfigSource = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');

test('selfhost joins the runtime target union without disturbing defaults', () => {
  assert.match(
    runtimeTargetSource,
    /export type SpiceRuntimeTarget = 'local' \| 'vercel' \| 'selfhost';/,
    'selfhost must be a first-class runtime target',
  );
  assert.match(
    runtimeTargetSource,
    /if \(configured === 'local' \|\| configured === 'vercel' \|\| configured === 'selfhost'\)/,
    'explicit selfhost opt-in; anything else still falls back to local/vercel',
  );
  assert.match(
    runtimeTargetSource,
    /return target === 'local' \|\| target === 'selfhost';/,
    'media routes stay enabled on selfhost',
  );
  assert.match(
    runtimeTargetSource,
    /return target === 'vercel' \|\| target === 'selfhost';/,
    'cloud routes stay enabled on selfhost',
  );
});

test('selfhost public hosts pass the loopback gate; others still fail', () => {
  assert.match(
    runtimeTargetSource,
    /if \(getRuntimeTarget\(\) === 'selfhost' && isSelfhostPublicHost\(url\.hostname\)\)/,
    'the configured public origin must pass requireLocalRuntime on selfhost',
  );
  assert.match(
    runtimeTargetSource,
    /error: 'loopback_required'/,
    'non-loopback, non-public hosts must still be rejected',
  );
});

test('public-host media calls need same-origin or a bearer token', () => {
  assert.match(
    runtimeTargetSource,
    /export function requireSelfhostMediaAuth/,
    'media authorization must be a dedicated exported gate',
  );
  assert.match(
    runtimeTargetSource,
    /if \(publicHost && \(originHost === publicHost \|\| refererHost === publicHost\)\) return null;/,
    'browsers on the site pass via Origin/Referer',
  );
  assert.match(
    runtimeTargetSource,
    /authorization.*Bearer \$\{token\}/,
    'non-browser clients pass with the configured media token',
  );
  assert.match(
    runtimeTargetSource,
    /error: 'media_auth_required'/,
    'everyone else gets a 401, not silent media proxying',
  );
  assert.match(
    runtimeTargetSource,
    /SPICE_PUBLIC_ORIGIN/,
    'the public host comes from configuration, not request headers',
  );
});

test('selfhost builds the full player UI with real database routes', () => {
  assert.match(
    nextConfigSource,
    /configuredTarget === 'vercel' \|\| configuredTarget === 'selfhost'/,
    'selfhost must be a distinct build target, not a local fallback',
  );
  assert.match(
    nextConfigSource,
    /const runtimeHome = runtimeTarget === "vercel"\s*\n\s*\? "\.\/app\/cloud-portal\.tsx"\s*\n\s*: "\.\/app\/spice-app\.tsx";/,
    'selfhost serves the full player UI, not the thin cloud portal',
  );
});

test('Neon URLs keep the HTTP driver; everything else uses pooled Postgres', () => {
  assert.equal(isNeonDatabaseUrl('postgres://user:pass@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require'), true);
  assert.equal(isNeonDatabaseUrl('postgres://user:pass@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require'), true);
  assert.equal(isNeonDatabaseUrl('postgres://spice:secret@db:5432/spice'), false);
  assert.equal(isNeonDatabaseUrl('postgres://user:pass@localhost:5432/spice'), false);
  assert.equal(isNeonDatabaseUrl('not-a-url'), false);
});

test('non-Neon databases expose the Neon dialect surface without connecting', async () => {
  process.env.DATABASE_URL = 'postgres://spice:secret@localhost:5432/spice';
  const { db } = await import('../db/index.ts');
  assert.equal(typeof db.batch, 'function', 'batch must be emulated for node-postgres');
  assert.equal(typeof db.select, 'function');
  assert.equal(typeof db.transaction, 'function');
  delete process.env.DATABASE_URL;
});
