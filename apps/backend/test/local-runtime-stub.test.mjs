import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as localDrizzle from '../lib/drizzle-local-stub.ts';

test('local Drizzle stub exports comparison operators used by cloud-only routes', () => {
  for (const operator of ['gt', 'gte', 'isNotNull', 'lt', 'lte']) {
    assert.equal(typeof localDrizzle[operator], 'function', `missing local Drizzle export: ${operator}`);
  }
});

test('local database stub exports every name the real database module does', async () => {
  // The local build aliases @/db to db/local-stub.ts; a missing export only
  // fails at bundle time, so pin parity here.
  const exportNames = (source) => [...source.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gmu)].map((match) => match[1]);
  const real = exportNames(await readFile(new URL('../db/index.ts', import.meta.url), 'utf8'));
  const stub = new Set(exportNames(await readFile(new URL('../db/local-stub.ts', import.meta.url), 'utf8')));
  assert.ok(real.length > 0);
  for (const name of real) assert.ok(stub.has(name), `db/local-stub.ts is missing export: ${name}`);
});
