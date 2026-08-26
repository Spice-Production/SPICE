import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  normalizePlayerVolume,
  playerVolumeGain,
  shouldUsePlayerGainPath,
  shouldUseProxyForBoost,
} from '../lib/player-audio.ts';

const spiceAppSource = readFileSync(
  new URL('../app/spice-app.tsx', import.meta.url),
  'utf8',
);

test('boosted player volume reaches a real ten-times gain', () => {
  assert.equal(normalizePlayerVolume(1000, true), 1000);
  assert.equal(playerVolumeGain(1000), 10);
  assert.equal(shouldUsePlayerGainPath(1000, true), true);
});

test('standard volume remains bounded and does not require the gain path', () => {
  assert.equal(normalizePlayerVolume(1000, false), 200);
  assert.equal(playerVolumeGain(-10), 0);
  assert.equal(shouldUsePlayerGainPath(100, false), false);
});

test('boosted embed playback is routed to the proxy audio path', () => {
  assert.equal(shouldUseProxyForBoost(1000, 'embed'), true);
  assert.equal(shouldUseProxyForBoost(100, 'embed'), false);
  assert.equal(shouldUseProxyForBoost(1000, 'proxy'), false);
});

test('exhausted direct-stream retries hand the same track to the embedded player', () => {
  // YouTube rejects PO-token-less stream URLs past ~1 MB, so every proxy
  // attempt can fail even though resolution succeeded. Before surfacing the
  // terminal error, the player must try the still-working embed transport for
  // the SAME user-requested track instead of giving up.
  assert.match(
    spiceAppSource,
    /Direct proxy retries exhausted for "\$\{track\.title\}"\. Retrying the same track in the YouTube embed transport\./,
    'the retry-exhaustion path must restart the track in the embed transport',
  );

  // The rescue is one-shot per track so blocked videos cannot loop transports
  // forever. embedProxyRetryRef marks tracks whose embed transport already
  // errored and flipped back to the proxy.
  assert.match(
    spiceAppSource,
    /streamProtocolRef\.current !== 'embed'\s*\n\s*&& !embedProxyRetryRef\.current\.has\(trackKey\)\s*\n\s*\) \{\s*\n\s*embedProxyRetryRef\.current\.add\(trackKey\);/,
    'the embed rescue must be guarded by the one-shot embedProxyRetry set',
  );

  // A cued embed must NOT clear the retry budget: the cued state also fires
  // during embed-refused handshakes, and clearing it would let failed tracks
  // loop transports indefinitely.
  assert.doesNotMatch(
    spiceAppSource,
    /playbackRetryCountsRef\.current\.clear\(\);/,
    'a cued embed must not clear the direct-stream retry budget',
  );
});

test('volume boost on a playing YouTube embed switches to the proxy path immediately', () => {
  // The boost request must capture the embed position and restart the same
  // track through the gain-capable proxy path instead of deferring to the
  // next track boundary.
  assert.match(
    spiceAppSource,
    /boostResumeSecondsRef\.current = \{\s*\n\s*trackKey: playbackTrackKey\(activeTrack\),/,
    'the boost switch must record which track is being restarted',
  );
  assert.match(
    spiceAppSource,
    /Volume Boost switching the playing YouTube embed to the gain-capable proxy path now/,
    'the boost switch must restart playback immediately',
  );
  assert.doesNotMatch(
    spiceAppSource,
    /applies from the next track/,
    'the deferred-boost notice must be gone',
  );

  // The restart must not count as a user skip: it passes the sync-loop and
  // retry flags so played-tracks counters and Listen Together stay intact.
  assert.match(
    spiceAppSource,
    /playTrackRef\.current\(activeTrack, queueRef\.current, queueIndexRef\.current, true, true\)/,
  );

  // The resolved proxy stream must resume at the captured position once its
  // metadata is available.
  assert.match(
    spiceAppSource,
    /pendingBoostStart && pendingBoostStart\.trackKey === trackKey/,
    'the resume seek must apply only to the restarted track',
  );
  assert.match(
    spiceAppSource,
    /target\.readyState >= HTMLMediaElement\.HAVE_METADATA/,
    'the resume seek must wait for seekable metadata before setting currentTime',
  );
});

