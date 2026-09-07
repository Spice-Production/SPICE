import assert from 'node:assert/strict';
import test from 'node:test';

import { browseMovies, getMovieDetails, searchMovies, tmdbApiKey } from '../lib/tmdb.ts';

const okFetch = (payload) => async () => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

test('missing query fails fast without touching the network', async () => {
  let called = 0;
  await assert.rejects(searchMovies('   ', 12, async () => { called += 1; return {}; }, 'key'));
  assert.equal(called, 0);
});

test('missing API key reports setup instead of a broken shelf', async () => {
  let called = 0;
  const err = await searchMovies('Dune', 12, async () => { called += 1; return {}; }, null).catch((e) => e);
  assert.equal(err.code, 'tmdb_key_missing');
  assert.equal(called, 0);
});

test('tmdbApiKey trims and rejects blanks', () => {
  assert.equal(tmdbApiKey('  abc  '), 'abc');
  assert.equal(tmdbApiKey('   '), null);
  assert.equal(tmdbApiKey(undefined), null);
});

test('search maps TMDB rows and drops malformed ones', async () => {
  const payload = {
    results: [
      { id: 438631, title: 'Dune', release_date: '2021-09-15', poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', overview: 'Spice must flow.' },
      { id: 'nope', title: 'Broken', release_date: '2020-01-01', poster_path: '/x.jpg', overview: '' },
      { id: 999, title: '   ', release_date: '2020-01-01', poster_path: '/y.jpg', overview: '' },
      { id: 123, title: 'No Poster', release_date: '', poster_path: null, overview: 'ok' },
    ],
  };
  const hits = await searchMovies('Dune', 12, okFetch(payload), 'key');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], {
    tmdbId: '438631',
    title: 'Dune',
    year: '2021',
    posterUrl: 'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    backdropUrl: null,
    overview: 'Spice must flow.',
  });
  assert.equal(hits[1].posterUrl, null);
  assert.equal(hits[1].year, null);
});

test('search failures surface the upstream status', async () => {
  const err = await searchMovies('Dune', 12, async () => ({ ok: false, status: 429 }), 'key').catch((e) => e);
  assert.match(err.message, /tmdb search failed \(429\)/);
});

test('browse hits the list endpoint and maps the same shape', async () => {
  let seenUrl = '';
  const hits = await browseMovies(
    'trending',
    12,
    async (url) => {
      seenUrl = String(url);
      return okFetch({ results: [{ id: 1, title: 'Hit', release_date: '2024-01-01', poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'x' }] })();
    },
    'key',
  );
  assert.match(seenUrl, /\/3\/trending\/movie\/week/);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].backdropUrl, 'https://image.tmdb.org/t/p/w780/b.jpg');
});

test('browse rejects unknown lists and missing keys', async () => {
  await assert.rejects(browseMovies('nope', 12, okFetch({ results: [] }), 'key'));
  const err = await browseMovies('popular', 12, okFetch({ results: [] }), null).catch((e) => e);
  assert.equal(err.code, 'tmdb_key_missing');
});

test('details return full meta, null for unknown or bad ids', async () => {
  const details = await getMovieDetails(
    '438631',
    okFetch({ id: 438631, title: 'Dune', release_date: '2021-09-15', poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'Spice.', runtime: 155, genres: [{ name: 'Sci-Fi' }, { name: 'Adventure' }, 7], tagline: '  Beyond fear.  ' }),
    'key',
  );
  assert.equal(details.title, 'Dune');
  assert.equal(details.runtimeMinutes, 155);
  assert.deepEqual(details.genres, ['Sci-Fi', 'Adventure']);
  assert.equal(details.tagline, 'Beyond fear.');
  assert.equal(await getMovieDetails('abc', okFetch({}), 'key'), null);
  const missing = await getMovieDetails('999999999', async () => ({ ok: false, status: 404 }), 'key');
  assert.equal(missing, null);
});
