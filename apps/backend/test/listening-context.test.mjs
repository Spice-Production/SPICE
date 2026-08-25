import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildListeningTimeProfile,
  buildOnRepeatTracks,
  LISTENING_TIME_BUCKET_LABELS,
  LISTENING_TIME_BUCKET_QUERIES,
  listeningBucketForHour,
  pickFreshFindTracks,
} from '../app/listening-context.ts';
import { buildPrivateTasteProfile } from '../app/recommendations.ts';

const event = (trackId, completedAt, artistNames = ['Aurora Sky'], listenedMs = 120_000, sourceId = 'youtube_music') => ({
  id: `${sourceId}:${trackId}:${completedAt}`,
  trackId,
  sourceId,
  title: `Song ${trackId}`,
  artistNames,
  listenedMs,
  completedAt,
  discovered: false,
});

const historyTrack = (id, title, artistName, msListened = 120_000) => ({
  id,
  title,
  artists: [{ name: artistName }],
  msListened,
});

test('hours map to the four listening buckets', () => {
  assert.equal(listeningBucketForHour(6), 'morning');
  assert.equal(listeningBucketForHour(11), 'morning');
  assert.equal(listeningBucketForHour(13), 'afternoon');
  assert.equal(listeningBucketForHour(17), 'afternoon');
  assert.equal(listeningBucketForHour(20), 'evening');
  assert.equal(listeningBucketForHour(23), 'lateNight');
  assert.equal(listeningBucketForHour(2), 'lateNight');
});

test('time profile finds the dominant bucket and its top artist', () => {
  const morning = new Date('2026-08-20T08:30:00').getTime();
  const lateNight = new Date('2026-08-21T01:30:00').getTime();
  const events = [
    event('m1', morning, ['Café Duo']),
    event('m2', morning + 60_000, ['Café Duo']),
    event('m3', morning + 120_000, ['Café Duo']),
    event('m4', morning + 180_000, ['Café Duo']),
    event('n1', lateNight, ['Night Owl']),
  ];

  const profile = buildListeningTimeProfile(events, new Date('2026-08-21T02:00:00').getTime());
  assert.equal(profile.buckets.morning.eventCount, 4);
  assert.equal(profile.buckets.morning.topArtist, 'Café Duo');
  assert.equal(profile.dominant, 'morning');
  assert.equal(profile.current, 'lateNight');
});

test('dominant bucket needs real evidence', () => {
  const morning = new Date('2026-08-20T08:30:00').getTime();
  const profile = buildListeningTimeProfile(
    [event('m1', morning, ['One Off Act']), event('m2', morning + 1, ['Different Act'])],
    new Date('2026-08-21T02:00:00').getTime(),
  );
  assert.equal(profile.dominant, null);
  assert.equal(profile.buckets.morning.topArtist, null);
});

test('on repeat aggregates repeated listens within the window', () => {
  const base = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const events = [
    event('hit', base, ['Aurora Sky'], 180_000),
    event('hit', base + 3_600_000, ['Aurora Sky'], 120_000),
    event('once', base + 7_200_000, ['Others LLC'], 240_000),
    event('old', base - 20 * 24 * 60 * 60 * 1000, ['Aurora Sky'], 600_000),
  ];

  const onRepeat = buildOnRepeatTracks(events, { now: Date.now() });
  assert.equal(onRepeat.length, 1);
  assert.equal(onRepeat[0].trackId, 'hit');
  assert.equal(onRepeat[0].listens, 2);
  assert.equal(onRepeat[0].listenedMs, 300_000);
});

test('fresh finds pick unfamiliar artists near the profile taste and rotate by day', () => {
  const profile = buildPrivateTasteProfile({
    history: [
      historyTrack('a1', 'Sunset Drive', 'Cobalt Lane'),
      historyTrack('a2', 'Sunset Drive II', 'Cobalt Lane'),
      historyTrack('a3', 'Chill Waves', 'Cobalt Lane'),
      historyTrack('a4', 'Lofi Study', 'Cobalt Lane'),
    ],
    likedTracks: [],
    playlists: [],
  });
  assert.ok(profile.isReady, 'test profile should be ready');

  const candidates = [
    { id: 'known', title: 'More Cobalt', artists: [{ name: 'Cobalt Lane' }] },
    { id: 'fresh1', title: 'Chill Lo-fi Beats Study', artists: [{ name: 'Brand New Artist' }] },
    { id: 'fresh2', title: 'Lofi Rain Chill', artists: [{ name: 'Another New Voice' }] },
    { id: 'far', title: 'Totally Different Techno Stadium', artists: [{ name: 'Unrelated Act' }] },
    { id: 'noartist', title: 'Who Knows', artists: [] },
  ];

  const monday = Date.parse('2026-08-17T12:00:00Z');
  const tuesday = Date.parse('2026-08-18T12:00:00Z');
  const mondayPicks = pickFreshFindTracks(candidates, profile, { now: monday });
  const tuesdayPicks = pickFreshFindTracks(candidates, profile, { now: tuesday });

  assert.ok(!mondayPicks.some((item) => item.id === 'known'), 'known artists never appear');
  assert.ok(!mondayPicks.some((item) => item.id === 'noartist'));
  assert.ok(mondayPicks.length >= 1 && mondayPicks.length <= 8);
  assert.deepEqual(
    mondayPicks.map((item) => item.id).sort(),
    tuesdayPicks.map((item) => item.id).sort(),
    'the candidate pool is stable across days',
  );
});

test('fresh finds need a ready profile', () => {
  const empty = buildPrivateTasteProfile({ history: [], likedTracks: [], playlists: [] });
  assert.deepEqual(pickFreshFindTracks([{ id: 'x', title: 'x', artists: [{ name: 'y' }] }], empty), []);
});

test('on repeat respects limits and caps per-listen credit', () => {
  const base = Date.now() - 1 * 24 * 60 * 60 * 1000;
  const events = [];
  for (let index = 0; index < 12; index += 1) {
    events.push(event(`track${index}`, base + index * 1_000, [`Artist ${index}`], 600_000, 'youtube_music'));
    events.push(event(`track${index}`, base + index * 1_000 + 500, [`Artist ${index}`], 600_000, 'youtube_music'));
  }
  const onRepeat = buildOnRepeatTracks(events, { now: Date.now(), limit: 5 });
  assert.equal(onRepeat.length, 5);
  assert.ok(onRepeat.every((entry) => entry.listens === 2));
  assert.ok(onRepeat.every((entry) => entry.listenedMs <= 1_200_000));
});

test('on repeat can be loosened to single listens', () => {
  const base = Date.now() - 1 * 24 * 60 * 60 * 1000;
  const onRepeat = buildOnRepeatTracks(
    [event('once', base, ['Aurora Sky'], 300_000)],
    { now: Date.now(), minListens: 1 },
  );
  assert.equal(onRepeat.length, 1);
  assert.equal(onRepeat[0].trackId, 'once');
});

test('fresh finds respect the requested limit', () => {
  const profile = buildPrivateTasteProfile({
    history: [
      historyTrack('a1', 'Sunset Drive', 'Cobalt Lane'),
      historyTrack('a2', 'Sunset Drive II', 'Cobalt Lane'),
      historyTrack('a3', 'Chill Waves', 'Cobalt Lane'),
      historyTrack('a4', 'Lofi Study', 'Cobalt Lane'),
    ],
    likedTracks: [],
    playlists: [],
  });
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    id: `fresh${index}`,
    title: `Chill Lofi Study Beats ${index}`,
    artists: [{ name: `New Artist ${index}` }],
  }));
  const picks = pickFreshFindTracks(candidates, profile, { now: Date.parse('2026-08-19T00:00:00Z'), limit: 4 });
  assert.equal(picks.length, 4);
});

test('every time bucket has a label and a fallback query', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const bucket = listeningBucketForHour(hour);
    assert.ok(LISTENING_TIME_BUCKET_LABELS[bucket]);
    assert.ok(LISTENING_TIME_BUCKET_QUERIES[bucket]);
  }
});

test('the current bucket follows the clock passed in', () => {
  const events = [];
  const evening = new Date('2026-08-20T20:15:00').getTime();
  for (let index = 0; index < 5; index += 1) {
    events.push(event(`e${index}`, evening + index * 1_000, ['Evening Act']));
  }
  const eveningNow = new Date('2026-08-21T19:30:00').getTime();
  const profile = buildListeningTimeProfile(events, eveningNow);
  assert.equal(profile.current, 'evening');
  assert.equal(profile.dominant, 'evening');
  assert.equal(profile.buckets.evening.topArtist, 'Evening Act');
});

