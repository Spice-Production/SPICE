import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fallbackSearchQuery,
  fallbackSoundCloudTrackId,
  isFallbackSoundCloudTrack,
  isFallbackYouTubeTrack,
  rankFallbackCandidates,
} from '../app/playback-fallback.ts';

const ytTrack = (id, title, artists = [], durationMs = 200_000, extra = {}) => ({
  id,
  title,
  artists,
  durationMs,
  sourceId: 'youtube_music',
  ...extra,
});

const scTrack = (id, title, artists = [], durationMs = 200_000, extra = {}) => ({
  id: `soundcloud:${id}`,
  title,
  artists,
  durationMs,
  sourceId: 'soundcloud',
  ...extra,
});

test('fallback search query joins title and artist names', () => {
  assert.equal(
    fallbackSearchQuery(ytTrack('a', 'Moon Halo', [{ name: 'HOYO-MiX' }])),
    'Moon Halo HOYO-MiX',
  );
  assert.equal(fallbackSearchQuery(ytTrack('a', 'Moon Halo')), 'Moon Halo');
  assert.equal(fallbackSearchQuery(ytTrack('a', '  ')), '');
});

test('youtube fallback candidates exclude the requested id, previews, and far durations', () => {
  const requested = ytTrack('dead-id', 'Moon Halo', [{ name: 'HOYO-MiX' }], 200_000);
  const candidates = [
    requested,
    ytTrack('live-1', 'Moon Halo alternate', [{ name: 'HOYO-MiX' }], 201_000),
    ytTrack('preview', 'Moon Halo preview', [{ name: 'HOYO-MiX' }], 200_000, { previewOnly: true }),
    ytTrack('far', 'Moon Halo 10h version', [{ name: 'HOYO-MiX' }], 36_000_000),
    scTrack('42', 'Moon Halo cover'),
  ];

  const ranked = rankFallbackCandidates(requested, candidates, []);
  assert.deepEqual(ranked.map((track) => track.id), ['live-1']);
});

test('soundcloud fallback candidates exclude the requested track and previews', () => {
  const requested = scTrack('42', 'Regression', [{ name: 'Ayanga' }]);
  const candidates = [
    requested,
    scTrack('43', 'Regression cover'),
    scTrack('42', 'same id different entry'),
    scTrack('44', 'Regression snippet', [], 200_000, { previewOnly: true }),
  ];

  const ranked = rankFallbackCandidates(requested, [], candidates);
  assert.deepEqual(ranked.map((track) => fallbackSoundCloudTrackId(track)), ['43']);
});

test('fallback candidates are capped per source with youtube first', () => {
  const requested = ytTrack('dead-id', 'Drive Forever', [{ name: 'T3NZU' }]);
  const youTube = [
    ytTrack('yt-1', 'Drive Forever a'),
    ytTrack('yt-2', 'Drive Forever b'),
    ytTrack('yt-3', 'Drive Forever c'),
    ytTrack('yt-4', 'Drive Forever d'),
  ];
  const soundCloud = [
    scTrack('sc-1', 'Drive Forever a'),
    scTrack('sc-2', 'Drive Forever b'),
    scTrack('sc-3', 'Drive Forever c'),
    scTrack('sc-4', 'Drive Forever d'),
  ];

  const ranked = rankFallbackCandidates(requested, youTube, soundCloud);
  assert.equal(ranked.length, 6);
  assert.deepEqual(
    ranked.map((track) => track.id),
    ['yt-1', 'yt-2', 'yt-3', 'soundcloud:sc-1', 'soundcloud:sc-2', 'soundcloud:sc-3'],
  );
});

test('source detection treats missing sourceId as youtube', () => {
  assert.ok(isFallbackYouTubeTrack({ id: 'abc', title: 'x' }));
  assert.ok(!isFallbackYouTubeTrack(scTrack('1', 'x')));
  assert.ok(isFallbackSoundCloudTrack(scTrack('1', 'x')));
  assert.ok(!isFallbackSoundCloudTrack(ytTrack('abc', 'x')));
});

test('soundcloud id stripping handles prefixed and bare ids', () => {
  assert.equal(fallbackSoundCloudTrackId(scTrack('42', 'x')), '42');
  assert.equal(fallbackSoundCloudTrackId({ id: '42', title: 'x' }), '42');
});

test('fallback ranking tolerates empty inputs', () => {
  assert.deepEqual(rankFallbackCandidates(ytTrack('a', 'x'), [], []), []);
  // An unnamed requested track still ranks candidates; the player guards
  // that case before calling (fallbackSearchQuery must be non-empty).
  assert.deepEqual(
    rankFallbackCandidates({ id: '', title: '' }, [ytTrack('b', 'y')], []),
    [ytTrack('b', 'y')],
  );
});

test('duration tolerance boundary is inclusive at four seconds', () => {
  const requested = ytTrack('a', 'Song', [], 200_000);
  const atBoundary = rankFallbackCandidates(requested, [ytTrack('b', 'Song Alt', [], 204_000)], []);
  const beyondBoundary = rankFallbackCandidates(requested, [ytTrack('c', 'Song Alt', [], 204_001)], []);
  assert.equal(atBoundary.length, 1);
  assert.equal(beyondBoundary.length, 0);
});

test('preview soundcloud candidates never become fallbacks', () => {
  const requested = ytTrack('a', 'Song', []);
  const ranked = rankFallbackCandidates(requested, [], [
    scTrack('1', 'Preview Cover', [], 200_000, { previewOnly: true }),
    scTrack('2', 'Full Cover', [], 200_000),
  ]);
  assert.deepEqual(ranked.map((item) => fallbackSoundCloudTrackId(item)), ['2']);
});

test('fallback search query handles multiple artists', () => {
  assert.equal(
    fallbackSearchQuery(ytTrack('a', 'Duet Song', [{ name: 'One' }, { name: 'Two' }])),
    'Duet Song One, Two',
  );
});
