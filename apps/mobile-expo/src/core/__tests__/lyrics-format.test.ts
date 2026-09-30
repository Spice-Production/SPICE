/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatBytes, formatTime, profileInitials, queueLabel, readableReleaseNotes } from '../format.ts';
import { activeTimedLyricIndex, cleanLyricsArtist, cleanLyricsTitle, parseTimedLyrics, selectLyricsMatch } from '../lyrics.ts';

test('parses and sorts LRC timestamps, expanding repeated lines', () => {
  assert.deepEqual(parseTimedLyrics('[00:02.50]Second\n[ar:Spice]\n[00:01.250]First\n[01:02.345]Later'), [
    { timeMs: 1_250, text: 'First' },
    { timeMs: 2_500, text: 'Second' },
    { timeMs: 62_345, text: 'Later' },
  ]);
  assert.deepEqual(parseTimedLyrics('[00:05.00][00:10.00]Chorus'), [
    { timeMs: 5_000, text: 'Chorus' },
    { timeMs: 10_000, text: 'Chorus' },
  ]);
});

test('finds the active lyric and clears it during instrumental gaps', () => {
  const lines = parseTimedLyrics('[00:01.00]Verse\n[00:10.00]\n[00:20.00]Chorus');
  assert.equal(activeTimedLyricIndex(lines, 999), -1);
  assert.equal(activeTimedLyricIndex(lines, 9_999), 0);
  assert.equal(activeTimedLyricIndex(lines, 10_000), -1);
  assert.equal(activeTimedLyricIndex(lines, 20_000), 2);
});

test('lyric lookups strip video noise and require a confident match', () => {
  assert.equal(cleanLyricsTitle('Digital Love (Official Video)'), 'Digital Love');
  assert.equal(cleanLyricsArtist('Daft Punk - Topic'), 'Daft Punk');
  const match = selectLyricsMatch(
    [
      { trackName: 'Other', artistName: 'Nobody', duration: 10, plainLyrics: 'x' },
      { trackName: 'Digital Love', artistName: 'Daft Punk', duration: 301, syncedLyrics: '[00:01.00]Hi' },
    ],
    'Digital Love',
    'Daft Punk',
    301,
  );
  assert.equal(match?.trackName, 'Digital Love');
  assert.equal(selectLyricsMatch([{ trackName: 'Else', artistName: 'Nobody', plainLyrics: 'x' }], 'Digital Love', 'Daft Punk', 301), null);
});

test('release notes become readable mobile text', () => {
  const notes = readableReleaseNotes(
    "## What's Changed\n* Fix player controls in https://github.com/example/spice/pull/64\n**Full Changelog**: [Compare releases](https://github.com/example/spice/compare/v1...v2)",
  );
  assert.ok(notes.startsWith("What's Changed\n• Fix player controls"));
  assert.ok(notes.includes('Full Changelog: Compare releases'));
  assert.ok(notes.includes('/​'));
  assert.ok(!notes.includes('##'));
  assert.ok(!notes.includes('**'));
});

test('format helpers match the player labels', () => {
  assert.equal(formatTime(61_000), '1:01');
  assert.equal(queueLabel(5, 1, true), 'Queue 2/5');
  assert.equal(queueLabel(1, 0), '');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(profileInitials('jane.doe@example.test', null), 'JD');
  assert.equal(profileInitials(null, null), 'S');
});
