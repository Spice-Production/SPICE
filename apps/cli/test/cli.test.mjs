import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickBestStream } from '../src/api.ts';
import { PlayQueue } from '../src/player.ts';
import { loadConfig, saveConfig, resetConfig } from '../src/config.ts';

describe('pickBestStream', () => {
  it('prefers AAC when prefer=original', () => {
    const streams: any[] = [
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
    q.add([{ track: { id: '1', title: 'a', artists: [] } as any, stream: {} as any, url: 'u1' }]);
    q.add([{ track: { id: '2', title: 'b', artists: [] } as any, stream: {} as any, url: 'u2' }]);
    assert.equal(q.current?.url, 'u1');
    assert.equal(q.next()?.url, 'u2');
    assert.equal(q.next(), null);
    q.loop = 'all';
    assert.equal(q.next()?.url, 'u1');
  });
});
