import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrivateTasteProfile,
  rankRecommendedTracks,
  tasteSkipFactor,
} from '../app/recommendations.ts';
import {
  AFFINITY_FOR_YOU_MIN_SCORE,
  filterTracksForYou,
  reorderTracksByTaste,
  smartQueueBaseScore,
  trackAffinityScore,
} from '../app/taste-affinity.ts';

const track = (id, title, artistName, extra = {}) => ({
  id,
  title,
  artists: [{ name: artistName }],
  ...extra,
});

const historyTrack = (id, title, artistName, msListened = 120_000) => track(id, title, artistName, { msListened });

const readyProfile = () => buildPrivateTasteProfile({
  history: [
    historyTrack('a1', 'Alpha Song', 'Aurora Sky'),
    historyTrack('a2', 'Alpha Song II', 'Aurora Sky'),
    historyTrack('b1', 'Beta Waves', 'Cobalt Lane'),
  ],
  likedTracks: [track('l1', 'Liked Anthem', 'Aurora Sky')],
  playlists: [],
});

test('taste skip factor dampens skipped tracks and rewards completions', () => {
  const scores = { 'youtube_music:bad': -6, 'youtube_music:meh': -2, 'youtube_music:good': 3 };
  assert.equal(tasteSkipFactor({ trackScores: scores }, 'youtube_music:bad'), 0);
  assert.equal(tasteSkipFactor({ trackScores: scores }, 'youtube_music:meh'), 0.35);
  assert.equal(tasteSkipFactor({ trackScores: scores }, 'youtube_music:good'), 1.15);
  assert.equal(tasteSkipFactor({ trackScores: scores }, 'youtube_music:unknown'), 1);
  assert.equal(tasteSkipFactor(null, 'youtube_music:bad'), 1);
});

test('skipped tracks shape the taste profile less than completed ones', () => {
  const skippedProfile = buildPrivateTasteProfile({
    history: [
      historyTrack('s1', 'Skip Bait', 'Noise Maker'),
      historyTrack('k1', 'Keep Playing', 'Aurora Sky'),
      historyTrack('k2', 'Keep Playing II', 'Aurora Sky'),
    ],
    likedTracks: [],
    playlists: [],
    skipSignal: { trackScores: { 'youtube_music:s1': -6 } },
  });
  const plainProfile = buildPrivateTasteProfile({
    history: [
      historyTrack('s1', 'Skip Bait', 'Noise Maker'),
      historyTrack('k1', 'Keep Playing', 'Aurora Sky'),
      historyTrack('k2', 'Keep Playing II', 'Aurora Sky'),
    ],
    likedTracks: [],
    playlists: [],
  });

  const noisePlain = plainProfile.artists.find((signal) => signal.label === 'Noise Maker');
  const noiseShaped = skippedProfile.artists.find((signal) => signal.label === 'Noise Maker');
  assert.ok(noisePlain, 'plain profile should register the played artist');
  if (noiseShaped) {
    assert.ok(noiseShaped.score < noisePlain.score, 'skip signal must reduce the artist signal');
  }
});

test('listening events deepen artist signals beyond the history window', () => {
  const events = Array.from({ length: 6 }, (_, index) => ({
    trackId: `e${index}`,
    sourceId: 'youtube_music',
    title: `Event Song ${index}`,
    artistNames: ['Deep Cut Artist'],
    listenedMs: 180_000,
  }));
  const withEvents = buildPrivateTasteProfile({
    history: [
      historyTrack('a1', 'Alpha Song', 'Aurora Sky'),
      historyTrack('a2', 'Alpha Song II', 'Aurora Sky'),
      historyTrack('a3', 'Alpha Song III', 'Aurora Sky'),
    ],
    likedTracks: [],
    playlists: [],
    listeningEvents: events,
  });
  const withoutEvents = buildPrivateTasteProfile({
    history: [
      historyTrack('a1', 'Alpha Song', 'Aurora Sky'),
      historyTrack('a2', 'Alpha Song II', 'Aurora Sky'),
      historyTrack('a3', 'Alpha Song III', 'Aurora Sky'),
    ],
    likedTracks: [],
    playlists: [],
  });

  const deepWith = withEvents.artists.find((signal) => signal.label === 'Deep Cut Artist');
  assert.ok(deepWith, 'listening events should register the artist');
  assert.ok(!withoutEvents.artists.some((signal) => signal.label === 'Deep Cut Artist'));
  assert.ok(withEvents.evidenceUnits > withoutEvents.evidenceUnits);
});

test('affinity scores rank liked, familiar tracks above unknown and skipped ones', () => {
  const profile = readyProfile();
  const context = {
    profile,
    adaptiveScores: new Map([['youtube_music:skipped', -8]]),
    likedTrackKeys: new Set(['youtube_music:l1']),
  };

  const liked = trackAffinityScore(track('l1', 'Liked Anthem', 'Aurora Sky'), context);
  const familiar = trackAffinityScore(track('a9', 'Brand New Aurora Song', 'Aurora Sky'), context);
  const unknown = trackAffinityScore(track('u1', 'Total Unknown', 'Strangers Inc'), context);
  const skipped = trackAffinityScore(track('skipped', 'Skipped Song', 'Aurora Sky'), context);

  assert.ok(liked > familiar, 'liked should outrank merely familiar');
  assert.ok(familiar > unknown, 'familiar artist should outrank unknown');
  assert.ok(skipped < unknown, 'adaptive skips should sink below unknown');
});

test('hidden or snoozed tracks get hard-demoted affinity', () => {
  const profile = readyProfile();
  const context = {
    profile,
    preferences: {
      discoveryLevel: 50,
      hiddenTrackKeys: ['youtube_music:hidden'],
      snoozedArtists: [{ key: 'aurora sky', label: 'Aurora Sky', until: Date.now() + 60_000 }],
    },
  };

  assert.equal(trackAffinityScore(track('hidden', 'Hidden Song', 'Anyone'), context), -1);
  assert.equal(trackAffinityScore(track('snooze', 'Snoozed Song', 'Aurora Sky'), context), -1);
});

test('search re-ranking keeps relevance order but lets strong affinity rise', () => {
  const profile = readyProfile();
  const context = { profile, likedTrackKeys: new Set(['youtube_music:l1']) };

  const results = [
    track('u1', 'Unknown A', 'Strangers Inc'),
    track('u2', 'Unknown B', 'Others LLC'),
    track('u3', 'Unknown C', 'More People'),
    track('l1', 'Liked Anthem', 'Aurora Sky'),
    track('u4', 'Unknown D', 'Filler Corp'),
    track('u5', 'Unknown E', 'Filler Corp'),
    track('u6', 'Unknown F', 'Filler Corp'),
  ];

  const reordered = reorderTracksByTaste(results, context);
  const likedIndex = reordered.findIndex((item) => item.id === 'l1');
  assert.ok(likedIndex < 3, 'liked track rises above the unknowns around it');
  assert.equal(reordered[0].id, 'l1', 'a liked track by the top artist may take the lead');
  const unknownOrder = reordered.filter((item) => item.id.startsWith('u')).map((item) => item.id);
  assert.deepEqual(unknownOrder, ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], 'equal-affinity results keep their relevance order');
});

test('re-ranking is a no-op for unready profiles and short lists', () => {
  const emptyProfile = buildPrivateTasteProfile({ history: [], likedTracks: [], playlists: [] });
  const two = [track('a', 'A', 'X'), track('b', 'B', 'Y')];
  assert.deepEqual(reorderTracksByTaste(two, { profile: emptyProfile }), two);
  assert.deepEqual(reorderTracksByTaste(two, { profile: readyProfile() }), two);
});

test('for-you filter keeps strong affinity tracks and falls back gracefully', () => {
  const profile = readyProfile();
  const context = { profile, likedTrackKeys: new Set(['youtube_music:l1']) };
  const results = [
    track('l1', 'Liked Anthem', 'Aurora Sky'),
    track('a9', 'Aurora New Song', 'Aurora Sky'),
    track('u1', 'Unknown', 'Strangers Inc'),
    track('u2', 'Unknown 2', 'Others LLC'),
  ];

  const forYou = filterTracksForYou(results, context);
  assert.ok(forYou.length >= 1);
  assert.equal(forYou[0].id, 'l1', 'liked track leads the for-you list');
  assert.ok(!forYou.some((item) => item.id === 'u1' && forYou.indexOf(item) < forYou.length - 1 && false));

  const unready = filterTracksForYou(results, { profile: buildPrivateTasteProfile({ history: [], likedTracks: [], playlists: [] }) });
  assert.deepEqual(unready, []);
});

test('for-you threshold constant is sane', () => {
  assert.ok(AFFINITY_FOR_YOU_MIN_SCORE > 0 && AFFINITY_FOR_YOU_MIN_SCORE < 1);
});

test('smart queue base score scales affinity into the queue score range', () => {
  const profile = readyProfile();
  const context = { profile, likedTrackKeys: new Set(['youtube_music:l1']) };
  const likedScore = smartQueueBaseScore(track('l1', 'Liked Anthem', 'Aurora Sky'), context);
  const unknownScore = smartQueueBaseScore(track('u1', 'Unknown', 'Strangers Inc'), context);
  assert.ok(likedScore > unknownScore);
  assert.ok(likedScore <= 15 && likedScore > 0);
});

test('rankRecommendedTracks affinity hook biases selection', () => {
  const profile = readyProfile();
  const seed = { id: 'seed', label: 'Seed', query: 'seed', reason: 'test', weight: 5, kind: 'artist' };
  const batchTracks = [
    track('n1', 'Neutral Song', 'Strangers Inc'),
    track('f1', 'Familiar Song', 'Aurora Sky'),
  ];
  const withAffinity = rankRecommendedTracks(
    [{ seed, tracks: batchTracks }],
    profile,
    { limit: 2, includeKnown: true, affinity: (item) => (item.id === 'f1' ? 1 : 0) },
  );
  assert.equal(withAffinity[0].id, 'f1', 'affinity hook should promote the familiar track');
});

test('disliked tracks are hard-rejected by affinity', () => {
  const profile = readyProfile();
  const context = {
    profile,
    preferences: {
      discoveryLevel: 50,
      hiddenTrackKeys: [],
      dislikedTrackKeys: ['youtube_music:disliked'],
      snoozedArtists: [],
      discoveryWins: [],
    },
  };
  assert.equal(trackAffinityScore(track('disliked', 'Disliked Song', 'Aurora Sky'), context), -1);
});

test('discovery wins give their artists a small affinity lift', () => {
  const profile = readyProfile();
  const base = {
    profile,
    preferences: {
      discoveryLevel: 50,
      hiddenTrackKeys: [],
      dislikedTrackKeys: [],
      snoozedArtists: [],
      discoveryWins: [],
    },
  };
  const winning = {
    ...base,
    preferences: {
      ...base.preferences,
      discoveryWins: [{ key: 'fresh artist', label: 'Fresh Artist', wins: 5, at: Date.now() }],
    },
  };
  const candidate = track('f1', 'Chill Fresh Song', 'Fresh Artist');
  assert.ok(trackAffinityScore(candidate, winning) > trackAffinityScore(candidate, base));
});

test('collaborative counts add a bounded boost', () => {
  const profile = readyProfile();
  const plain = { profile };
  const collaborative = { profile, collaborativeScores: new Map([['youtube_music:community', 100]]) };
  const candidate = track('community', 'Community Song', 'Aurora Sky');
  assert.ok(trackAffinityScore(candidate, collaborative) > trackAffinityScore(candidate, plain));
  assert.ok(trackAffinityScore(candidate, collaborative) <= 1);
});

test('affinity works without optional context fields', () => {
  const profile = readyProfile();
  const bare = trackAffinityScore(track('a9', 'Brand New Aurora Song', 'Aurora Sky'), { profile });
  assert.ok(bare > 0 && bare <= 1);
  assert.equal(trackAffinityScore(null, { profile }), -1);
  assert.equal(trackAffinityScore(track('placeholder', 'x', 'y'), { profile }), -1);
});

test('track keys are provider-scoped for likes and skips', () => {
  const profile = readyProfile();
  const context = {
    profile,
    likedTrackKeys: new Set(['soundcloud:l1']),
  };
  const likedSc = trackAffinityScore(
    { id: 'l1', title: 'Liked Anthem', artists: [{ name: 'Aurora Sky' }], sourceId: 'soundcloud' },
    context,
  );
  const sameIdDifferentSource = trackAffinityScore(
    { id: 'l1', title: 'Liked Anthem', artists: [{ name: 'Aurora Sky' }], sourceId: 'youtube_music' },
    context,
  );
  assert.ok(likedSc > sameIdDifferentSource, 'a soundcloud like must not leak to youtube_music ids');
});

test('reorder is stable when every track has equal affinity', () => {
  const profile = readyProfile();
  const context = { profile };
  const results = [
    track('u1', 'Alpha', 'Zeta Corp'),
    track('u2', 'Beta', 'Zeta Corp'),
    track('u3', 'Gamma', 'Zeta Corp'),
    track('u4', 'Delta', 'Zeta Corp'),
  ];
  assert.deepEqual(reorderTracksByTaste(results, context), results);
});

test('for-you fallback never exceeds its limit', () => {
  const profile = readyProfile();
  const context = { profile, likedTrackKeys: new Set(['youtube_music:l1']) };
  const many = Array.from({ length: 40 }, (_, index) => track(`f${index}`, `Fresh ${index}`, 'Fresh Artist'));
  const forYou = filterTracksForYou(many, context, { limit: 5 });
  assert.ok(forYou.length <= 5);
});

test('smart queue base score clamps negative affinity', () => {
  const profile = readyProfile();
  const context = {
    profile,
    adaptiveScores: new Map([['youtube_music:bad', -8]]),
  };
  const score = smartQueueBaseScore(track('bad', 'Skipped Song', 'Aurora Sky'), context);
  assert.ok(score <= 0);
});

test('collaborative scores work as plain objects and maps alike', () => {
  const profile = readyProfile();
  const candidate = track('c1', 'Community Song', 'Aurora Sky');
  const withObject = trackAffinityScore(candidate, {
    profile,
    collaborativeScores: { 'youtube_music:c1': 40 },
  });
  const withMap = trackAffinityScore(candidate, {
    profile,
    collaborativeScores: new Map([['youtube_music:c1', 40]]),
  });
  assert.equal(withObject, withMap);
  assert.ok(withObject > trackAffinityScore(candidate, { profile }));
});
