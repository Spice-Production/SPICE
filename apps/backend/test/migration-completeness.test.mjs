import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../db/schema.ts', import.meta.url);
const migrationsUrl = new URL('../db/migrations/', import.meta.url);

// Every pgTable in schema.ts must be creatable from the migrations folder
// alone: self-host boots a FRESH Postgres and applies migrations in journal
// order, while Neon accumulated tables via `db:push` (see db:push script).
// A table/column that only ever reached Neon via push breaks first boot with
// "relation does not exist" (observed: listen_together_* in 0014).
function schemaTables(source) {
  const tables = new Map();
  const starts = [...source.matchAll(/pgTable\(\s*['"]([a-z_0-9]+)['"]/g)].map((m) => ({
    name: m[1],
    index: m.index,
  }));
  for (const { name } of starts) tables.set(name, new Set());
  for (const m of source.matchAll(/^\s{4}[A-Za-z0-9]+:\s*\w+\('([a-z_0-9]+)'/gm)) {
    const owner = starts.filter((s) => s.index < m.index).pop();
    if (owner) tables.get(owner.name).add(m[1]);
  }
  return tables;
}

function migrationColumns(sqlFiles) {
  const tables = new Map();
  const ensure = (t) => {
    if (!tables.has(t)) tables.set(t, new Set());
    return tables.get(t);
  };
  for (const sql of sqlFiles) {
    for (const m of sql.matchAll(/CREATE TABLE[^;]*?"([a-z_0-9]+)"\s*\(([\s\S]*?)\);/g)) {
      const cols = ensure(m[1]);
      for (const c of m[2].matchAll(/"([a-z_0-9]+)"\s+(?:uuid|text|integer|boolean|timestamp|numeric|jsonb?|bigint|serial|varchar|char|double|real|date|time|interval|bytea)\b/g)) {
        cols.add(c[1]);
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE[^;]*?"([a-z_0-9]+)"[^;]*?ADD COLUMN (?:IF NOT EXISTS )?\"([a-z_0-9]+)\"/g)) {
      ensure(m[1]).add(m[2]);
    }
  }
  return tables;
}

test('migrations create every schema table (fresh self-host boot)', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  const files = (await readdir(migrationsUrl)).filter((f) => f.endsWith('.sql'));
  const sqlFiles = await Promise.all(
    files.map((f) => readFile(new URL(f, migrationsUrl), 'utf8')),
  );
  const migrated = migrationColumns(sqlFiles);

  const missingTables = [...schemaTables(schema).keys()].filter((t) => !migrated.has(t));
  assert.deepEqual(
    missingTables,
    [],
    `tables in schema.ts with no CREATE TABLE in db/migrations (fresh boots fail): ${missingTables.join(', ')}`,
  );
});

test('migrations define every schema column (fresh self-host boot)', async () => {
  const schema = await readFile(schemaUrl, 'utf8');
  assert.ok(schemaTables(schema).size > 10, 'schema table extraction looks broken');
  const files = (await readdir(migrationsUrl)).filter((f) => f.endsWith('.sql'));
  const sqlFiles = await Promise.all(
    files.map((f) => readFile(new URL(f, migrationsUrl), 'utf8')),
  );
  const migrated = migrationColumns(sqlFiles);

  const gaps = [];
  for (const [table, columns] of schemaTables(schema)) {
    const have = migrated.get(table) ?? new Set();
    for (const column of columns) {
      if (!have.has(column)) gaps.push(`${table}.${column}`);
    }
  }
  assert.deepEqual(
    gaps,
    [],
    `columns in schema.ts missing from db/migrations DDL (fresh boots drift from Neon): ${gaps.join(', ')}`,
  );
});
