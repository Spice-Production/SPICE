/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { makeTrack } from '../models.ts';
import { encodeTrackPriorities, parseTrackPriorities, updateTrackPriorityPayload } from '../priorities.ts';
import {
  SoundCloudClient,
  applePlayableStream,
  extractSoundCloudClientId,
  parseSoundCloudTracks,
  parseTranscodingCandidates,
  sortSoundCloudStreams,
  streamFromTranscoding,
  type FetchLike,
} from '../soundcloud.ts';

const stream = (protocol: string, bitrate: number, contentType = 'audio/mpeg') => ({
  url: `https://cdn.example/${protocol}-${bitrate}`,
  container: contentType.includes('ogg') ? 'ogg' : 'mp3',
  bitrate,
  protocol,
  contentType,
  expiresAt: '',
});

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const route = key ? routes[key]! : { status: 404, body: '' };
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof route.body === 'string' ? route.body : JSON.stringify(route.body)),
    };
  };
}

test('priority payloads keep the newest entry and clamp scores', () => {
  const parsed = parseTrackPriorities('[{"key":"a","score":3},{"key":"b","score":99},{"key":"a","score":-40},{"key":"","score":1},{"score":2}]');
  assert.deepEqual([...parsed], [['b', 12], ['a', -12]]);
  assert.deepEqual([...parseTrackPriorities('not json')], []);
  assert.equal(encodeTrackPriorities(parsed), '[{"key":"b","score":12},{"key":"a","score":-12}]');
});

test('feedback updates one key and moves it to the end', () => {
  const first = updateTrackPriorityPayload('[{"key":"a","score":1},{"key":"b","score":0}]', 'a', 'Completed');
  assert.equal(first.updatedScore, 3);
  assert.equal(first.payload, '[{"key":"b","score":0},{"key":"a","score":3}]');
  assert.deepEqual(updateTrackPriorityPayload('[]', '', 'EarlySkip'), { payload: '[]', updatedScore: 0 });
});

test('client id is found in inline config and script bundles', () => {
  assert.equal(extractSoundCloudClientId('window.cfg={"clientId":"abc123"}'), 'abc123');
  assert.equal(extractSoundCloudClientId('e.client_id="xyz789",t'), 'xyz789');
  assert.equal(extractSoundCloudClientId('nothing here'), null);
});

test('search results skip blocked, preview-only, and unnamed tracks', () => {
  const tracks = parseSoundCloudTracks(
    {
      collection: [
        { id: 1, title: 'Keep', duration: 1000, user: { username: 'A' }, artwork_url: 'https://i/x-large.jpg' },
        { id: 2, title: 'Blocked', policy: 'BLOCK' },
        { id: 3, title: 'Snip', policy: 'snip' },
        { id: 4, title: 'Off', streamable: false },
        { id: 5, title: '' },
        { id: 6, title: 'Fallback art', user: { avatar_url: 'https://i/u-large.jpg' } },
      ],
    },
    10,
  );
  assert.deepEqual(tracks.map((track) => track.id), ['soundcloud:1', 'soundcloud:6']);
  assert.equal(tracks[0]!.artworkUrl, 'https://i/x-t500x500.jpg');
  assert.equal(tracks[1]!.artist, 'SoundCloud Artist');
  assert.equal(tracks[1]!.artworkUrl, 'https://i/u-t500x500.jpg');
});

test('transcodings drop encrypted formats and map presets to bitrates', () => {
  const candidates = parseTranscodingCandidates({
    media: {
      transcodings: [
        { url: 'https://api/a', preset: 'mp3_1_0', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } },
        { url: 'https://api/b', preset: 'aac_160k', format: { protocol: 'hls', mime_type: 'audio/mp4; codecs="mp4a.40.2"' } },
        { url: 'https://api/c', preset: 'aac_256k', format: { protocol: 'ctr-encrypted-hls', mime_type: 'audio/mp4' } },
        { url: '', preset: 'x', format: { protocol: 'hls' } },
      ],
    },
  });
  assert.deepEqual(candidates.map((candidate) => candidate.url), ['https://api/a', 'https://api/b']);
  assert.deepEqual(
    candidates.map((candidate) => streamFromTranscoding(candidate, 'u')).map((s) => [s.container, s.bitrate]),
    [['mp3', 128_000], ['m4a', 160_000]],
  );
});

test('stream order prefers progressive, then the quality target', () => {
  const streams = [stream('hls', 160_000), stream('progressive', 128_000), stream('hls', 64_000), stream('progressive', 256_000)];
  const order = (quality: 'High' | 'Standard' | 'DataSaver') => sortSoundCloudStreams(streams, quality).map((s) => `${s.protocol}-${s.bitrate}`);
  assert.deepEqual(order('High'), ['progressive-256000', 'progressive-128000', 'hls-160000', 'hls-64000']);
  assert.deepEqual(order('Standard'), ['progressive-128000', 'progressive-256000', 'hls-160000', 'hls-64000']);
  assert.deepEqual(order('DataSaver'), ['progressive-128000', 'progressive-256000', 'hls-64000', 'hls-160000']);
});

test('Apple playback rejects Opus and Ogg streams', () => {
  assert.equal(applePlayableStream(stream('hls', 64_000, 'audio/ogg; codecs="opus"')), false);
  assert.equal(applePlayableStream(stream('progressive', 128_000)), true);
});

test('a rotated client id is rediscovered once after a 401', async () => {
  const calls: string[] = [];
  let apiHits = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.startsWith('https://api-v2.soundcloud.com/search')) {
      apiHits += 1;
      if (apiHits === 1) return { ok: false, status: 401, text: async () => '' };
    }
    return fakeFetch(
      {
        'https://soundcloud.com': { body: '<script>{"clientId":"fresh"}</script>' },
        'https://api-v2.soundcloud.com/search': { body: { collection: [{ id: 9, title: 'Song' }] } },
      },
      calls,
    )(url, init);
  };
  const tracks = await new SoundCloudClient(fetchImpl).search('song', 5);
  assert.equal(tracks[0]!.id, 'soundcloud:9');
  assert.equal(calls.filter((url) => url === 'https://soundcloud.com').length, 2);
  assert.ok(calls.at(-1)!.endsWith('client_id=fresh'));
});

test('resolvePlayable falls back to a SoundCloud match when the track cannot stream', async () => {
  const routes = {
    'https://soundcloud.com': { body: '"client_id":"cid"' },
    'https://api-v2.soundcloud.com/tracks/1': { body: { id: 1, policy: 'SNIP' } },
    'https://api-v2.soundcloud.com/search': { body: { collection: [{ id: 1, title: 'Song' }, { id: 2, title: 'Song (full)' }] } },
    'https://api-v2.soundcloud.com/tracks/2': {
      body: {
        id: 2,
        track_authorization: 'auth',
        media: {
          transcodings: [
            { url: 'https://api-v2.soundcloud.com/media/opus', preset: 'opus_0_0', format: { protocol: 'hls', mime_type: 'audio/ogg; codecs="opus"' } },
            { url: 'https://api-v2.soundcloud.com/media/mp3', preset: 'mp3_1_0', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } },
          ],
        },
      },
    },
    'https://api-v2.soundcloud.com/media/opus': { body: { url: 'https://cdn/opus.m3u8' } },
    'https://api-v2.soundcloud.com/media/mp3': { body: { url: 'https://cdn/full.mp3' } },
  };
  const calls: string[] = [];
  const client = new SoundCloudClient(fakeFetch(routes, calls), applePlayableStream);
  const requested = makeTrack({ id: 'soundcloud:1', title: 'Song', artist: 'Band', sourceId: 'soundcloud' });
  const playback = await client.resolvePlayable(requested, 'Standard');
  assert.equal(playback.usedFallback, true);
  assert.equal(playback.track.id, 'soundcloud:2');
  assert.equal(playback.stream.url, 'https://cdn/full.mp3');
  assert.ok(calls.some((url) => url.includes('/media/mp3?track_authorization=auth&client_id=cid')));

  const offline = await client.resolvePlayable(makeTrack({ id: 'x', localUri: 'file:///song.mp3' }), 'High');
  assert.deepEqual([offline.stream.url, offline.stream.protocol, offline.usedFallback], ['file:///song.mp3', 'offline', false]);
});
