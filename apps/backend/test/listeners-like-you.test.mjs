import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateListenerFavorites,
  selectTasteNeighbors,
} from '../lib/listeners-like-you.ts';

const overlapRow = (userId, trackId) => ({ userId, trackId });

test('neighbor selection groups by shared tracks and drops weak overlaps', () => {
  const rows = [
    overlapRow('me', 't1'),
    overlapRow('strong', 't1'),
    overlapRow('strong', 't2'),
    overlapRow('strong', 't3'),
    overlapRow('weak', 't1'),
    overlapRow('other', 't9'),
  ];

  const selection = selectTasteNeighbors(rows, { requesterUserId: 'me' });
  assert.deepEqual(selection.neighborUserIds, ['strong']);
  assert.equal(selection.sharedCounts.get('weak'), 1);
  assert.equal(selection.sharedCounts.has('me'), false, 'requester rows are excluded entirely');
});

test('neighbor selection caps and tie-breaks deterministically', () => {
  const rows = [];
  for (const user of ['b', 'a', 'c']) {
    rows.push(overlapRow(user, 't1'), overlapRow(user, 't2'));
  }
  const selection = selectTasteNeighbors(rows, {
    requesterUserId: 'me',
    maxNeighbors: 2,
  });
  assert.deepEqual(selection.neighborUserIds, ['a', 'b']);
});

test('favorites aggregate listener counts and exclude known tracks', () => {
  const row = (userId, trackId, sourceId, title, artistsJson = '[{"name":"Aurora Sky"}]') => ({
    userId,
    trackId,
    sourceId,
    title,
    artistsJson,
    artworkUrl: null,
    durationMs: 200_000,
  });

  const favorites = aggregateListenerFavorites([
    row('n1', 'hit', 'youtube_music', 'Community Hit'),
    row('n2', 'hit', 'youtube_music', 'Community Hit'),
    row('n3', 'hit', 'youtube_music', 'Community Hit'),
    row('n1', 'solo', 'youtube_music', 'Only One Listener'),
    row('n1', 'mine', 'youtube_music', 'Already Known'),
    row('n2', 'dup', 'youtube_music', 'Dup A', '[{"name":"Dup"}]'),
    row('n2', 'dup', 'soundcloud', 'Dup B', '[{"name":"Dup"}]'),
  ], {
    excludeTrackKeys: new Set(['youtube_music:mine']),
    minListeners: 2,
  });

  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].trackId, 'hit');
  assert.equal(favorites[0].listenerCount, 3);
  assert.deepEqual(favorites[0].artists, [{ name: 'Aurora Sky' }]);
});

test('favorites sort by listener count then title', () => {
  const row = (userId, trackId, title) => ({
    userId,
    trackId,
    sourceId: 'youtube_music',
    title,
    artistsJson: '[]',
    artworkUrl: null,
    durationMs: null,
  });
  const favorites = aggregateListenerFavorites([
    row('n1', 'alpha', 'Alpha Song'),
    row('n1', 'beta', 'Beta Song'),
    row('n2', 'beta', 'Beta Song'),
    row('n3', 'beta', 'Beta Song'),
  ], { minListeners: 1 });

  assert.deepEqual(favorites.map((favorite) => favorite.trackId), ['beta', 'alpha']);
  assert.equal(favorites[0].listenerCount, 3);
});

test('malformed artist json degrades to an empty artist list', () => {
  const favorites = aggregateListenerFavorites([
    { userId: 'n1', trackId: 'a', sourceId: 'youtube_music', title: 'Broken Json', artistsJson: '{not json', artworkUrl: null, durationMs: null },
    { userId: 'n2', trackId: 'a', sourceId: 'youtube_music', title: 'Broken Json', artistsJson: '{not json', artworkUrl: null, durationMs: null },
    { userId: 'n1', trackId: 'b', sourceId: 'youtube_music', title: 'Artists Not Array', artistsJson: '{"name":"x"}', artworkUrl: null, durationMs: null },
    { userId: 'n2', trackId: 'b', sourceId: 'youtube_music', title: 'Artists Not Array', artistsJson: '{"name":"x"}', artworkUrl: null, durationMs: null },
    { userId: 'n1', trackId: 'c', sourceId: 'youtube_music', title: 'Nameless Artist', artistsJson: '[{"id":"x"},{"name":"Real Name"}]', artworkUrl: null, durationMs: null },
    { userId: 'n2', trackId: 'c', sourceId: 'youtube_music', title: 'Nameless Artist', artistsJson: '[{"id":"x"},{"name":"Real Name"}]', artworkUrl: null, durationMs: null },
  ], { minListeners: 2 });

  assert.equal(favorites.length, 3);
  assert.deepEqual(favorites[0].artists, []);
  assert.deepEqual(favorites[2].artists, [{ name: 'Real Name' }]);
});

test('artist lists are capped at eight entries', () => {
  const manyArtists = JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ name: `Artist ${index}` })));
  const favorites = aggregateListenerFavorites([
    { userId: 'n1', trackId: 'a', sourceId: 'youtube_music', title: 'Collab', artistsJson: manyArtists, artworkUrl: null, durationMs: null },
    { userId: 'n2', trackId: 'a', sourceId: 'youtube_music', title: 'Collab', artistsJson: manyArtists, artworkUrl: null, durationMs: null },
  ]);
  assert.equal(favorites[0].artists.length, 8);
});

test('minListeners can be loosened to one', () => {
  const favorites = aggregateListenerFavorites([
    { userId: 'n1', trackId: 'solo', sourceId: 'youtube_music', title: 'Solo Pick', artistsJson: '[]', artworkUrl: null, durationMs: null },
  ], { minListeners: 1 });
  assert.equal(favorites.length, 1);
});

test('rows without titles or ids are ignored', () => {
  const favorites = aggregateListenerFavorites([
    { userId: 'n1', trackId: '', sourceId: 'youtube_music', title: 'No Id', artistsJson: '[]', artworkUrl: null, durationMs: null },
    { userId: 'n1', trackId: 'x', sourceId: 'youtube_music', title: '', artistsJson: '[]', artworkUrl: null, durationMs: null },
    { userId: '', trackId: 'y', sourceId: 'youtube_music', title: 'No User', artistsJson: '[]', artworkUrl: null, durationMs: null },
    null,
  ]);
  assert.deepEqual(favorites, []);
});
