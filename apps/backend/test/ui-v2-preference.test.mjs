import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  parseSpiceUiV2Cookie,
  parseStoredSpiceUiV2Preference,
  readSpiceUiV2CookieValue,
  resolveSpiceUiV2ForRequest,
  resolveSpiceUiV2Preference,
  serializeSpiceUiV2Cookie,
  spiceUiV2CookieDomain,
  serializeSpiceUiV2Preference,
  SPICE_UI_V2_BOOT_SCRIPT,
  SPICE_UI_V2_DOCUMENT_ATTRIBUTE,
  SPICE_UI_V2_STORAGE_KEY,
} from '../app/ui-v2/preference.ts';

test('UI v2 stays off unless the stored preference is exactly "true"', () => {
  assert.equal(parseStoredSpiceUiV2Preference(null), false);
  assert.equal(parseStoredSpiceUiV2Preference(undefined), false);
  assert.equal(parseStoredSpiceUiV2Preference('false'), false);
  assert.equal(parseStoredSpiceUiV2Preference('1'), false);
  assert.equal(parseStoredSpiceUiV2Preference('true'), true);
  assert.equal(serializeSpiceUiV2Preference(true), 'true');
  assert.equal(serializeSpiceUiV2Preference(false), 'false');
});

test('without a query or cookie the stored choice wins and opted-in testers get the cookie', () => {
  assert.deepEqual(resolveSpiceUiV2Preference(null, null), { enabled: false, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('false', null), { enabled: false, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('true', null), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'unknown', 'v2'), { enabled: true, persist: false });
});

test('the domain cookie beats this origin localStorage and brings it in step', () => {
  assert.deepEqual(resolveSpiceUiV2Preference('true', null, 'classic'), { enabled: false, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference(null, null, 'v2'), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('false', null, 'classic'), { enabled: false, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('true', null, 'garbage'), { enabled: true, persist: true });
});

test('?ui=v2 opts in and ?ui=classic opts out, persisting only real changes', () => {
  assert.deepEqual(resolveSpiceUiV2Preference(null, 'v2'), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'V2', 'v2'), { enabled: true, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'v2'), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('false', ' preview ', 'classic'), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'classic', 'v2'), { enabled: false, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('false', 'legacy', 'classic'), { enabled: false, persist: false });
});

test('server pages resolve from the query first, then the cookie', () => {
  assert.equal(resolveSpiceUiV2ForRequest(undefined, undefined), false);
  assert.equal(resolveSpiceUiV2ForRequest('v2', undefined), true);
  assert.equal(resolveSpiceUiV2ForRequest('v2', 'classic'), false);
  assert.equal(resolveSpiceUiV2ForRequest('classic', ['v2', 'classic']), true);
});

test('the cookie is shared across SPICE subdomains but host-only on local hosts', () => {
  assert.equal(spiceUiV2CookieDomain('music.spice-app.xyz'), 'spice-app.xyz');
  assert.equal(spiceUiV2CookieDomain('movie.spice-app.xyz'), 'spice-app.xyz');
  assert.equal(spiceUiV2CookieDomain('spice-app.xyz'), 'spice-app.xyz');
  assert.equal(spiceUiV2CookieDomain('localhost'), null);
  assert.equal(spiceUiV2CookieDomain('127.0.0.1'), null);
  const cookie = serializeSpiceUiV2Cookie(true, 'movie.spice-app.xyz', true);
  assert.match(cookie, /^spice_ui=v2; Path=\/; Max-Age=\d+; SameSite=Lax; Domain=spice-app\.xyz; Secure$/u);
  assert.equal(serializeSpiceUiV2Cookie(false, '127.0.0.1', false), 'spice_ui=classic; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.equal(readSpiceUiV2CookieValue('a=1; spice_ui=v2; b=2'), 'v2');
  assert.equal(readSpiceUiV2CookieValue('spice_uix=v2'), null);
  assert.equal(parseSpiceUiV2Cookie('v2'), true);
  assert.equal(parseSpiceUiV2Cookie('classic'), false);
  assert.equal(parseSpiceUiV2Cookie('other'), null);
});

function runBootScript({ search = '', stored = null, storageThrows = false, cookie = '' } = {}) {
  const attributes = new Map();
  const context = {
    location: { search },
    URLSearchParams,
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('blocked');
        return key === SPICE_UI_V2_STORAGE_KEY ? stored : null;
      },
    },
    document: {
      cookie,
      documentElement: {
        setAttribute(name, value) {
          attributes.set(name, value);
        },
      },
    },
  };
  vm.runInNewContext(SPICE_UI_V2_BOOT_SCRIPT, context);
  return attributes.get(SPICE_UI_V2_DOCUMENT_ATTRIBUTE) ?? null;
}

test('the pre-hydration boot script marks <html> only for opted-in visits', () => {
  assert.equal(runBootScript(), null);
  assert.equal(runBootScript({ stored: 'true' }), 'v2');
  assert.equal(runBootScript({ search: '?ui=v2' }), 'v2');
  assert.equal(runBootScript({ search: '?ui=classic', stored: 'true' }), null);
  assert.equal(runBootScript({ stored: 'true', storageThrows: true }), null);
  assert.equal(runBootScript({ cookie: 'x=1; spice_ui=v2' }), 'v2');
  assert.equal(runBootScript({ cookie: 'spice_ui=classic', stored: 'true' }), null);
  assert.equal(runBootScript({ cookie: 'spice_ui=classic', search: '?ui=v2' }), 'v2');
});

test('SpiceApp keeps shared media mounted across the interface fork', async () => {
  const source = await readFile(new URL('../app/spice-app.tsx', import.meta.url), 'utf8');
  const forkIndex = source.indexOf('{uiV2Enabled ? (');
  assert.ok(forkIndex > 0, 'the classic/UI v2 render fork exists');
  const audioIndex = source.indexOf('{/* Hidden Audio Player */}');
  const youtubeIndex = source.indexOf('id="spice-yt-iframe-container"');
  assert.ok(audioIndex > 0 && audioIndex < forkIndex, 'audio elements render before (outside) the fork');
  assert.ok(youtubeIndex > 0 && youtubeIndex < forkIndex, 'the YouTube embed container renders before (outside) the fork');
  assert.match(source, /<SpiceUiV2 model=\{uiModel\} \/>/u);
});

test('classic settings expose the preview toggle', async () => {
  const source = await readFile(new URL('../app/spice-app.tsx', import.meta.url), 'utf8');
  assert.match(source, /id="interface-preview"/u);
  assert.match(source, /onClick=\{\(\) => setUiV2Enabled\(true\)\}/u);
});
