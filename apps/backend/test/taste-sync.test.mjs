import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tsImport } from 'tsx/esm/api';

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const importRoute = (path) => tsImport(path, {
  parentURL: import.meta.url,
  tsconfig,
});

const { isTasteSyncKind, planTasteStateUpserts } = await importRoute('../app/api/sync/taste/route.ts');

test('taste sync kinds are validated', () => {
  assert.ok(isTasteSyncKind('adaptive'));
  assert.ok(isTasteSyncKind('preferences'));
  assert.ok(isTasteSyncKind('events'));
  assert.ok(!isTasteSyncKind('history'));
  assert.ok(!isTasteSyncKind(''));
});

test('newer local snapshots win, older ones are skipped', () => {
  const existing = [
    { kind: 'adaptive', payload: '{"a":1}', updatedAtMs: 200 },
    { kind: 'events', payload: '[]', updatedAtMs: 500 },
  ];
  const incoming = [
    { kind: 'adaptive', payload: '{"a":2}', updatedAt: 300 },
    { kind: 'events', payload: '["older"]', updatedAt: 100 },
    { kind: 'preferences', payload: '{"discoveryLevel":80}', updatedAt: 400 },
  ];

  const plan = planTasteStateUpserts(existing, incoming);
  assert.deepEqual(plan.upserts.map((state) => state.kind), ['adaptive', 'preferences']);
  assert.deepEqual(plan.skipped, ['events']);
});

test('equal timestamps keep the stored snapshot', () => {
  const plan = planTasteStateUpserts(
    [{ kind: 'adaptive', payload: 'stored', updatedAtMs: 100 }],
    [{ kind: 'adaptive', payload: 'incoming', updatedAt: 100 }],
  );
  assert.deepEqual(plan.upserts, []);
  assert.deepEqual(plan.skipped, ['adaptive']);
});

test('kinds with no stored row always upsert', () => {
  const plan = planTasteStateUpserts([], [
    { kind: 'preferences', payload: '{}', updatedAt: 0 },
  ]);
  assert.deepEqual(plan.upserts.map((state) => state.kind), ['preferences']);
});
