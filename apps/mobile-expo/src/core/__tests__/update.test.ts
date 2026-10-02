/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions, parseStableVersion, selectAndroidUpdate } from '../update.ts';

function release(tag: string, overrides: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) {
  const name = `Spice-Android-${tag}-release-signed.apk`;
  return {
    tag_name: tag,
    name: `Spice ${tag}`,
    body: 'Notes',
    draft: false,
    prerelease: false,
    assets: [
      {
        name,
        size: 40_000_000,
        content_type: 'application/vnd.android.package-archive',
        browser_download_url: `https://github.com/Spice-Production/SPICE/releases/download/${tag}/${name}`,
        ...asset,
      },
      { name: 'Spice-Setup.exe', size: 1, content_type: 'application/octet-stream', browser_download_url: 'https://github.com/x' },
    ],
    ...overrides,
  };
}

test('stable versions parse and order numerically', () => {
  assert.deepEqual(parseStableVersion('v1.4.67'), [1, 4, 67]);
  assert.equal(parseStableVersion('1.4.67-beta.1'), null);
  assert.equal(parseStableVersion('1.04.0'), null);
  assert.ok(compareVersions([1, 10, 0], [1, 9, 99]) > 0);
});

test('a newer stable release with the signed asset is offered', () => {
  const update = selectAndroidUpdate(release('v1.5.0'), '1.4.67');
  assert.equal(update?.version, '1.5.0');
  assert.equal(update?.assetName, 'Spice-Android-v1.5.0-release-signed.apk');
  assert.equal(update?.releasePageUrl, 'https://github.com/Spice-Production/SPICE/releases/tag/v1.5.0');
});

test('same, older, draft, and prerelease versions are ignored', () => {
  assert.equal(selectAndroidUpdate(release('v1.4.67'), '1.4.67'), null);
  assert.equal(selectAndroidUpdate(release('v1.4.0'), '1.4.67'), null);
  assert.equal(selectAndroidUpdate(release('v1.5.0', { draft: true }), '1.4.67'), null);
  assert.equal(selectAndroidUpdate(release('v1.5.0', { prerelease: true }), '1.4.67'), null);
  assert.equal(selectAndroidUpdate(release('v1.5.0-rc.1'), '1.4.67'), null);
});

test('assets from unexpected hosts, paths, sizes, or types are refused', () => {
  const offered = (asset: Record<string, unknown>) => selectAndroidUpdate(release('v1.5.0', {}, asset), '1.4.67');
  assert.equal(offered({ browser_download_url: 'https://evil.example/Spice-Android-v1.5.0-release-signed.apk' }), null);
  assert.equal(offered({ browser_download_url: 'http://github.com/Spice-Production/SPICE/releases/download/v1.5.0/Spice-Android-v1.5.0-release-signed.apk' }), null);
  assert.equal(offered({ browser_download_url: 'https://github.com/Other/SPICE/releases/download/v1.5.0/Spice-Android-v1.5.0-release-signed.apk' }), null);
  assert.equal(offered({ size: 0 }), null);
  assert.equal(offered({ content_type: 'text/html' }), null);
  assert.equal(selectAndroidUpdate({ ...release('v1.5.0'), assets: [] }, '1.4.67'), null);
});
