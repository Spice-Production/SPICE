// Invariants for the experimental UI kit (components/ui) and its /ui-lab
// showcase. Each guard encodes a lesson from the main surfaces:
//   1. native <select> popups ignore the dark theme -> Picker only
//   2. pictographic emoji is banned in sources -> text/SVG only
//   3. kit styles ride theme vars so Settings changes repaint live
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(backendRoot, 'components', 'ui');

const EXPECTED_COMPONENTS = ['Button.tsx', 'Card.tsx', 'TextField.tsx', 'Picker.tsx', 'Shelf.tsx', 'AppShell.tsx', 'PageHeader.tsx', 'PosterCard.tsx', 'Feedback.tsx', 'AccountMenu.tsx', 'Avatar.tsx', 'Badge.tsx', 'Dialog.tsx', 'ProfileButton.tsx', 'Separator.tsx', 'Switch.tsx', 'Toaster.tsx', 'notifications.tsx'];

// Pictographic ranges; typographic glyphs the kit legitimately uses stay allowed.
const ALLOWED_GLYPHS = new Set(['✓', '×', '→', '←', '+', '·', '—']);
const stripAllowed = (text) => [...text].filter((ch) => !ALLOWED_GLYPHS.has(ch)).join('');
const EMOJI_RE = /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F300}-\u{1FAFF}\u{FE0F}]/u;

async function readUi(file) {
  return readFile(path.join(uiDir, file), 'utf8');
}

test('kit ships the expected self-contained primitives plus tokens and docs', async () => {
  const files = await readdir(uiDir);
  for (const name of [...EXPECTED_COMPONENTS, 'index.ts', 'tokens.css', 'README.md']) {
    assert.ok(files.includes(name), `components/ui is missing ${name}`);
  }
});

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

test('kit never uses native <select> (OS popups ignore the dark theme)', async () => {
  for (const name of EXPECTED_COMPONENTS) {
    const source = stripComments(await readUi(name));
    assert.doesNotMatch(source, /<select[\s>]/, `${name} must use Picker, not <select>`);
  }
});

test('kit sources contain no pictographic emoji', async () => {
  for (const name of [...EXPECTED_COMPONENTS, 'index.ts']) {
    const source = stripAllowed(await readUi(name));
    assert.doesNotMatch(source, EMOJI_RE, `${name} must use text/SVG, not emoji`);
  }
});

test('kit styles ride the shared theme vars (live Settings repaint)', async () => {
  const tokens = await readUi('tokens.css');
  for (const themeVar of ['--bg-surface', '--text-primary', '--text-secondary']) {
    assert.ok(tokens.includes(themeVar), `tokens.css must reference ${themeVar}`);
  }
  for (const name of EXPECTED_COMPONENTS) {
    const source = await readUi(name);
    assert.ok(source.includes('var(--spk-'), `${name} must style via --spk-* tokens`);
  }
});

test('barrel re-exports every primitive', async () => {
  const barrel = await readUi('index.ts');
  for (const name of EXPECTED_COMPONENTS) {
    const base = name.replace(/\.tsx$/, '');
    assert.ok(barrel.includes(`./${base}`), `index.ts must re-export ${base}`);
  }
});

test('showcase page renders every primitive from the barrel', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'ui-lab', 'page.tsx'), 'utf8');
  assert.ok(page.includes('@/components/ui'), 'ui-lab page must import from the barrel');
  for (const symbol of ['Button', 'Card', 'TextField', 'Picker', 'Shelf', 'Avatar', 'Badge', 'Dialog', 'Separator', 'Switch', 'pushToast']) {
    assert.ok(page.includes(symbol), `ui-lab page must showcase ${symbol}`);
  }
});

test('browse pages leave account chrome to the shared shell', async () => {
  for (const route of ['v2/movie/page.tsx', 'v2/shows/page.tsx', 'v2/music/page.tsx']) {
    const page = await readFile(path.join(backendRoot, 'app', route), 'utf8');
    assert.ok(!page.includes('ProfileButton'), `${route} must not own a profile button (shell topbar has it)`);
    assert.ok(!page.includes('topbar='), `${route} must not own a topbar (shell provides it)`);
  }
});

test('v2 home is the real home screen (greeting, recap, shelves)', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'page.tsx'), 'utf8');
  assert.ok(page.includes('HomeView'), 'v2 home page must render the home island');
  assert.ok(!page.includes('MUSIC_ORIGIN'), 'v2 home must not build absolute origin links (they escape the host)');
  const home = await readFile(path.join(backendRoot, 'app', 'v2', 'home.tsx'), 'utf8');
  for (const token of ['Welcome back', 'Your Listening Week', 'Your Playlists', 'Recently Played', 'Forgotten Favorites']) {
    assert.ok(home.includes(token), `v2 home must render ${token}`);
  }
  for (const token of ['buildWeeklyListeningRecap', 'buildHomeHistoryShelves', 'normalizeListeningEvents', 'spice_listening_events', 'usePlayer', 'useMusicProfiles', 'PosterCard', 'Avatar']) {
    assert.ok(home.includes(token), `v2 home must reuse ${token}`);
  }
  assert.ok(home.includes("href=\"/v2/profile\""), 'v2 home must route sign-in to the profile surface');
  assert.ok(home.includes("href=\"/v2/music\""), 'v2 home tiles must stay inside the rebuild');
});

test('v2 movies keeps every browse capability (hero, search, shelves, spotlight, account)', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'movie', 'page.tsx'), 'utf8');
  for (const endpoint of ['api/movies/browse', 'api/movies/search', 'api/shows/browse']) {
    assert.ok(page.includes(endpoint), `v2 movies must hit ${endpoint}`);
  }
  assert.ok(page.includes('x-spice-api-namespace'), 'v2 movies must send the namespace header');
  assert.ok(page.includes('readAccountToken'), 'v2 movies must reuse the account token key');
  for (const symbol of ['V2MovieHero', 'V2WatchShelves', 'PosterCard', 'Skeleton', 'ErrorNote', 'EmptyState']) {
    assert.ok(page.includes(symbol), `v2 movies must render ${symbol}`);
  }
  assert.ok(page.includes('/movie/watch/'), 'v2 movies must link into the movie player');
  const hero = await readFile(path.join(backendRoot, 'app', 'v2', 'movie-hero.tsx'), 'utf8');
  assert.ok(hero.includes('setInterval'), 'v2 hero must keep rotating');
});

test('v2 movie watch keeps the server contract, sync island, and player', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'movie', 'watch', '[tmdbId]', 'page.tsx'), 'utf8');
  for (const token of ['normalizeTmdbMovieId', 'buildMovieEmbedUrl', 'notFound', 'generateMetadata', 'getMovieDetails']) {
    assert.ok(page.includes(token), `v2 watch page must keep ${token}`);
  }
  assert.ok(page.includes('V2WatchSync') && page.includes('V2MoviePlayer'), 'v2 watch page must render sync + player');
  assert.ok(page.includes('/v2/movie'), 'v2 watch page must link back to v2 browse');
  const sync = await readFile(path.join(backendRoot, 'app', 'v2', 'watch-sync.tsx'), 'utf8');
  for (const token of ['reportProgress', 'setWatchListStatus', 'toggleWatchlist', 'WATCH_LIST_STATUS_ORDER', 'Mark ']) {
    assert.ok(sync.includes(token), `v2 sync island must keep ${token.trim()}`);
  }
  const frame = await readFile(path.join(backendRoot, 'app', 'v2', 'watch-frame.tsx'), 'utf8');
  assert.ok(frame.includes('<iframe') && frame.includes('allowFullScreen'), 'v2 frame must keep the embed player');
  const player = await readFile(
    path.join(backendRoot, 'app', 'v2', 'movie', 'watch', '[tmdbId]', 'movie-player.tsx'),
    'utf8',
  );
  assert.ok(
    player.includes('loadPreferredProvider') && player.includes('savePreferredProvider'),
    'v2 movie player must persist the provider choice',
  );
});

test('v2 shows keeps the series browse capabilities (hero, search, airing shelf, account)', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'shows', 'page.tsx'), 'utf8');
  for (const endpoint of ['api/shows/browse', 'api/shows/search']) {
    assert.ok(page.includes(endpoint), `v2 shows must hit ${endpoint}`);
  }
  assert.ok(page.includes("'airing'"), 'v2 shows must keep the Airing now shelf');
  assert.ok(page.includes('kind="show"') || page.includes("kind='show'"), 'v2 shows must scope hero + shelves to shows');
  assert.ok(page.includes('/shows/watch/'), 'v2 shows must link into the series player');
  assert.ok(!page.includes('ProfileButton'), 'v2 shows must not own account chrome (shell topbar has it)');
});

test('v2 show watch keeps resume parsing, season picking, and per-episode playback', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'shows', 'watch', '[id]', 'page.tsx'), 'utf8');
  for (const token of ['normalizeTmdbMovieId', 'getShowDetails', 'notFound', 'generateMetadata', 'query.s', 'query.e']) {
    assert.ok(page.includes(token), `v2 show watch must keep ${token}`);
  }
  assert.ok(page.includes('/v2/shows'), 'v2 show watch must link back to v2 browse');
  const player = await readFile(
    path.join(backendRoot, 'app', 'v2', 'shows', 'watch', '[id]', 'show-player.tsx'),
    'utf8',
  );
  for (const token of ['api/shows/', 'tvUrl', 'V2WatchSync', 'Next episode']) {
    assert.ok(player.includes(token), `v2 show player must keep ${token}`);
  }
  assert.ok(player.includes('Picker'), 'v2 show player must pick seasons with the kit Picker');
  assert.doesNotMatch(stripComments(player), /<select[\s>]/, 'v2 show player must not regress to a native select');
});

test('v2 anime is an honest launchpad (no fake catalog)', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'anime', 'page.tsx'), 'utf8');
  assert.ok(!page.includes('<AppShell'), 'v2 anime must not own a shell (layout provides it)');
  assert.ok(page.includes('/v2/movie') && page.includes('/v2/shows'), 'v2 anime must point at working libraries');
  assert.doesNotMatch(page, /api\/(movies|shows)\//, 'v2 anime must not fake a catalog it cannot verify');
});

test('v2 shelves link inside the rebuilt tree (generic /watch/* stays orphaned)', async () => {
  const shelves = await readFile(path.join(backendRoot, 'app', 'v2', 'watch-shelves.tsx'), 'utf8');
  assert.ok(shelves.includes('v2WatchPageHref'), 'v2 shelves must route through the v2 link helper');
  assert.doesNotMatch(shelves, /watchPageHref/, 'v2 shelves must not link at the old routes');
  const helper = await readFile(path.join(backendRoot, 'app', 'v2', 'watch-href.ts'), 'utf8');
  assert.ok(helper.includes('/v2/shows/watch/') && helper.includes('/v2/movie/watch/'), 'v2 links must mirror the kind routing');
  assert.ok(helper.includes("params.set('s'") && helper.includes("params.set('e'"), 'v2 show links must carry resume params');
});

test('v2 system pages keep their contracts (reset, install, changelog, admin)', async () => {
  const reset = await readFile(path.join(backendRoot, 'app', 'v2', 'reset-password', 'page.tsx'), 'utf8');
  assert.ok(reset.includes('/api/auth/spice/reset'), 'v2 reset must hit the reset endpoint');
  assert.ok(reset.includes('newPassword'), 'v2 reset must send the same payload key');
  assert.ok(reset.includes('do not match'), 'v2 reset must keep the mismatch guard');
  for (const [route, island] of [
    ['install', 'InstallGuide'],
    ['local-runtime', 'InstallGuide'],
    ['changelog', 'ChangelogView'],
    ['admin-dashboard', 'AdminDashboardView'],
  ]) {
    const page = await readFile(path.join(backendRoot, 'app', 'v2', route, 'page.tsx'), 'utf8');
    assert.ok(page.includes(island), `v2 ${route} must reuse ${island}`);
    assert.ok(!page.includes('<AppShell'), `v2 ${route} must not own a shell (layout provides it)`);
  }
  const changelog = await readFile(path.join(backendRoot, 'app', 'v2', 'changelog', 'page.tsx'), 'utf8');
  assert.ok(changelog.includes("getChangelogPayload('user')"), 'v2 changelog must load the same payload');
});

test('v2 music slice 1 keeps search, resolve, and transport on the local lane', async () => {
  const transport = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'transport.ts'), 'utf8');
  for (const token of ['api/local/sc/search', 'api/local/yt/search', 'api/local/sc/track', 'api/local/yt/track', 'x-spice-api-namespace']) {
    assert.ok(transport.includes(token), `v2 music transport must keep ${token}`);
  }
  const engine = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'engine.ts'), 'utf8');
  for (const token of ['pickBestStream', 'capped', 'advance(1)', 'dual', 'timeupdate', 'loadedmetadata']) {
    assert.ok(engine.toLowerCase().includes(token.toLowerCase()), `v2 music engine must cover ${token}`);
  }
  assert.ok(engine.includes('mp4a') && engine.includes('bitrate'), 'v2 variant pick must prefer AAC then bitrate');
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'page.tsx'), 'utf8');
  for (const token of ['usePlayer', 'Now playing', 'preview quality']) {
    assert.ok(page.includes(token), `v2 music page must render ${token}`);
  }
  assert.ok(page.includes('MusicLibraryView'), 'v2 music must wire the synced library view');
  const library = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'library.tsx'), 'utf8');
  for (const token of ['api/sync/likes', 'api/sync/history', 'api/sync/playlists', 'includeSnapshots', 'profileId', 'likedTracks', 'Add now playing']) {
    assert.ok(library.includes(token), `v2 music library must keep ${token}`);
  }
  const lyrics = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'lyrics.tsx'), 'utf8');
  for (const token of ['api/local/', '/lyrics/', 'parseLrc', 'parsePlainLyrics', 'isSynced', 'scrollIntoView', 'data-sung', 'words']) {
    assert.ok(lyrics.includes(token), `v2 lyrics must keep ${token}`);
  }
  const profiles = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'profiles.tsx'), 'utf8');
  for (const token of ['api/sync/profiles', 'spice_cloud_profile_id', 'displayName', 'gradient', 'joinedAt']) {
    assert.ok(profiles.includes(token), `v2 profiles must keep ${token}`);
  }
  const playback = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'playback.tsx'), 'utf8');
  for (const token of ['loadPlaybackProfileState', 'savePlaybackProfileState', 'crossfade', 'equal-power', 'MAX_PLAYBACK_PROFILES']) {
    assert.ok(playback.includes(token), `v2 playback profiles must keep ${token}`);
  }
  const engine4 = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'engine.ts'), 'utf8');
  for (const token of ['createCrossfadePlan', 'crossfadeStateAt', 'crossfadeGains', 'spice_volume_booster_accepted', 'createMediaElementSource', 'shouldUsePlayerGainPath']) {
    assert.ok(engine4.includes(token), `v2 engine must wire ${token}`);
  }
  const themes = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'themes.tsx'), 'utf8');
  for (const token of ['loadStoredThemePalette', 'saveStoredThemePalette', 'createThemeCssVariables', 'setProperty']) {
    assert.ok(themes.includes(token), `v2 themes must keep ${token}`);
  }
  const palette = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'palette.tsx'), 'utf8');
  for (const token of ['filterCommandPaletteEntries', 'isCommandPaletteShortcut', 'role="dialog"', 'router.push']) {
    assert.ok(palette.includes(token), `v2 palette must keep ${token}`);
  }
  const scrobble = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'scrobble.tsx'), 'utf8');
  for (const token of ['api/profile/listens', 'playing_now', 'profileScrobbleThresholdSeconds', 'beginProfileListenDelivery', 'finishProfileListenDelivery']) {
    assert.ok(scrobble.includes(token), `v2 scrobble must keep ${token}`);
  }
  const extras = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'extras.tsx'), 'utf8');
  for (const token of ['resolveTrackStream', 'createObjectURL', 'api/local/yt/related', 'SPICE_MEDIA_CORE_VERSION', 'spice-stream-provider', 'api/listeners/like-you', 'neighborCount']) {
    assert.ok(extras.includes(token), `v2 extras must keep ${token}`);
  }
  const together = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'together.tsx'), 'utf8');
  for (const token of ['api/listen-together/session', 'api/listen-together/sync', 'api/listen-together/invite', 'listenTogetherNeedsSeek', 'TogetherView', 'useTogether', 'Sign in to host or join']) {
    assert.ok(together.includes(token), `v2 together must keep ${token}`);
  }
  const nav = await readFile(path.join(backendRoot, 'app', 'v2', 'nav.ts'), 'utf8');
  assert.ok(nav.includes("id: 'music'") && nav.includes("href: '/'"), 'v2 nav Music must be the music home at /');
  assert.ok(nav.includes("id: 'search'") && nav.includes("href: '/v2/music'"), 'v2 nav must keep a Search entry');
  assert.ok(nav.includes("id: 'library'") && nav.includes('/v2/music#library'), 'v2 nav Library must deep-link the library section');
  assert.ok(!nav.includes("id: 'home'"), 'v2 nav must not keep a separate home entry');
  assert.ok(!nav.includes('https://'), 'v2 nav must stay relative (never escape the host)');
  const accountApi = await readFile(path.join(backendRoot, 'app', 'v2', 'account.tsx'), 'utf8');
  assert.ok(accountApi.includes("RUNTIME_TARGET === 'local'"), 'v2 account must gate the absolute cloud origin on the desktop local runtime');
  assert.ok(!accountApi.includes("'vercel'"), 'v2 account must not branch on vercel (server-hosted targets stay same-origin)');
  const hostLib = await readFile(path.join(backendRoot, 'lib', 'request-host.ts'), 'utf8');
  assert.ok(hostLib.includes('shouldServeLab'), 'request-host must keep the lab front-door predicate');
  const proxy = await readFile(path.join(backendRoot, 'proxy.ts'), 'utf8');
  assert.ok(proxy.includes('shouldServeLab') && proxy.includes('SPICE_LAB_DOMAIN'), 'proxy must keep the lab root rewrite');
  const queue = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'queue.tsx'), 'utf8');
  assert.ok(queue.includes('playAt') || queue.includes('onPlayAt'), 'v2 queue must play from the list');
  const engineQueue = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'engine.ts'), 'utf8');
  for (const token of ['spice_is_shuffle', 'spice_repeat_mode', 'removeFromQueue', 'clearQueue', 'autoAdvance', 'onTrackCompleted']) {
    assert.ok(engineQueue.includes(token), `v2 engine must wire ${token}`);
  }
  const bell = await readFile(path.join(backendRoot, 'components', 'ui', 'notifications.tsx'), 'utf8');
  for (const token of ['api/notifications/release', 'RELEASE_NOTIFICATION_STORAGE_KEY', 'Mark all read']) {
    assert.ok(bell.includes(token), `v2 bell must keep ${token}`);
  }
  const account = await readFile(path.join(backendRoot, 'app', 'v2', 'account.tsx'), 'utf8');
  for (const token of ['auth/spice/', "'signin'", "'signup'", 'verify-email', 'resend-verification', 'account/me', 'account/username', 'spice_cloud_token', 'spice_token']) {
    assert.ok(account.includes(token), `v2 account must keep ${token}`);
  }
  for (const route of ['profile', 'settings']) {
    const page = await readFile(path.join(backendRoot, 'app', 'v2', route, 'page.tsx'), 'utf8');
    assert.ok(!page.includes('<AppShell'), `v2 ${route} must not own a shell (layout provides it)`);
  }
  const profile = await readFile(path.join(backendRoot, 'app', 'v2', 'profile', 'page.tsx'), 'utf8');
  assert.ok(profile.includes('AccountView') && profile.includes('ProfilesView'), 'v2 profile must host account + profiles');
  const settings = await readFile(path.join(backendRoot, 'app', 'v2', 'settings', 'page.tsx'), 'utf8');
  assert.ok(settings.includes('PlaybackView') && settings.includes('ThemeView') && settings.includes('DiagnosticsCard'), 'v2 settings must host playback + theme + diagnostics');
});

test('v2 music feeds the on-device recap the home screen reads', async () => {
  const page = await readFile(path.join(backendRoot, 'app', 'v2', 'music', 'page.tsx'), 'utf8');
  for (const token of ['usePlayer', 'searchRequest', 'Now playing']) {
    assert.ok(page.includes(token), `v2 music must use ${token} from the shared shell`);
  }
  assert.ok(!page.includes('<AppShell'), 'v2 music must not own a shell (layout provides it)');
});

test('v2 shell owns the persistent frame (player, playlists, search)', async () => {
  const shell = await readFile(path.join(backendRoot, 'app', 'v2', 'shell.tsx'), 'utf8');
  for (const token of ['PlayerProvider', 'usePlayer', 'V2Shell', 'PlayerBar', 'usePathname', 'hashchange', '#library', 'sidebarExtra', 'Playlists', '/v2/music?q=', 'Nothing playing', 'appendListeningEvent', 'spice_listening_events', 'discovered', 'recordHistory', 'toggleShuffle', 'cycleRepeat', 'toggleLike', 'v2-playerbar-on', 'V2Icon']) {
    assert.ok(shell.includes(token), `v2 shell must wire ${token}`);
  }
  const layout = await readFile(path.join(backendRoot, 'app', 'v2', 'layout.tsx'), 'utf8');
  assert.ok(layout.includes('PlayerProvider') && layout.includes('V2Shell'), 'v2 layout must host the persistent shell');
  for (const page of ['page', 'home', 'movie/page', 'shows/page', 'music/page', 'movie/watch/[tmdbId]/page', 'shows/watch/[id]/page', 'anime/page', 'profile/page', 'settings/page', 'admin-dashboard/page', 'changelog/page', 'install/page', 'local-runtime/page']) {
    const src = await readFile(path.join(backendRoot, 'app', 'v2', `${page}.tsx`), 'utf8');
    assert.ok(!src.includes('<AppShell'), `v2 ${page} must not own a shell (layout provides it)`);
  }
  const tokens = await readFile(path.join(backendRoot, 'components', 'ui', 'tokens.css'), 'utf8');
  assert.ok(tokens.includes('--spk-accent: #fafafa'), 'kit accent must stay shadcn-white, never purple');
});
