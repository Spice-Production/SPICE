import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RECOMMENDATION_LISTEN_MS,
  beginRecommendationListenProgress,
  buildPrivateTasteProfile,
  buildRecommendationSeeds,
  buildRecommendationShelves,
  incrementRecommendationListenMs,
  recordRecommendationListenProgress,
  rankRecommendedTracks,
  recommendationListenThresholdSeconds,
  resetRecommendationListenObservation,
  shouldAwaitPersonalizedContinuation,
  shouldRepeatPlaylistAtQueueTail,
} from '../app/recommendations.ts';

const track = (id, {
  artist = 'Northstar',
  title = `Rap track ${id}`,
  sourceId = 'youtube_music',
  msListened = 30000,
} = {}) => ({
  id,
  sourceId,
  title,
  artists: [{ id: artist.toLowerCase(), name: artist }],
  artworkUrl: `https://example.com/${id}.jpg`,
  durationMs: 180000,
  msListened,
});

const establishedTracks = Array.from({ length: 5 }, (_, index) => track(`history-${index + 1}`, {
  title: `Rap trap session ${index + 1}`,
}));

test('meaningful-listen thresholds are duration aware and bounded', () => {
  assert.equal(recommendationListenThresholdSeconds(20), 16);
  assert.equal(recommendationListenThresholdSeconds(120), 30);
  assert.equal(recommendationListenThresholdSeconds(600), 45);
  assert.equal(recommendationListenThresholdSeconds(0), 30);
  assert.equal(incrementRecommendationListenMs(undefined), 30000);
  assert.equal(
    incrementRecommendationListenMs(MAX_RECOMMENDATION_LISTEN_MS),
    MAX_RECOMMENDATION_LISTEN_MS,
  );
});

test('listening credit requires real forward playback rather than a pause and seek', () => {
  let progress = beginRecommendationListenProgress('youtube_music:track', 0, 0);
  progress = recordRecommendationListenProgress(progress, 'youtube_music:track', 45, 1000);
  assert.equal(progress.forwardSeconds, 0);

  progress = resetRecommendationListenObservation(progress, 'youtube_music:track', 45, 20000);
  progress = recordRecommendationListenProgress(progress, 'youtube_music:track', 65, 40000);
  progress = recordRecommendationListenProgress(progress, 'youtube_music:track', 90, 65000);
  assert.equal(progress.forwardSeconds, 45);
});

test('a queue tail waits for related tracks and only intentional playlists repeat', () => {
  assert.equal(shouldAwaitPersonalizedContinuation(1, 0, true), true);
  assert.equal(shouldAwaitPersonalizedContinuation(4, 3, false), true);
  assert.equal(shouldAwaitPersonalizedContinuation(4, 2, false), false);
  assert.equal(shouldRepeatPlaylistAtQueueTail(false, 'all'), false);
  assert.equal(shouldRepeatPlaylistAtQueueTail(true, 'all'), true);
});

test('one heavily repeated song cannot establish or flip a taste profile', () => {
  const repeated = track('repeat', { msListened: MAX_RECOMMENDATION_LISTEN_MS });
  const profile = buildPrivateTasteProfile({
    history: [repeated],
    likedTracks: [repeated],
    playlists: [],
  });

  assert.equal(profile.isReady, false);
  assert.equal(profile.evidenceTrackCount, 1);
  assert.deepEqual(buildRecommendationSeeds(profile), []);
});

test('several distinct meaningful listens establish stable artist and genre seeds', () => {
  const profile = buildPrivateTasteProfile({
    history: establishedTracks,
    likedTracks: [],
    playlists: [],
  });
  const seeds = buildRecommendationSeeds(profile, 4);

  assert.equal(profile.isReady, true);
  assert.equal(profile.evidenceTrackCount, 5);
  assert.ok(seeds.some((seed) => seed.kind === 'artist' && seed.query.includes('Northstar')));
  assert.ok(seeds.some((seed) => seed.kind === 'genre' && seed.label.includes('Hip-Hop')));
});

test('recurring title credits can establish a producer preference', () => {
  const producedTracks = Array.from({ length: 5 }, (_, index) => track(`produced-${index}`, {
    title: `Trap chapter ${index} (prod. by Metro Wave)`,
  }));
  const profile = buildPrivateTasteProfile({
    history: producedTracks,
    likedTracks: [],
    playlists: [],
  });
  const seeds = buildRecommendationSeeds(profile, 4);

  assert.equal(profile.producers[0].label, 'Metro Wave');
  assert.ok(seeds.some((seed) => seed.kind === 'producer' && seed.query.includes('Metro Wave')));
});

test('profiles learn independently from their own synced datasets', () => {
  const rapProfile = buildPrivateTasteProfile({
    history: establishedTracks,
    likedTracks: [],
    playlists: [],
  });
  const ambientProfile = buildPrivateTasteProfile({
    history: Array.from({ length: 5 }, (_, index) => track(`ambient-${index}`, {
      artist: 'Quiet Rooms',
      title: `Ambient chill focus ${index}`,
    })),
    likedTracks: [],
    playlists: [],
  });

  assert.equal(rapProfile.artists[0].label, 'Northstar');
  assert.equal(ambientProfile.artists[0].label, 'Quiet Rooms');
  assert.notEqual(rapProfile.topics[0].id, ambientProfile.topics[0].id);
});

test('ranking excludes known tracks, deduplicates providers, and favors established taste', () => {
  const profile = buildPrivateTasteProfile({
    history: establishedTracks,
    likedTracks: [],
    playlists: [],
  });
  const seed = buildRecommendationSeeds(profile, 1)[0];
  const preferred = track('preferred', { title: 'Fresh rap discovery' });
  const duplicate = { ...preferred, sourceId: 'soundcloud' };
  const unrelated = track('unrelated', { artist: 'Other Artist', title: 'Classical violin suite' });
  const ranked = rankRecommendedTracks([{
    seed,
    tracks: [establishedTracks[0], unrelated, preferred, duplicate],
  }], profile, { limit: 8 });

  assert.equal(ranked[0].id, 'preferred');
  assert.equal(ranked.some((item) => item.id === establishedTracks[0].id), false);
  assert.equal(ranked.filter((item) => item.title === preferred.title).length, 1);
});

test('personalized shelves stay distinct from the mixed recommendation row', () => {
  const profile = buildPrivateTasteProfile({
    history: establishedTracks,
    likedTracks: [],
    playlists: [],
  });
  const seeds = buildRecommendationSeeds(profile, 2);
  const batches = seeds.map((seed, seedIndex) => ({
    seed,
    tracks: Array.from({ length: 6 }, (_, index) => track(`candidate-${seedIndex}-${index}`, {
      title: `${seed.label} rap pick ${index}`,
    })),
  }));
  const mixed = rankRecommendedTracks(batches, profile, { limit: 3 });
  const shelves = buildRecommendationShelves(batches, profile, {
    exclude: mixed,
    limitPerShelf: 3,
    minimumTracks: 2,
  });
  const mixedIds = new Set(mixed.map((item) => item.id));

  assert.ok(shelves.length > 0);
  assert.equal(shelves.flatMap((shelf) => shelf.tracks).some((item) => mixedIds.has(item.id)), false);
});

test('profile recommendation controls can restore familiar tracks and hide exact feedback', () => {
  const profile = buildPrivateTasteProfile({ history: establishedTracks, likedTracks: [], playlists: [] });
  const seed = buildRecommendationSeeds(profile, 1)[0];
  const hidden = track('hidden', { sourceId: 'soundcloud' });
  const ranked = rankRecommendedTracks([{ seed, tracks: [establishedTracks[0], hidden, track('fresh')] }], profile, {
    limit: 8,
    preferences: {
      discoveryLevel: 0,
      hiddenTrackKeys: ['soundcloud:hidden'],
      snoozedArtists: [],
    },
  });

  assert.equal(ranked.some((item) => item.id === establishedTracks[0].id), true);
  assert.equal(ranked.some((item) => item.id === hidden.id), false);
});

test('listening events shorter than a credit never feed the profile', () => {
  const withShortEvents = buildPrivateTasteProfile({
    history: [
      { id: 'a', title: 'Anchor One', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'b', title: 'Anchor Two', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'c', title: 'Anchor Three', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
    ],
    likedTracks: [],
    playlists: [],
    listeningEvents: [{
      trackId: 'short',
      sourceId: 'youtube_music',
      title: 'Too Short',
      artistNames: ['Ghost Artist'],
      listenedMs: 10_000,
    }],
  });
  assert.ok(!withShortEvents.artists.some((signal) => signal.label === 'Ghost Artist'));
});

test('listening event evidence is capped', () => {
  const base = buildPrivateTasteProfile({
    history: [
      { id: 'a', title: 'Anchor One', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'b', title: 'Anchor Two', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'c', title: 'Anchor Three', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
    ],
    likedTracks: [],
    playlists: [],
  });
  const events = Array.from({ length: 400 }, (_, index) => ({
    trackId: `e${index}`,
    sourceId: 'youtube_music',
    title: `Event Song ${index}`,
    artistNames: ['Event Flood Artist'],
    listenedMs: 600_000,
  }));
  const flooded = buildPrivateTasteProfile({
    history: [
      { id: 'a', title: 'Anchor One', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'b', title: 'Anchor Two', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'c', title: 'Anchor Three', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
    ],
    likedTracks: [],
    playlists: [],
    listeningEvents: events,
  });
  assert.ok(flooded.evidenceUnits - base.evidenceUnits <= 4.1, 'event evidence is capped at +4');
});

test('affinity hook combines with discovery preferences without breaking ranking', () => {
  const profile = buildPrivateTasteProfile({
    history: [
      { id: 'a', title: 'Anchor One', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'b', title: 'Anchor Two', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
      { id: 'c', title: 'Anchor Three', artists: [{ name: 'Anchor Artist' }], msListened: 120_000 },
    ],
    likedTracks: [],
    playlists: [],
  });
  const seed = { id: 'seed', label: 'Seed', query: 'seed', reason: 'test', weight: 5, kind: 'artist' };
  const ranked = rankRecommendedTracks(
    [{ seed, tracks: [
      { id: 'n1', title: 'Neutral', artists: [{ name: 'Strangers' }] },
      { id: 'f1', title: 'Anchor Fresh', artists: [{ name: 'Anchor Artist' }] },
    ] }],
    profile,
    {
      limit: 2,
      includeKnown: true,
      preferences: { discoveryLevel: 0, hiddenTrackKeys: [], dislikedTrackKeys: [], snoozedArtists: [], discoveryWins: [] },
      affinity: (track) => (track.id === 'f1' ? 1 : 0),
    },
  );
  assert.equal(ranked[0].id, 'f1');
});

test('seeds stay stable when a skip signal is supplied', () => {
  const history = [
    { id: 'a', title: 'Moon Halo', artists: [{ name: 'Aurora' }], msListened: 180_000 },
    { id: 'b', title: 'Moon Halo II', artists: [{ name: 'Aurora' }], msListened: 180_000 },
    { id: 'c', title: 'Other Song', artists: [{ name: 'Nova' }], msListened: 180_000 },
  ];
  const plain = buildPrivateTasteProfile({ history, likedTracks: [], playlists: [] });
  const shaped = buildPrivateTasteProfile({
    history,
    likedTracks: [],
    playlists: [],
    skipSignal: { trackScores: { 'youtube_music:c': -8 } },
  });
  const plainSeeds = buildRecommendationSeeds(plain).map((seed) => seed.label);
  const shapedSeeds = buildRecommendationSeeds(shaped).map((seed) => seed.label);
  assert.deepEqual(plainSeeds, shapedSeeds, 'seed kinds stay stable; only weights shift');
});
