import assert from 'node:assert/strict';
import test from 'node:test';

import { sequenceTracksByMoodFlow } from '../app/smart-queue.ts';
import { trackTopicKeys } from '../app/recommendations.ts';

const track = (title) => ({ id: title, title });

test('mood flow chains tracks sharing topics and keeps the full set', () => {
  const tracks = [
    track('Chill Lofi Study Beats'),
    track('Stadium Rock Anthem'),
    track('Chill Ambient Sleep'),
    track('Rock Concert Energy'),
    track('Chill Rain Piano'),
  ];

  const ordered = sequenceTracksByMoodFlow(tracks, (item) => trackTopicKeys(item));

  assert.deepEqual(
    [...ordered].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.id),
    [...tracks].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.id),
    'the full set is preserved',
  );

  const chillPositions = ordered
    .map((item, index) => (item.id.startsWith('Chill') ? index : -1))
    .filter((index) => index >= 0);
  const span = chillPositions[chillPositions.length - 1] - chillPositions[0];
  assert.ok(span <= 2, `chill tracks should cluster together (span ${span})`);
});

test('mood flow is a no-op for short lists', () => {
  const tracks = [track('A'), track('B')];
  assert.deepEqual(sequenceTracksByMoodFlow(tracks, () => ['topic']), tracks);
});

test('trackTopicKeys extracts mood and genre topics from titles', () => {
  const keys = trackTopicKeys({ id: 'x', title: 'Chill Lofi Study Beats', artists: [] });
  assert.ok(keys.length > 0, 'chill/lofi/study should match topic hints');
  assert.deepEqual(trackTopicKeys({ id: 'y', title: '', artists: [] }), []);
});
