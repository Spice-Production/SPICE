import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STREAM_PROVIDER_ID,
  PLAYER_IFRAME_SANDBOX,
  allowedEmbedFrameOrigins,
  buildMovieEmbedUrl,
  buildShowEmbedUrl,
  getMovieProviderBaseUrl,
  normalizeTmdbMovieId,
  streamProviderById,
  streamProviders,
} from '../lib/movie-provider.ts';

test('movie provider accepts positive numeric TMDB IDs only', () => {
  assert.equal(normalizeTmdbMovieId(' 533535 '), '533535');
  assert.equal(normalizeTmdbMovieId('0'), null);
  assert.equal(normalizeTmdbMovieId('-12'), null);
  assert.equal(normalizeTmdbMovieId('tt1234567'), null);
  assert.equal(normalizeTmdbMovieId('12345678901'), null);
});

test('movie provider builds the documented VIDSrc movie embed URL', () => {
  assert.equal(buildMovieEmbedUrl('533535'), 'https://vidsrc.me/embed/movie/533535');
  assert.equal(
    buildMovieEmbedUrl('603', 'https://player.example.test/spice'),
    'https://player.example.test/spice/embed/movie/603',
  );
});

test('movie provider rejects unsafe configured origins', () => {
  assert.equal(
    getMovieProviderBaseUrl('http://player.example.test').toString(),
    'https://vidsrc.me/',
  );
  assert.equal(
    getMovieProviderBaseUrl('https://user:password@player.example.test').toString(),
    'https://vidsrc.me/',
  );
});

test('show provider builds series embed URLs and refuses bad seasons', () => {
  assert.equal(buildShowEmbedUrl('1396', 1, 1), 'https://vidsrc.me/embed/tv/1396/1/1');
  assert.equal(buildShowEmbedUrl('1396', '2', '10'), 'https://vidsrc.me/embed/tv/1396/2/10');
  assert.equal(buildShowEmbedUrl('abc', 1, 1), null);
  assert.equal(buildShowEmbedUrl('1396', 0, 1), null);
  assert.equal(buildShowEmbedUrl('1396', 1, 100), null);
  assert.equal(buildShowEmbedUrl('1396', 1.5, 1), null);
});

test('stream provider registry ships sandbox-safe defaults and blocks popup escapes', () => {
  assert.equal(DEFAULT_STREAM_PROVIDER_ID, 'vidzee');
  assert.doesNotMatch(PLAYER_IFRAME_SANDBOX, /allow-popups/);
  assert.doesNotMatch(PLAYER_IFRAME_SANDBOX, /allow-top-navigation/);
  assert.match(PLAYER_IFRAME_SANDBOX, /allow-scripts/);
  assert.match(PLAYER_IFRAME_SANDBOX, /allow-same-origin/);

  const providers = streamProviders('');
  assert.deepEqual(providers.map((p) => p.id), ['vidzee', 'vidprime']);
  const [vidzee, vidprime] = providers;
  assert.equal(vidzee.sandboxed, true);
  assert.equal(vidprime.sandboxed, true);
  assert.equal(vidzee.movieUrl('438631'), 'https://player.vidzee.wtf/embed/movie/438631');
  assert.equal(vidzee.tvUrl('1396', 1, 1), 'https://player.vidzee.wtf/embed/tv/1396/1/1');
  assert.equal(vidprime.movieUrl('438631'), 'https://vidprime.top/movie/438631');
  assert.equal(vidprime.tvUrl('1396', 1, 1), 'https://vidprime.top/tv/1396/1/1');
  assert.equal(vidzee.movieUrl('abc'), null);
  assert.equal(streamProviderById('vidprime', '').id, 'vidprime');
  assert.equal(streamProviderById('vidlink', '').id, 'vidzee');
  assert.equal(streamProviderById('vidfast', '').id, 'vidzee');
  assert.equal(streamProviderById('vidnest', '').id, 'vidzee');
  assert.equal(streamProviderById('moviesapi', '').id, 'vidzee');
  assert.equal(streamProviderById(null, '').id, 'vidzee');
});

test('explicit provider override appends custom entry and frame allowlist', () => {
  const list = streamProviders('https://player.example.test/spice');
  assert.deepEqual(list.map((p) => p.id), ['vidzee', 'vidprime', 'vidsrc']);
  const custom = list[2];
  assert.equal(custom.movieUrl('603'), 'https://player.example.test/spice/embed/movie/603');
  assert.deepEqual(allowedEmbedFrameOrigins(''), ['https://player.vidzee.wtf', 'https://vidprime.top']);
  assert.deepEqual(
    allowedEmbedFrameOrigins('https://player.example.test/spice'),
    ['https://player.vidzee.wtf', 'https://vidprime.top', 'https://player.example.test'],
  );
});
