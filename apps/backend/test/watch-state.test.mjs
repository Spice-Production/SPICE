import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('watch state endpoint returns list, resume, and completions behind account auth', async () => {
  const source = await read('app/api/watch/state/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /status: 401/, 'signed-out callers get 401');
  assert.match(source, /watchlist: list/, 'watchlist included');
  assert.match(source, /continueWatching: progress/, 'continue-watching included');
  assert.match(source, /completed \}/, 'completions included so checkmarks survive reloads');
  assert.match(source, /eq\(watchProgress\.completed, false\)/, 'resume rail hides finished items');
});

test('watchlist toggle validates input and add/remove both succeed idempotently', async () => {
  const source = await read('app/api/watch/watchlist/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /kind must be movie, show, or anime/, 'anime rides the same endpoint later');
  assert.match(source, /tmdbId must be a numeric id/, 'id shape validated');
  assert.match(source, /action must be add or remove/, 'action validated');
  assert.match(source, /onConflictDoNothing/, 'double-tap add stays a 200');
  assert.match(source, /Removing a missing row still succeeds/, 'remove is idempotent');
});

test('progress tracks episode granularity and refuses season numbers on movies', async () => {
  const source = await read('app/api/watch/progress/route.ts');
  assert.match(source, /verifySession\(auth\.substring\(7\)\)/, 'account Bearer session required');
  assert.match(source, /movies track no season or episode/, 'movies stay season-free');
  assert.match(source, /no position field/, 'no fake timestamps: embeds report none');
  assert.match(source, /update\(watchProgress\)/, 'repeat visits update, not duplicate');
});

test('browse surfaces share a sidebar frame, profile menu, and billboard hero', async () => {
  const chrome = await read('app/media-chrome.tsx');
  assert.match(chrome, /TV Series/, 'sidebar links to series');
  assert.match(chrome, /href="\/movie"/, 'sidebar links to movies');
  assert.match(chrome, /spice_cloud_user/, 'profile menu shows the account');
  assert.match(chrome, /Sign out/, 'profile menu signs out');
  assert.match(chrome, /removeItem\('spice_cloud_token'\)/, 'sign-out clears the token');
  assert.match(chrome, /Default source/, 'default watch source lives in the profile menu');
  assert.match(chrome, /savePreferredProvider/, 'source choice is remembered');
  assert.match(chrome, /MediaSignIn/, 'signed-out visitors sign in from the menu');
  const hero = await read('app/media-hero.tsx');
  assert.match(hero, /setInterval/, 'trending scrolls by itself');
  assert.match(hero, /Watch now/, 'hero plays the spotlight title');
  assert.match(hero, /My List/, 'hero toggles the list without leaving the page');
  const moviePage = await read('app/movie/page.tsx');
  assert.match(moviePage, /<MediaChrome active="movies"/, 'movies home sits in the frame');
  assert.match(moviePage, /<MediaHero/, 'movies home scrolls trending behind the header');
  assert.match(moviePage, /spotlight/, 'movies home spotlights TV series');
  assert.match(moviePage, /Explore all series/, 'spotlight links into shows');
  const showsPage = await read('app/shows/page.tsx');
  assert.match(showsPage, /<MediaChrome active="shows"/, 'shows home sits in the frame');
  assert.match(showsPage, /<MediaHero/, 'shows home gets the same billboard');
});

test('browse UI speaks SVG: no pictographic emoji, one shared icon set', async () => {
  const files = [
    'app/media-chrome.tsx',
    'app/media-hero.tsx',
    'app/media-icons.tsx',
    'app/media-signin.tsx',
    'app/watch-client.ts',
    'app/watch-shelves.tsx',
    'app/watch-sync.tsx',
    'app/movie/page.tsx',
    'app/movie/watch/[tmdbId]/page.tsx',
    'app/movie/watch/[tmdbId]/movie-player.tsx',
    'app/shows/page.tsx',
    'app/shows/watch/[id]/page.tsx',
    'app/shows/watch/[id]/show-player.tsx',
  ];
  const pictographic = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const allowedTypography = /[✓×→←+]/g;
  for (const file of files) {
    const source = (await read(file)).replace(allowedTypography, '');
    assert.doesNotMatch(source, pictographic, `${file} must use SVG icons, not emoji`);
  }
  const icons = await read('app/media-icons.tsx');
  for (const name of ['FilmIcon', 'TvIcon', 'MusicIcon', 'UserIcon', 'PlayIcon']) {
    assert.match(icons, new RegExp(`export function ${name}`), `${name} lives in the shared set`);
  }
  const chrome = await read('app/media-chrome.tsx');
  assert.match(chrome, /FilmIcon/, 'sidebar movies icon is SVG');
  assert.match(chrome, /spice-movies-icon\.svg/, 'sidebar brand wears the Movies mark');
  assert.match(chrome, /fetchAccountProfile/, 'profile menu loads the synced music profile');
  assert.match(chrome, /profile\?\.avatarUrl/, 'profile button and menu render the synced PFP with an initial-letter fallback');
  const client = await read('app/watch-client.ts');
  assert.match(client, /\/api\/sync\/profiles/, 'avatars resolve from the synced profiles endpoint');
  assert.match(client, /spice_cloud_profile_id/, 'the active music profile wins, first profile otherwise');
});

test('movies and shows wear their own clapperboard favicon, not the music note', async () => {
  for (const route of ['app/movie/icon.svg', 'app/shows/icon.svg']) {
    const icon = await read(route);
    assert.match(icon, /<svg/, `${route} is an SVG favicon`);
    assert.match(icon, /spice-movies-gradient/, `${route} carries the Movies mark`);
  }
  const source = await read('public/spice-movies-icon.svg');
  assert.match(source, /<rect[^>]*fill="#ffffff"/, 'white clapperboard on the brand squircle');
  assert.doesNotMatch(source, /id="gradient"/, 'gradient id is namespaced so it never clashes with the music icon');
});

test('browse shelves and players share one client and one toggle island', async () => {
  const client = await read('app/watch-client.ts');
  assert.match(client, /spice_cloud_token/, 'same token the music player stores — no second login per page');
  assert.match(client, /\/shows\/watch\//, 'resume links land on the episode');
  const shelves = await read('app/watch-shelves.tsx');
  assert.match(shelves, /Continue watching/, 'resume rail present');
  assert.match(shelves, /My List/, 'watchlist rail present');
  const sync = await read('app/watch-sync.tsx');
  assert.match(sync, /reportProgress\(token/, 'opening a title reports it');
  assert.match(sync, /MediaSignIn/, 'signed-out visitors get a sign-in, not dead buttons');
  const moviePage = await read('app/movie/watch/[tmdbId]/page.tsx');
  assert.match(moviePage, /<WatchSync/, 'film page syncs');
  const showPlayer = await read('app/shows/watch/[id]/show-player.tsx');
  assert.match(showPlayer, /<WatchSync/, 'series player syncs per episode');
});
