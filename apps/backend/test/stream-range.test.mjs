import test from 'node:test';
import assert from 'node:assert/strict';

import { STREAM_CHUNK_SIZE, parseRangeHeader } from '../lib/stream-range.ts';

const FIRST = `bytes=0-${STREAM_CHUNK_SIZE - 1}`;

test('a missing range starts at the first chunk', () => {
  assert.equal(parseRangeHeader(null), FIRST);
});

test('open-ended ranges clamp to one chunk window', () => {
  assert.equal(parseRangeHeader('bytes=0-'), FIRST);
  assert.equal(parseRangeHeader('bytes=1048576-'), `bytes=1048576-${1048576 + STREAM_CHUNK_SIZE - 1}`);
});

test('in-window ranges pass through, oversized ones clamp', () => {
  assert.equal(parseRangeHeader('bytes=0-100'), 'bytes=0-100');
  assert.equal(
    parseRangeHeader('bytes=0-99999999'),
    `bytes=0-${STREAM_CHUNK_SIZE - 1}`,
  );
});

test('suffix ranges fall back instead of producing NaN upstreams', () => {
  assert.equal(parseRangeHeader('bytes=-500'), FIRST);
});

test('multi-ranges and garbage fall back instead of producing NaN upstreams', () => {
  for (const header of ['bytes=0-100,200-300', 'bytes=abc-def', 'bytes=5-3', '', 'bytes=-', 'not-a-range']) {
    const parsed = parseRangeHeader(header);
    assert.equal(parsed, FIRST, header);
    assert.ok(!parsed.includes('NaN'), header);
  }
});

test('well-formed starts beyond EOF pass through for the upstream 416 path', () => {
  assert.equal(parseRangeHeader('bytes=999999999999-'), 'bytes=999999999999-1000002097150');
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(parseRangeHeader('  bytes=0-100  '), 'bytes=0-100');
});
