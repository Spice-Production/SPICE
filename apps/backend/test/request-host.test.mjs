import assert from 'node:assert/strict';
import test from 'node:test';

import {
  effectiveRequestHost,
  hostWithoutPort,
  isLoopbackHost,
} from '../lib/request-host.ts';

// The standalone server builds request.url from the bind address, not the
// Host header (observed on the self-host box: url.hostname stayed 0.0.0.0
// while Host varied). Gates must resolve the host from the forwarded chain.
function fakeRequest({ url = 'http://0.0.0.0:3000/api/yt/track/x', host, forwarded, proto } = {}) {
  const headers = new Headers();
  if (host !== undefined) headers.set('host', host);
  if (forwarded !== undefined) headers.set('x-forwarded-host', forwarded);
  if (proto !== undefined) headers.set('x-forwarded-proto', proto);
  return { url, headers };
}

test('hostWithoutPort strips ports and normalizes case', () => {
  assert.equal(hostWithoutPort('127.0.0.1:3000'), '127.0.0.1');
  assert.equal(hostWithoutPort('Music.Spice-App.XYZ'), 'music.spice-app.xyz');
  assert.equal(hostWithoutPort('music.spice-app.xyz:443'), 'music.spice-app.xyz');
  assert.equal(hostWithoutPort('[::1]:3000'), '::1');
  assert.equal(hostWithoutPort('::1'), '::1');
  assert.equal(hostWithoutPort(null), null);
  assert.equal(hostWithoutPort('  '), null);
});

test('effective host prefers X-Forwarded-Host, then Host, then URL', () => {
  assert.equal(
    effectiveRequestHost(fakeRequest({ forwarded: 'music.spice-app.xyz, proxy2' })),
    'music.spice-app.xyz',
  );
  assert.equal(
    effectiveRequestHost(fakeRequest({ host: '127.0.0.1:3000' })),
    '127.0.0.1',
  );
  assert.equal(effectiveRequestHost(fakeRequest()), '0.0.0.0');
});

test('bind-address URLs still resolve loopback and public hosts', () => {
  // Regression: request.url carries 0.0.0.0 under the standalone server, so
  // the Host header is what admits loopback callers and the public origin.
  assert.ok(isLoopbackHost(effectiveRequestHost(fakeRequest({ host: 'localhost:3000' }))));
  assert.ok(isLoopbackHost(effectiveRequestHost(fakeRequest({ host: '127.0.0.1' }))));
  assert.equal(
    effectiveRequestHost(fakeRequest({ host: 'music.spice-app.xyz' })),
    'music.spice-app.xyz',
  );
  assert.equal(effectiveRequestHost(fakeRequest({ host: 'attacker.example' })), 'attacker.example');
});

test('isLoopbackHost covers the loopback forms', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.ok(isLoopbackHost(host), `${host} must count as loopback`);
  }
  for (const host of ['0.0.0.0', '', 'music.spice-app.xyz', '10.0.0.4']) {
    assert.ok(!isLoopbackHost(host), `${host} must not count as loopback`);
  }
});

test('effectiveRequestOrigin follows the client-facing address', async () => {
  const { effectiveRequestOrigin } = await import('../lib/request-host.ts');
  // Local PC runtime: desktop calls 127.0.0.1:3939, signed URLs stay there.
  assert.equal(
    effectiveRequestOrigin(fakeRequest({ url: 'http://127.0.0.1:3939/api/yt/track/x', host: '127.0.0.1:3939' })),
    'http://127.0.0.1:3939',
  );
  // Self-host behind Caddy: internal URL is http + bind address, but the
  // client used https + the public domain.
  assert.equal(
    effectiveRequestOrigin(fakeRequest({
      url: 'http://0.0.0.0:3000/api/yt/track/x',
      host: 'music.spice-app.xyz',
      forwarded: 'music.spice-app.xyz',
      proto: 'https',
    })),
    'https://music.spice-app.xyz',
  );
});

test('loopbackOriginFor stays on 127.0.0.1 with the serving port', async () => {
  const { loopbackOriginFor } = await import('../lib/request-host.ts');
  // Namespace proxies self-fetch here: through Caddy the request URL is the
  // public https origin (no port) and the app listens on PORT.
  assert.equal(loopbackOriginFor('https://music.spice-app.xyz/api/x'), 'http://127.0.0.1:3000');
  // Direct and local-runtime hits carry the listen port already.
  assert.equal(loopbackOriginFor('http://127.0.0.1:3000/api/x'), 'http://127.0.0.1:3000');
  assert.equal(loopbackOriginFor('http://127.0.0.1:3939/api/x'), 'http://127.0.0.1:3939');
  assert.equal(loopbackOriginFor('not a url'), 'http://127.0.0.1:3000');
});

test('shouldServeHub matches only the bare apex path on the apex domain', async () => {
  const { shouldServeHub } = await import('../lib/request-host.ts');
  assert.equal(shouldServeHub('spice-app.xyz', '/', 'spice-app.xyz'), true);
  assert.equal(shouldServeHub('SPICE-APP.XYZ', '/', 'spice-app.xyz'), true);
  assert.equal(shouldServeHub('music.spice-app.xyz', '/', 'spice-app.xyz'), false);
  assert.equal(shouldServeHub('spice-app.xyz', '/api/runtime', 'spice-app.xyz'), false);
  assert.equal(shouldServeHub('spice-app.xyz', '/hub', 'spice-app.xyz'), false);
  assert.equal(shouldServeHub('spice-app.xyz', '/', null), false);
  assert.equal(shouldServeHub('spice-app.xyz', '/', ''), false);
});
