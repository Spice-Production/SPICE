import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
  assert.equal(buildMovieEmbedUrl('533535'), 'https://vidsrc.sbs/embed/movie/533535');
  assert.equal(
    buildMovieEmbedUrl('603', 'https://player.example.test/spice'),
    'https://player.example.test/spice/embed/movie/603',
  );
});

test('movie provider rejects unsafe configured origins', () => {
  assert.equal(
    getMovieProviderBaseUrl('http://player.example.test').toString(),
    'https://vidsrc.sbs/',
  );
  assert.equal(
    getMovieProviderBaseUrl('https://user:password@player.example.test').toString(),
    'https://vidsrc.sbs/',
  );
});

test('show provider builds series embed URLs and refuses bad seasons', () => {
  assert.equal(buildShowEmbedUrl('1396', 1, 1), 'https://vidsrc.sbs/embed/tv/1396/1/1');
  assert.equal(buildShowEmbedUrl('1396', '2', '10'), 'https://vidsrc.sbs/embed/tv/1396/2/10');
  assert.equal(buildShowEmbedUrl('abc', 1, 1), null);
  assert.equal(buildShowEmbedUrl('1396', 0, 1), null);
  assert.equal(buildShowEmbedUrl('1396', 1, 100), null);
  assert.equal(buildShowEmbedUrl('1396', 1.5, 1), null);
});

test('stream provider registry covers movies and series', () => {
  const [vidsrc, vidlink, moviesapi] = streamProviders();
  assert.equal(vidsrc.id, 'vidsrc');
  assert.equal(vidlink.id, 'vidlink');
  assert.equal(moviesapi.id, 'moviesapi');
  assert.equal(vidsrc.movieUrl('438631'), 'https://vidsrc.sbs/embed/movie/438631');
  assert.equal(vidsrc.tvUrl('1396', 1, 1), 'https://vidsrc.sbs/embed/tv/1396/1/1');
  assert.equal(vidlink.movieUrl('438631'), 'https://vidlink.pro/movie/438631');
  assert.equal(vidlink.tvUrl('1396', 1, 1), 'https://vidlink.pro/tv/1396/1/1');
  assert.equal(moviesapi.movieUrl('438631'), 'https://moviesapi.to/movie/438631');
  assert.equal(moviesapi.tvUrl('1396', 1, 1), null);
  assert.equal(vidlink.movieUrl('abc'), null);
  assert.equal(streamProviderById('vidlink').id, 'vidlink');
  assert.equal(streamProviderById('nope').id, 'vidsrc');
  assert.equal(streamProviderById(null).id, 'vidsrc');
});

test('provider override rehosts the default entry only', () => {
  const [vidsrc, vidlink] = streamProviders('https://player.example.test/spice');
  assert.equal(vidsrc.movieUrl('603'), 'https://player.example.test/spice/embed/movie/603');
  assert.equal(vidlink.movieUrl('603'), 'https://vidlink.pro/movie/603');
});
