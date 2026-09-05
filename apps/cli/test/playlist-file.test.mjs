import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const playlistFile = await tsImport('../src/playlist-file.ts', { parentURL: import.meta.url, tsconfig });
const resolveMod = await tsImport('../src/resolve.ts', { parentURL: import.meta.url, tsconfig });
const { toM3u, trackPageUrl, exportFileName } = playlistFile;
const { extractVideoId, looksLikeTrackId } = resolveMod;

describe('toM3u', () => {
  it('builds an extended m3u with titles and page urls', () => {
    const m3u = toM3u('My Mix', [
      { id: 'dQw4w9WgXcQ', sourceId: 'youtube_music', title: 'Song', artists: [{ id: 'a', name: 'Artist' }], durationMs: 213000 },
    ]);
    assert.match(m3u, /^#EXTM3U\n/);
    assert.match(m3u, /#PLAYLIST:My Mix/);
    assert.match(m3u, /#EXTINF:213,Song — Artist/);
    assert.match(m3u, /music\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  });
  it('uses soundcloud urls for numeric ids and -1 duration when unknown', () => {
    const m3u = toM3u('SC', [
      { id: '12345', sourceId: 'soundcloud', title: 'SC Song', artists: [] },
    ]);
    assert.match(m3u, /#EXTINF:-1,SC Song — Unknown Artist/);
    assert.match(m3u, /soundcloud\.com\/tracks\/12345/);
  });
  it('parses artistsJson fallback', () => {
    const m3u = toM3u('J', [
      { id: 'x', sourceId: 'youtube_music', title: 'T', artists: [], artistsJson: JSON.stringify([{ name: 'A' }, { name: 'B' }]) },
    ]);
    assert.match(m3u, /T — A, B/);
  });
});

describe('trackPageUrl', () => {
  it('prefers trackId alias when present', () => {
    assert.equal(trackPageUrl({ id: 'a', trackId: 'b', sourceId: 'youtube_music', title: 't', artists: [] }), 'https://music.youtube.com/watch?v=b');
  });
});

describe('exportFileName', () => {
  it('strips illegal filename chars', () => {
    assert.equal(exportFileName('a/b:c*', 'm3u'), 'abc.m3u');
  });
});

describe('resolve helpers', () => {
  it('extracts video ids from youtube urls', () => {
    assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('just a query'), null);
  });
  it('recognizes track ids', () => {
    assert.equal(looksLikeTrackId('dQw4w9WgXcQ'), true);
    assert.equal(looksLikeTrackId('123456'), true);
    assert.equal(looksLikeTrackId('hello world'), false);
  });
});
