import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ACCENT_THEME_VARS,
  ARTWORK_RADIUS,
  cssDeclarations,
  isAccentThemeId,
  isVisualSurfaceId,
  SURFACE_THEME_VARS,
} from '../app/theme-presets.ts';

test('every accent preset defines the full accent variable set', () => {
  const required = ['--accent-pink', '--accent-pink-rgb', '--accent-purple', '--accent-violet', '--accent-cyan', '--accent-gradient', '--text-accent'];
  for (const [id, vars] of Object.entries(ACCENT_THEME_VARS)) {
    assert.ok(isAccentThemeId(id));
    for (const name of required) assert.ok(vars[name], `${id} is missing ${name}`);
  }
  assert.equal(isAccentThemeId('neon'), false);
});

test('every surface preset defines the surface variables UI v2 tokens read', () => {
  const required = ['--body-bg', '--border-color', '--bg-surface', '--bg-surface-hover', '--spice-app-background'];
  for (const [id, vars] of Object.entries(SURFACE_THEME_VARS)) {
    assert.ok(isVisualSurfaceId(id));
    for (const name of required) assert.ok(vars[name], `${id} is missing ${name}`);
  }
  assert.equal(SURFACE_THEME_VARS.daylight['color-scheme'], 'light');
  assert.deepEqual(Object.keys(ARTWORK_RADIUS).sort(), ['circle', 'rounded', 'soft']);
});

test('declarations render in the player style-tag format', () => {
  assert.equal(cssDeclarations({ '--a': '1', '--b': 'x y' }), '--a: 1;\n--b: x y;');
  assert.equal(cssDeclarations({ '--a': '1' }, true), '--a: 1 !important;');
});

test('the player builds its accent and surface CSS from the shared presets', async () => {
  const source = await readFile(new URL('../app/spice-app.tsx', import.meta.url), 'utf8');
  assert.match(source, /cssDeclarations\(ACCENT_THEME_VARS\[accentTheme\] \?\? ACCENT_THEME_VARS\.pink, true\)/u);
  assert.match(source, /Object\.entries\(SURFACE_THEME_VARS\)/u);
});

test('Spice Movies routes fork to the new interface', async () => {
  for (const page of ['../app/movie/page.tsx', '../app/shows/page.tsx']) {
    const source = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.match(source, /const ui = useSpiceUiV2\(\);/u, `${page} reads the preview preference`);
    assert.match(source, /if \(ui\.enabled\) \{[\s\S]*<WatchBrowseView/u, `${page} renders the v2 browse view`);
  }
  for (const page of ['../app/movie/watch/[tmdbId]/page.tsx', '../app/shows/watch/[id]/page.tsx']) {
    const source = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.match(source, /resolveSpiceUiV2ForRequest\(\(await cookies\(\)\)\.get\(SPICE_UI_V2_COOKIE\)\?\.value, query\.ui\)/u, `${page} picks the interface on the server`);
  }
});
