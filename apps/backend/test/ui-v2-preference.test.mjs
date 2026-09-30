import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  parseStoredSpiceUiV2Preference,
  resolveSpiceUiV2Preference,
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

test('without a query parameter the stored choice wins and nothing is persisted', () => {
  assert.deepEqual(resolveSpiceUiV2Preference(null, null), { enabled: false, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('true', null), { enabled: true, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'unknown'), { enabled: true, persist: false });
});

test('?ui=v2 opts in and ?ui=classic opts out, persisting only real changes', () => {
  assert.deepEqual(resolveSpiceUiV2Preference(null, 'v2'), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'V2'), { enabled: true, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference('false', ' preview '), { enabled: true, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('true', 'classic'), { enabled: false, persist: true });
  assert.deepEqual(resolveSpiceUiV2Preference('false', 'legacy'), { enabled: false, persist: false });
  assert.deepEqual(resolveSpiceUiV2Preference(null, 'classic'), { enabled: false, persist: true });
});

function runBootScript({ search = '', stored = null, storageThrows = false } = {}) {
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
