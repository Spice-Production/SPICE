import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('watch state endpoint returns list, resume, and completions behind account auth', async () => {
  const source = await read('app/api/watch/state/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /status: 401/, 'signed-out callers get 401');
  assert.match(source, /watchlist: list/, 'watchlist included');
  assert.match(source, /continueWatching: progress/, 'continue-watching included');
  assert.match(source, /completed \}/, 'completions included so checkmarks survive reloads');
  assert.match(source, /eq\(watchProgress\.completed, false\)/, 'resume rail hides finished items');
});

test('watchlist toggle validates input and add/remove both succeed idempotently', async () => {
  const source = await read('app/api/watch/watchlist/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /kind must be movie, show, or anime/, 'anime rides the same endpoint later');
  assert.match(source, /tmdbId must be a numeric id/, 'id shape validated');
  assert.match(source, /action must be add or remove/, 'action validated');
  assert.match(source, /onConflictDoNothing/, 'double-tap add stays a 200');
  assert.match(source, /Removing a missing row still succeeds/, 'remove is idempotent');
});

test('progress tracks episode granularity and refuses season numbers on movies', async () => {
  const source = await read('app/api/watch/progress/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /movies track no season or episode/, 'movies stay season-free');
  assert.match(source, /no position field/, 'no fake timestamps: embeds report none');
  assert.match(source, /update\(watchProgress\)/, 'repeat visits update, not duplicate');
});

test('browse shelves and players share one client and one toggle island', async () => {
  const client = await read('app/watch-client.ts');
  assert.match(client, /spice_cloud_token/, 'same token the music player stores — no second login per page');
  assert.match(client, /\/shows\/watch\//, 'resume links land on the episode');
  const shelves = await read('app/watch-shelves.tsx');
  assert.match(shelves, /Continue watching/, 'resume rail present');
  assert.match(shelves, /My List/, 'watchlist rail present');
  const sync = await read('app/watch-sync.tsx');
  assert.match(sync, /reportProgress\(token/, 'opening a title reports it');
  assert.match(sync, /MediaSignIn/, 'signed-out visitors get a sign-in, not dead buttons');
  const moviePage = await read('app/movie/watch/[tmdbId]/page.tsx');
  assert.match(moviePage, /<WatchSync/, 'film page syncs');
  const showPlayer = await read('app/shows/watch/[id]/show-player.tsx');
  assert.match(showPlayer, /<WatchSync/, 'series player syncs per episode');
});
