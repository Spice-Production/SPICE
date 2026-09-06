import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import middlewareTesting from 'next/dist/experimental/testing/server/middleware-testing-utils.js';

const { unstable_doesMiddlewareMatch } = middlewareTesting;

const routeContracts = [
  {
    path: '../app/api/version/route.ts',
    cacheControl: 'public, s-maxage=300, stale-while-revalidate=600',
  },
  {
    path: '../app/api/runtime/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  },
  {
    path: '../app/api/notifications/release/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  },
  {
    path: '../app/api/updates/local-windows/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
  {
    path: '../app/api/updates/local-linux/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
  {
    path: '../app/api/updates/local-macos/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
  {
    path: '../app/api/downloads/local-windows/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
  {
    path: '../app/api/downloads/local-linux/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
  {
    path: '../app/api/downloads/local-macos/route.ts',
    cacheControl: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
  },
];

test('public deployment routes remain cacheable, preflight-safe, and wildcard-CORS enabled', async () => {
  const nextConfigSource = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');

  for (const contract of routeContracts) {
    const source = await readFile(new URL(contract.path, import.meta.url), 'utf8');

    assert.match(source, /export const dynamic = ['"]force-static['"]/u, `${contract.path} must retain static GET cache mode`);
    assert.match(source, /publicOptionsResponse/u, `${contract.path} must retain browser-cached preflight support`);
    assert.ok(
      source.includes('publicJsonResponse') || source.includes('publicCorsHeaders'),
      `${contract.path} must expose wildcard CORS`,
    );
    assert.ok(source.includes(contract.cacheControl), `${contract.path} must retain its CDN cache policy`);
  }

  assert.match(nextConfigSource, /Access-Control-Max-Age["'], value: ["']86400/u);
  assert.match(nextConfigSource, /publicApiPaths\.map/u);
});

test('Proxy skips only the intended public endpoints', async () => {
  const proxySource = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
  // The matcher is an array (apex '/' hub rewrite + the /api/* regex), so
  // collect every literal instead of assuming a single string.
  // Scan the matcher array quote-aware: the /api/* literal itself contains
  // brackets and slashes, so naive splits cut it apart.
  const QUOTE = 39;
  const DQUOTE = 34;
  const OPEN = 91;
  const CLOSE = 93;
  const BACKSLASH = 92;
  const matcherIdx = proxySource.indexOf('matcher:');
  let pos = proxySource.indexOf('[', matcherIdx);
  let depth = 0;
  let inStr = 0;
  let cur = '';
  const literals = [];
  for (; pos < proxySource.length; pos++) {
    const code = proxySource.charCodeAt(pos);
    if (inStr) {
      if (code === BACKSLASH) {
        cur += proxySource[pos + 1];
        pos += 1;
      } else if (code === inStr) {
        literals.push(cur);
        cur = '';
        inStr = 0;
      } else {
        cur += proxySource[pos];
      }
      continue;
    }
    if (code === QUOTE || code === DQUOTE) {
      inStr = code;
      cur = '';
    } else if (code === OPEN) {
      depth += 1;
    } else if (code === CLOSE) {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  assert.ok(literals.length > 0, 'proxy.ts must export literal matcher(s)');
  assert.ok(literals.includes('/'), 'proxy.ts must keep the apex hub rewrite');
  const matchesAny = (url) =>
    literals.some((matcher) => unstable_doesMiddlewareMatch({ config: { matcher }, url }));

  for (const url of [
    '/api/version',
    '/api/runtime',
    '/api/notifications/release',
    '/api/updates/local-windows',
    '/api/updates/local-linux',
    '/api/updates/local-macos',
    '/api/downloads/local-windows',
    '/api/downloads/local-linux',
    '/api/downloads/local-macos',
    '/api/version/',
    '/api/updates/local-windows/',
  ]) {
    assert.equal(
      matchesAny(url),
      false,
      `${url} should bypass Proxy and avoid a Neon settings read`,
    );
  }

  // The apex rewrite must stay covered. Next's middleware-test util reports
  // no match for an exact '/' matcher even though production Next invokes
  // the Proxy for it, so pin the rewrite in source instead of via the util.
  assert.ok(
    proxySource.includes('shouldServeHub(') && proxySource.includes("'/hub'"),
    'proxy must rewrite the apex root to the hub page',
  );

  for (const url of [
    '/api/auth/login',
    '/api/cloud/profiles',
    '/api/runtime-config',
    '/api/versioned',
    '/api/notifications/release-candidate',
    '/api/notifications/release/preview',
    '/api/updates',
    '/api/updates-admin',
    '/api/updates/internal',
    '/api/downloads',
    '/api/downloadsome',
    '/api/downloads/internal',
  ]) {
    assert.equal(
      matchesAny(url),
      true,
      `${url} should remain protected by Proxy`,
    );
  }
});
