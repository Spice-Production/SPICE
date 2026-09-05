// ---------------------------------------------------------------------------
// PO token (WebPO) support.
//
// Since YouTube's gVis enforcement roll-out, stream URLs resolved without a
// Proof-of-Origin token only authorize the first ~1 MB of media data
// ("cold start" window). The fix is to run the same attestation flow as the
// web player — BotGuard challenge -> integrity token -> per-video WebPO minter
// — and append `&pot=<token>` to every googlevideo URL we hand out.
//
// Implementation follows the open-source research in LuanRT/BgUtils and
// Brainicism/bgutil-ytdlp-pot-provider (MIT). Notably:
//   * the BotGuard interpreter needs a DOM; JSDOM is shimmed onto globalThis,
//   * challenges must come from the youtube.com homepage (`window.ytAtN`)
//     paired with that page's `ytcfg` (BotGuard reads yt.config_.EVENT_ID),
//   * GVS tokens are bound to the VIDEO ID for this use case,
//   * YTMUSIC-derived URLs accept browser-UA fetches with such tokens;
//     iOS-family client URLs do not honor them.
// ---------------------------------------------------------------------------

import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders, parseLooseJSON, USER_AGENT } from 'bgutils-js/utils';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';

const BG_REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'; // hardcoded by YouTube for years

interface MinterCacheEntry {
  minter: WebPoMinter;
  expiry: number;
}

let domShimmed = false;
function ensureDomShim(): void {
  if (domShimmed) return;

  // Lazy, dependency-light DOM: bgutils uses jsdom; the local runtime ships it
  // as an optional peer. If unavailable we cannot mint tokens — callers fall
  // back gracefully.
  interface DomWindow {
    document: unknown;
    location: unknown;
    origin: string;
    navigator: unknown;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options?: Record<string, unknown>) => { window: DomWindow } };
  const dom = new JSDOM('<html><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    resources: { userAgent: USER_AGENT },
  });
  const domWindow = dom.window;
  Object.assign(globalThis, {
    window: domWindow,
    document: domWindow.document,
    location: domWindow.location,
    origin: domWindow.origin,
  });
  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', { value: domWindow.navigator });
  }
  domShimmed = true;
}

interface ChallengeData {
  program: string;
  globalName: string;
  interpreterHash?: string;
  interpreterUrl: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: string };
}

async function getChallengeFromHomepage(fetchFn: typeof fetch): Promise<ChallengeData> {
  const pageResponse = await fetchFn('https://www.youtube.com', {
    method: 'GET',
    headers: { accept: '*/*', 'accept-language': 'en-US,en;q=0.7', 'user-agent': USER_AGENT },
  });
  if (!pageResponse.ok) throw new Error(`homepage fetch failed (${pageResponse.status})`);
  const html = await pageResponse.text();

  // Pair the challenge with its page ytcfg so BotGuard can read EVENT_ID.
  const ytcfgMatch = html.match(/ytcfg\.set\(({[\s\S]+?})\);/);
  if (ytcfgMatch) {
    try {
      const ytObj = { config_: JSON.parse(ytcfgMatch[1]) };
      const globals = globalThis as unknown as Record<string, unknown>;
      globals.yt = ytObj;
      const win = globals.window as Record<string, unknown> | undefined;
      if (win) win.yt = ytObj;
    } catch {
      // Non-fatal: some pages inline ytcfg differently.
    }
  }

  const attMatch = html.match(/window\.ytAtN\(\s*(\{[\s\S]*?\})\s*\)/);
  if (!attMatch) throw new Error('no ytAtN challenge found on homepage');
  const attData = parseLooseJSON(attMatch[1]) as { R?: { bgChallenge?: ChallengeData } };
  const bgChallenge = attData?.R?.bgChallenge;
  if (!bgChallenge?.program || !bgChallenge?.interpreterUrl) {
    throw new Error('ytAtN payload missing bgChallenge fields');
  }
  return bgChallenge;
}

let minterCache: MinterCacheEntry | undefined;
let inflightMinter: Promise<WebPoMinter> | undefined;

/**
 * How long a freshly-minted WebPO minter stays cached. A missing/zero TTL
 * from GenerateIT must NOT become a 12h cache entry — every mint from it
 * would produce invalid GVS tokens (systemic 403 past 1MB) until restart.
 * Park unknown TTLs short so the next request re-mints instead.
 */
export function minterCacheTtlMs(estimatedTtlSecs: unknown): number {
  const ttlSecs = typeof estimatedTtlSecs === 'number' ? estimatedTtlSecs : Number(estimatedTtlSecs);
  if (!Number.isFinite(ttlSecs) || ttlSecs <= 0) return 5 * 60 * 1000;
  return Math.max(5 * 60 * 1000, ttlSecs * 1000 - 10 * 60 * 1000);
}

async function loadTokenMinter(fetchFn: typeof fetch): Promise<WebPoMinter> {
  if (minterCache && Date.now() < minterCache.expiry) return minterCache.minter;
  if (inflightMinter) return inflightMinter;

  inflightMinter = (async () => {
    ensureDomShim();
    const challenge = await getChallengeFromHomepage(fetchFn);

    const wrappedUrl = challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    const interpreterResponse = await fetchFn(`https:${wrappedUrl}`);
    if (!interpreterResponse.ok) throw new Error(`interpreter fetch failed (${interpreterResponse.status})`);
    const interpreterJs = await interpreterResponse.text();
    new Function(interpreterJs)();

    const bgClient = await BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObject: globalThis as unknown as Record<string, unknown>,
    });

    const webPoSignalOutput: WebPoSignalOutput = [];
    const botguardResponse = await bgClient.snapshot({ webPoSignalOutput });

    const integrityResponse = await fetchFn(buildURL('GenerateIT'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify([BG_REQUEST_KEY, botguardResponse]),
    });
    if (!integrityResponse.ok) throw new Error(`GenerateIT failed (${integrityResponse.status})`);
    const [integrityToken, estimatedTtlSecs, , websafeFallbackToken] =
      (await integrityResponse.json()) as [string, number, undefined?, string?];

    const minter = await WebPoMinter.create(
      { integrityToken, estimatedTtlSecs, websafeFallbackToken },
      webPoSignalOutput,
    );

    // Refresh comfortably before expiry; tokens themselves are minted lazily.
    minterCache = { minter, expiry: Date.now() + minterCacheTtlMs(estimatedTtlSecs) };
    return minter;
  })();

  try {
    return await inflightMinter;
  } catch (error) {
    // Allow a clean retry on the next request instead of caching a failure.
    minterCache = undefined;
    throw error;
  } finally {
    inflightMinter = undefined;
  }
}

let warnedMintUnavailable = false;

/**
 * Mints a video-ID-bound GVS PO token for direct stream URLs.
 * Returns null when minting is unavailable — callers must treat null as
 * "append nothing" and let normal playback/fallback logic proceed.
 */
export async function mintGvsPoToken(
  videoId: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const minter = await loadTokenMinter(fetchFn);
    return await minter.mintAsWebsafeString(videoId);
  } catch (error) {
    if (!warnedMintUnavailable) {
      warnedMintUnavailable = true;
      console.warn(
        '[youtube] PO token minting unavailable, stream URLs will be capped:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

/** Test hook: reset cached minters/flags. */
export function resetPoTokenStateForTests(): void {
  minterCache = undefined;
  inflightMinter = undefined;
  warnedMintUnavailable = false;
}
