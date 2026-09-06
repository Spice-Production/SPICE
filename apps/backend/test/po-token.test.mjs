import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const poTokenSource = await readFile(new URL('../lib/po-token.ts', import.meta.url), 'utf8');
const youtubeSource = await readFile(new URL('../lib/youtube.ts', import.meta.url), 'utf8');
const walkthroughSource = await readFile(new URL('../public/WALKTHROUGH.md', import.meta.url), 'utf8');

test('PO token minting mirrors the bgutil attestation flow', () => {
  // The BotGuard challenge must come from the YouTube homepage so it pairs
  // with that page's ytcfg (BotGuard reads yt.config_.EVENT_ID); tokens from
  // bare challenge endpoints are rejected by the CDN.
  assert.match(
    poTokenSource,
    /window\\\.ytAtN/,
    'the challenge must be extracted from the homepage ytAtN payload',
  );
  assert.match(
    poTokenSource,
    /no ytAtN challenge found on homepage/,
    'a missing homepage challenge must fail loudly',
  );
  assert.match(
    poTokenSource,
    /ytcfg\\.set\\\(/,
    'the page ytcfg must be parsed alongside the challenge',
  );

  // The BotGuard interpreter expects a browser environment; a DOM shim is
  // installed onto globalThis before the VM script is evaluated.
  assert.match(
    poTokenSource,
    /Object\.assign\(globalThis,\s*\{\s*\n\s*window:/,
    'a jsdom-backed globalThis shim must be installed for the BotGuard VM',
  );
  assert.match(poTokenSource, /require\('jsdom'\)/, 'the DOM shim must come from jsdom');

  // Integrity token flow: challenge snapshot -> GenerateIT -> WebPoMinter.
  assert.match(
    poTokenSource,
    /buildURL\('GenerateIT'\)/,
    'integrity tokens must be requested from the WAA GenerateIT endpoint',
  );
  assert.match(
    poTokenSource,
    /WebPoMinter\.create\(/,
    'a WebPo minter must be built from the integrity token response',
  );

  // The minter outlives individual requests: cache keyed on TTL with refresh.
  assert.match(
    poTokenSource,
    /minterCache = \{ minter, expiry: Date\.now\(\) \+ minterCacheTtlMs\(estimatedTtlSecs\) \}/,
    'minted minters must be cached until shortly before their TTL expires',
  );
});

test('unknown minter TTLs park short instead of caching invalid tokens', () => {
  // A missing/zero GenerateIT TTL must not become a 12h cache entry — every
  // mint from it would produce invalid GVS tokens until manual restart.
  assert.match(
    poTokenSource,
    /export function minterCacheTtlMs/,
    'the minter TTL computation must be a testable exported helper',
  );
  assert.match(
    poTokenSource,
    /if \(!Number\.isFinite\(ttlSecs\) \|\| ttlSecs <= 0\) return 5 \* 60 \* 1000;/,
    'unknown TTLs must park short so the next request re-mints',
  );
  assert.doesNotMatch(
    poTokenSource,
    /estimatedTtlSecs \|\| 43200/,
    'a zero TTL must not fall back to a 12h cache entry',
  );
});

test('one undecipherable format does not discard every playable stream', () => {
  assert.match(
    youtubeSource,
    /Promise\.allSettled\(/,
    'format deciphers must settle independently so one thrower cannot fail the batch',
  );
});

test('stream URLs carry video-bound PO tokens with graceful degradation', () => {
  // Tokens are bound to the VIDEO ID for GVS use.
  assert.match(
    poTokenSource,
    /export async function mintGvsPoToken\(\s*\n\s*videoId: string,/,
    'GVS tokens must be minted per video ID',
  );

  // Minting failures must never break resolution entirely.
  assert.match(
    poTokenSource,
    /return null;\s*\n\s* \}\s*\n\}/,
    'mintGvsPoToken must degrade to null instead of throwing',
  );

  // The token rides on the resolved URL itself; never double-append it.
  assert.match(
    youtubeSource,
    /if \(poToken && !\/\(\[\?&\]\)pot=\/\.test\(url\)\) \{/,
    'the pot parameter must be appended to stream URLs exactly once',
  );

  // Streams resolved without a token are flagged so callers can tell why
  // playback may cap after ~1 MB.
  assert.match(
    youtubeSource,
    /capped: !poToken,/,
    'stream variants must expose whether they were resolved without a PO token',
  );

  // Only web-family clients honor WebPO tokens; YTMUSIC resolves first.
  assert.match(
    youtubeSource,
    /const STREAM_CLIENTS: Types\.InnerTubeClient\[\] = \[\s*\n\s*'YTMUSIC',/,
    'YTMUSIC must lead the stream client order',
  );

  // Token minting happens once per track resolution, ahead of client attempts.
  assert.match(
    youtubeSource,
    /const poToken = await mintGvsPoToken\(id\);\s*\n\s*\n\s*\/\/ Try each client/,
    'track resolution must mint its PO token before resolving clients',
  );
});

test('unplayable videos report the provider reason, not a generic failure', async () => {
  const youtubeSource = await readFile(new URL('../lib/youtube.ts', import.meta.url), 'utf8');
  // Observed live: YouTube gates some videos per-video (LOGIN_REQUIRED
  // "confirm you're not a bot") while others resolve fine. The extra
  // playability lookup runs only on total failure, so the player UI can
  // show the real reason instead of "no streams".
  assert.match(youtubeSource, /describeUnplayable\(yt, id\)/);
  assert.match(youtubeSource, /YouTube reports this video as/);
});

test('release notes document the PO token playback restoration', () => {
  assert.match(walkthroughSource, /## v1\.0\.172/, 'v1.0.172 changelog entry must exist');
  assert.match(
    walkthroughSource,
    /PO-token enforcement was truncating songs/,
    'the entry must describe the ~1 MB truncation fix',
  );
});
