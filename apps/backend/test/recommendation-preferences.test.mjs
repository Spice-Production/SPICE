import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hideRecommendedTrack,
  isRecommendationHidden,
  normalizeRecommendationPreferences,
  recommendationPreferenceScoreAdjustment,
  snoozeRecommendedArtist,
} from '../app/recommendation-preferences.ts';

const NOW = Date.UTC(2026, 6, 15);
const track = {
  id: 'one',
  sourceId: 'soundcloud',
  artists: [{ id: 'artist-a', name: 'Artist A' }],
};

test('recommendation preferences hide exact provider tracks and snooze artists', () => {
  const hidden = hideRecommendedTrack(normalizeRecommendationPreferences(null, NOW), track, NOW);
  assert.equal(isRecommendationHidden(track, hidden, NOW), true);
  assert.equal(isRecommendationHidden({ ...track, sourceId: 'youtube_music' }, hidden, NOW), false);

  const snoozed = snoozeRecommendedArtist(normalizeRecommendationPreferences(null, NOW), track.artists[0], NOW);
  assert.equal(isRecommendationHidden({ id: 'two', artists: track.artists }, snoozed, NOW), true);
  assert.equal(isRecommendationHidden({ id: 'two', artists: track.artists }, snoozed, NOW + 8 * 24 * 60 * 60 * 1000), false);
});

test('recommendation discovery control favors known tracks only in familiar mode', () => {
  assert.ok(recommendationPreferenceScoreAdjustment({ knownTrack: true, discoveryLevel: 10 }) > 0);
  assert.ok(recommendationPreferenceScoreAdjustment({ knownTrack: true, discoveryLevel: 90 }) < 0);
  assert.ok(recommendationPreferenceScoreAdjustment({ knownTrack: false, discoveryLevel: 90 }) > 0);
});

test('recommendation preferences clamp malformed persisted values', () => {
  assert.deepEqual(normalizeRecommendationPreferences({
    discoveryLevel: 999,
    hiddenTrackKeys: [' One ', 'one', null],
    snoozedArtists: [{ key: 'old', label: 'Old', until: NOW - 1 }],
  }, NOW), {
    discoveryLevel: 100,
    hiddenTrackKeys: ['one'],
    dislikedTrackKeys: [],
    snoozedArtists: [],
    discoveryWins: [],
  });
});
