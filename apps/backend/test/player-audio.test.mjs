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
).replace(/\r\n/g, '\n');

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

test('volume-boost handoff publishes its resume position where the restart reads it', () => {
  // Regression: the handoff captured the embed position into
  // boostResumeSecondsRef, but the proxy restart consumes
  // pendingProxyStartSecondsRef — nothing connected them, so every boost
  // past 100% restarted the song from zero.
  assert.match(
    spiceAppSource,
    /pendingProxyStartSecondsRef\.current = boostResumeSecondsRef\.current/,
    'the handoff must publish the captured position to the pending-proxy ref',
  );
});

test('embed rescues for unplayable tracks ignore the boost level', () => {
  // Regression: both same-track embed rescues (resolve failure and
  // post-resolution playback error) were gated on volume <= 100, so with
  // Volume Boost on, gated videos died instead of playing in the embed
  // transport (which clamps to 100% itself).
  assert.doesNotMatch(
    spiceAppSource,
    /streamProtocolRef\.current !== 'embed'\s*\n\s*&& volumeRef\.current <= 100/,
    'no embed rescue may be gated on the volume level',
  );
});

test('volume touches never drag embed-rescued tracks back to the proxy', () => {
  // Regression: every volume change past 100% on an embed-rescued track
  // re-fired the proxy handoff (resolve flash, then failure, then rescue).
  // The handoff must skip tracks whose proxy resolution already failed.
  assert.match(
    spiceAppSource,
    /proxyUnresolvableRef\.current\.has\(activeTrackKey\)/,
    'the boost handoff must consult the unresolvable-track set',
  );
  assert.match(
    spiceAppSource,
    /proxyUnresolvableRef\.current\.add\(trackKey\)/,
    'the embed rescues must record unresolvable tracks',
  );
});

test('same-track restarts capture the live position before replaying', () => {
  // Regression (Kay's report): a mid-song proxy failure flipped transports
  // and replayed from 0 because no restart path snapshotted the position.
  // Every same-track restart must capture first, preferring the live
  // element/iframe clock over the last timeupdate.
  assert.match(
    spiceAppSource,
    /const captureSameTrackResumeSeconds = \(track: Track\)/,
    'a shared capture helper must exist',
  );
  assert.match(
    spiceAppSource,
    /getCurrentTime === 'function'[\s\S]{0,400}slot\.currentTime > 0/,
    'capture must prefer the live clock with a progress fallback',
  );
  const captureSites = [
    'captureSameTrackResumeSeconds(activeTrack);\n      void playTrackRef.current(activeTrack',
    'captureSameTrackResumeSeconds(track);\n      void playTrackRef.current(track, queueSnapshot, undefined',
    'captureSameTrackResumeSeconds(track);\n        void playTrackRef.current(track, queueSnapshot, queueIndexRef.current',
  ];
  for (const site of captureSites) {
    assert.ok(
      spiceAppSource.includes(site),
      `restart must capture before replaying: ${site.slice(0, 60)}...`,
    );
  }
});

test('embed restarts consume the captured position instead of replaying from zero', () => {
  // The proxy path already had applyResumeSeek; the iframe path had nothing,
  // so every proxy-to-embed flip restarted the song. Both embed load sites
  // must seek to the pending resume once the player can take it.
  assert.match(
    spiceAppSource,
    /const seekEmbedToPendingResume = \(resumeKey: string, requestId: number\)/,
    'an embed-side resume consumer must exist',
  );
  const consumers = spiceAppSource.match(/seekEmbedToPendingResume\(trackKey, requestId\);/g) ?? [];
  assert.equal(consumers.length, 2, `both embed load sites must consume the resume (found ${consumers.length})`);
});

