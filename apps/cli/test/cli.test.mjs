import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const api = await tsImport('../src/api.ts', { parentURL: import.meta.url, tsconfig });
const player = await tsImport('../src/player.ts', { parentURL: import.meta.url, tsconfig });
const { pickBestStream } = api;
const { PlayQueue } = player;

describe('pickBestStream', () => {
  it('prefers AAC when prefer=original', () => {
    const streams = [
      { container: 'webm', codec: 'opus', bitrate: 160000, url: 'a' },
      { container: 'mp4', codec: 'mp4a.40.2', bitrate: 128000, url: 'b' },
    ];
    assert.equal(pickBestStream(streams, 'original')?.url, 'b');
  });
  it('returns null for empty', () => {
    assert.equal(pickBestStream([], 'original'), null);
  });
});

describe('PlayQueue', () => {
  it('advances and loops', () => {
    const q = new PlayQueue();
    q.add([{ track: { id: '1', title: 'a', artists: [] }, stream: {}, url: 'u1' }]);
    q.add([{ track: { id: '2', title: 'b', artists: [] }, stream: {}, url: 'u2' }]);
    assert.equal(q.current?.url, 'u1');
    assert.equal(q.next()?.url, 'u2');
    assert.equal(q.next(), null);
    q.loop = 'all';
    assert.equal(q.next()?.url, 'u1');
  });
});
