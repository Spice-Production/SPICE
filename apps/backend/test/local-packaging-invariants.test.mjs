// Guards for the offline local-runtime pipeline. Each test encodes an
// invariant that previously only lived in CI's head and cost us a red build:
//   1. every API route family must be classified pruned-vs-local (no drift)
//   2. the two packager lists (prefixes + delete targets) must stay in sync
//   3. every Drizzle table needs a local-schema-stub export
//   4. backend sources must be pure UTF-8 (Turbopack's rope reader on Linux)
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '..', '..');

// Route families served locally by the offline runtime, by design. They must
// never import the database; keep this list short and reviewed.
const INTENTIONALLY_LOCAL_FAMILIES = new Set([
  'runtime', // local runtime self-description endpoints
  'sc', // SoundCloud stream resolution (no DB)
  'yt', // YouTube search/stream resolution (no DB)
]);

async function readBackend(rel) {
  return readFile(path.join(backendRoot, rel), 'utf8');
}

function extractPackageScriptLists(scriptText) {
  const prefixFamilies = new Set();
  for (const match of scriptText.matchAll(/'\/api\/([a-z-]+)'/g)) {
    prefixFamilies.add(match[1]);
  }
  const deletedFamilies = new Set();
  for (const match of scriptText.matchAll(/'[^']*\/app\/api\/([a-z-]+)'/g)) {
    deletedFamilies.add(match[1]);
  }
  return { prefixFamilies, deletedFamilies };
}

test('every API route family is classified as pruned or intentionally local', async () => {
  const apiDir = path.join(backendRoot, 'app', 'api');
  const families = (await readdir(apiDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const scriptText = await readBackend('scripts/package-local-windows.mjs');
  const { prefixFamilies } = extractPackageScriptLists(scriptText);

  const unclassified = families.filter(
    (family) => !INTENTIONALLY_LOCAL_FAMILIES.has(family) && !prefixFamilies.has(family),
  );
  assert.deepEqual(
    unclassified,
    [],
    `route families missing from the local packager prune list: ${unclassified.join(', ')}. `
      + 'Cloud-only routes MUST be added to cloudApiPrefixes AND pruneLocalPackage.deleteTargets '
      + '(package-local-windows.mjs); truly local-safe routes belong in INTENTIONALLY_LOCAL_FAMILIES here.',
  );
  assert.deepEqual(
    [...prefixFamilies].filter((family) => !families.includes(family)),
    [],
    'prune list contains families that no longer exist on disk; drop them',
  );
});

// Catch-all proxy routes: exempt from pruning by design (the local runtime's
// own endpoints and its cloud forwarder). They must never touch the database;
// the dedicated test below enforces that at source level.
const PROXY_FAMILIES = new Set(['local', 'cloud']);

test('every cloudApiPrefixes entry is pruned or an explicit proxy route', async () => {
  const scriptText = await readBackend('scripts/package-local-windows.mjs');
  const { prefixFamilies, deletedFamilies } = extractPackageScriptLists(scriptText);

  // A prefix that is neither deleted nor a declared proxy would silently ship
  // DB-referencing code into the offline runtime without failing the build.
  const unhandled = [...prefixFamilies].filter(
    (family) => !deletedFamilies.has(family) && !PROXY_FAMILIES.has(family),
  );
  assert.deepEqual(
    unhandled,
    [],
    'cloudApiPrefixes entries missing from deleteTargets and not declared in PROXY_FAMILIES',
  );

  const deleteOnly = [...deletedFamilies].filter((family) => !prefixFamilies.has(family));
  assert.deepEqual(deleteOnly, [], 'deleteTargets entries missing from cloudApiPrefixes');
});

test('route families kept in the local runtime stay free of database references', async () => {
  const { walk } = await import('./helpers/walk-source-files.mjs');
  const keptFamilies = [...INTENTIONALLY_LOCAL_FAMILIES, ...PROXY_FAMILIES];
  for (const family of keptFamilies) {
    const dir = path.join(backendRoot, 'app', 'api', family);
    for await (const file of walk(dir, ['.ts', '.tsx'])) {
      const text = await readFile(file, 'utf8').catch(() => '');
      assert.doesNotMatch(
        text,
        /drizzle-orm|@\/db|DATABASE_URL|@neondatabase/,
        `${path.relative(backendRoot, file)} is kept in the local runtime but references the database`,
      );
    }
  }
});

test('local schema stub covers every exported table in schema.ts', async () => {
  const schemaText = await readBackend('db/schema.ts');
  const stubText = await readBackend('db/local-schema-stub.ts');

  const tables = [...schemaText.matchAll(/export const (\w+) = pgTable\(/g)].map((m) => m[1]);
  assert.ok(tables.length > 0, 'schema.ts should export at least one table');

  const stubbed = new Set([...stubText.matchAll(/export const (\w+) = tableStub;/g)].map((m) => m[1]));
  const missing = tables.filter((table) => !stubbed.has(table));
  assert.deepEqual(
    missing,
    [],
    `tables missing from db/local-schema-stub.ts (local builds alias @/db/schema to it): ${missing.join(', ')}`,
  );
});

test('backend sources are pure UTF-8', async () => {
  const { walk } = await import('./helpers/walk-source-files.mjs');
  const bad = [];
  for await (const file of walk(backendRoot, ['.ts', '.tsx', '.mjs', '.js', '.json', '.css', '.md', '.svg'])) {
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) continue;
    try {
      new TextDecoder('utf8', { fatal: true }).decode(bytes);
    } catch {
      bad.push(path.relative(backendRoot, file));
    }
  }
  assert.deepEqual(
    bad,
    [],
    `non-UTF-8 bytes will break Linux/Turbopack source reading ("failed to convert rope into string"): ${bad.join(', ')}`,
  );
});
