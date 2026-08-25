import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationsUrl = new URL('../db/migrations/', import.meta.url);
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', migrationsUrl), 'utf8'),
);

test('taste state migration exists and is journaled', async () => {
  const entry = journal.entries.find((candidate) => candidate.tag === '0016_taste_state_sync');
  assert.ok(entry, '0016_taste_state_sync must have a journal entry so drizzle-kit migrate runs it');

  const sql = await readFile(new URL('0016_taste_state_sync.sql', migrationsUrl), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "taste_state"/);
  assert.match(sql, /PRIMARY KEY\("user_id","profile_id","kind"\)/);
  assert.match(sql, /REFERENCES "public"\."users"\("id"\) ON DELETE cascade/);
});

test('journal tags are unique and point at existing files', async () => {
  const tags = journal.entries.map((entry) => entry.tag);
  assert.equal(new Set(tags).size, tags.length, 'journal tags must be unique');

  for (const tag of tags) {
    await access(new URL(`${tag}.sql`, migrationsUrl));
  }
});

test('journal indices are sequential from zero', () => {
  const indices = journal.entries.map((entry) => entry.idx);
  indices.forEach((index, position) => {
    assert.equal(index, position, `journal idx at position ${position} should be ${position}`);
  });
});
