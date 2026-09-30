/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { makeTrack } from '../models.ts';
import {
  buildRecommendationSeeds,
  rankRecommendations,
  reorderTracksByTaste,
  smartQueueCandidates,
  tasteAffinity,
  tasteContext,
} from '../recommendations.ts';

const played = makeTrack({ id: 'played', title: 'Digital Love', artist: 'Daft Punk', sourceId: 'youtube_music' });
const liked = makeTrack({ id: 'liked', title: 'Genesis', artist: 'Justice', sourceId: 'soundcloud' });

test('taste seeds use distinct recent and liked artists', () => {
  const seeds = buildRecommendationSeeds([played, { ...played, id: 'other' }], [liked]);
  assert.deepEqual(
    seeds.map((seed) => seed.track.artist),
    ['Daft Punk', 'Justice'],
  );
  assert.ok(seeds[0]!.label.startsWith('Because you played'));
});

test('ranking excludes history and keeps provider variety', () => {
  const [seed] = buildRecommendationSeeds([played], [liked], 1);
  const ranked = rankRecommendations(
    [
      {
        seed: seed!,
        tracks: [
          played,
          makeTrack({ id: 'one', title: 'One More Time', artist: 'Daft Punk', sourceId: 'youtube_music' }),
          makeTrack({ id: 'two', title: 'Phantom', artist: 'Justice', sourceId: 'soundcloud' }),
        ],
      },
    ],
    [played],
    [liked],
  );
  assert.ok(!ranked.some((track) => track.id === played.id));
  assert.deepEqual(new Set(ranked.map((track) => track.sourceId)), new Set(['youtube_music', 'soundcloud']));
});

test('adaptive priorities bias recommendation ranking', () => {
  const [seed] = buildRecommendationSeeds([played], [], 1);
  const ranked = rankRecommendations(
    [
      {
        seed: seed!,
        tracks: [
          makeTrack({ id: 'neutral', title: 'Neutral Song', artist: 'Strangers Inc' }),
          makeTrack({ id: 'loved', title: 'Loved Song', artist: 'Daft Punk' }),
        ],
      },
    ],
    [played],
    [],
    18,
    (key) => (key === 'youtube music:loved' ? 12 : key === 'youtube music:neutral' ? -12 : 0),
  );
  assert.equal(ranked[0]!.id, 'loved');
});

test('smart queue does not repeat the current queue', () => {
  const continuation = smartQueueCandidates(
    [
      { title: 'Recommended Next', tracks: [played, liked] },
      { title: 'Quick Picks', tracks: [{ ...liked, id: 'fresh' }] },
    ],
    [played],
  );
  assert.ok(!continuation.some((track) => track.id === played.id));
  assert.ok(continuation.length > 0);
});

test('affinity ranks liked and familiar above unknown and skipped', () => {
  const context = tasteContext([played, { ...played, id: 'played-2' }], [liked], (key) =>
    key === 'youtube music:skipped' ? -12 : 0,
  );
  const likedScore = tasteAffinity(liked, context);
  const familiar = tasteAffinity(makeTrack({ id: 'fresh', title: 'Get Lucky', artist: 'Daft Punk' }), context);
  const unknown = tasteAffinity(makeTrack({ id: 'strange', title: 'Mystery Song', artist: 'Strangers Inc' }), context);
  const skipped = tasteAffinity(makeTrack({ id: 'skipped', title: 'Skipped Song', artist: 'Daft Punk' }), context);
  assert.ok(likedScore > familiar);
  assert.ok(familiar > unknown);
  assert.ok(skipped < unknown);
  assert.equal(context.historyArtistWeights.get('daft punk'), 2);
  assert.ok(context.likedTrackKeys.has('soundcloud:liked'));
  assert.ok(context.recentTrackKeys.has('youtube music:played'));
});

test('recently played tracks are dampened, not boosted', () => {
  const context = tasteContext([played, makeTrack({ id: 'other', title: 'Other Song', artist: 'Someone Else' })], [], () => 0);
  assert.ok(tasteAffinity(played, context) < tasteAffinity({ ...played, id: 'fresh-variant' }, context));
});

test('search reorder lifts liked tracks but keeps neutral order and is a no-op without evidence', () => {
  const context = tasteContext([played, { ...played, id: 'played-2' }], [liked], () => 0);
  const results = [
    makeTrack({ id: 'u1', title: 'Unknown A', artist: 'Strangers Inc' }),
    makeTrack({ id: 'u2', title: 'Unknown B', artist: 'Others LLC' }),
    makeTrack({ id: 'u3', title: 'Unknown C', artist: 'More People' }),
    liked,
    makeTrack({ id: 'u4', title: 'Unknown D', artist: 'Filler Corp' }),
  ];
  const reordered = reorderTracksByTaste(results, context);
  assert.ok(reordered.indexOf(liked) < results.indexOf(liked));
  assert.deepEqual(
    reordered.filter((track) => track.id !== liked.id).map((track) => track.id),
    results.filter((track) => track.id !== liked.id).map((track) => track.id),
  );
  const empty = tasteContext([], [], () => 0);
  const plain = [played, liked, { ...played, id: 'third' }];
  assert.deepEqual(reorderTracksByTaste(plain, empty), plain);
});
