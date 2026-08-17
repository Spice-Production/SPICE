const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function executeThemeFunction(source, functionName, themes) {
  const properties = new Map();
  const documentElement = {
    dataset: {},
    style: {
      removeProperty: (name) => properties.delete(name),
      setProperty: (name, value) => properties.set(name, value),
    },
  };
  const context = vm.createContext({ document: { documentElement } });
  vm.runInContext(extractFunction(source, functionName), context);
  for (const theme of themes) vm.runInContext(`${functionName}(${JSON.stringify(theme)})`, context);
  return { documentElement, properties };
}

test('desktop-only settings stay in the Electron settings window', () => {
  const settings = read('settings.html');

  for (const controlId of [
    'adblock-type',
    'default-service',
    'discord-toggle',
    'vk-player-toggle',
    'topbar-search-toggle',
    'always-on-top-toggle',
    'start-on-boot-toggle',
    'open-toolbar-settings-btn',
    'custom-css',
    'check-updates-btn',
    'open-devtools-btn',
  ]) {
    assert.match(settings, new RegExp(`id=["']${controlId}["']`));
  }

  assert.match(settings, /id="open-spice-settings-btn"/);
  assert.match(settings, /Desktop Scrobbling/);
  assert.match(settings, /YouTube Music and SoundCloud/);
});

test('Native desktop settings move into SPICE Music while the wrapper keeps its window', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const viewPreload = read('preload-view.js');
  const main = read('main.js');
  const settings = read('settings.html');

  assert.match(spiceApp, /nativeShellAvailable/);
  assert.match(spiceApp, /SPICE Native Desktop/);
  assert.match(spiceApp, /Discord Rich Presence/);
  assert.match(spiceApp, /id="discord-activity"/);
  assert.match(spiceApp, /Listen on SPICE · Live track time/);
  assert.match(spiceApp, /Always on Top/);
  assert.match(spiceApp, /if \(!active \|\| !settings\.nativeMode\) return/);
  assert.match(viewPreload, /if \(!IS_SPICE_LOCAL_RUNTIME \|\| window\.spiceNativeShell\) return/);
  assert.match(viewPreload, /Object\.defineProperty\(window, 'spiceNativeShell'/);
  assert.match(main, /if \(!APP_NATIVE_MODE\) \{\s*createSettingsWindow\(\)/s);
  assert.match(main, /openSpiceSettingsInMainWindow\(\)\.catch/);
  assert.match(main, /APP_NATIVE_MODE && await dispatchSpiceDesktopNavigation\("home"\)/);
  assert.match(settings, /id="discord-toggle"/);
  assert.match(spiceApp, /action: 'back' \| 'home' \| 'settings'/);
  assert.match(spiceApp, /detail\.action === 'home'[\s\S]*setCurrentPage\('home'\)/);
});

test('SPICE settings group every section and keep the admin shortcut in Account only', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');

  for (const group of ['Personalize', 'Desktop', 'Playback', 'Connect', 'Support']) {
    assert.match(spiceApp, new RegExp(`label: ['"]${group}['"]`));
  }
  for (const sectionId of [
    'spice-connect',
    'offline-runtime',
    'feedback-support',
    'storage-safety',
    'system-diagnostics',
  ]) {
    assert.match(spiceApp, new RegExp(`id=["']${sectionId}["']`));
  }

  assert.match(spiceApp, /href="\/admin-dashboard"/);
  assert.doesNotMatch(spiceApp, /aria-label="Open admin dashboard"/);
});

test('SPICE exposes one authoritative playback clock to the native shell', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const main = read('main.js');

  assert.match(spiceApp, /setInterval\(samplePlaybackClock, 250\)/);
  assert.match(spiceApp, /__spiceGetPlaybackSnapshot/);
  assert.match(spiceApp, /node\.dataset\.spiceActive/);
  assert.match(main, /window\.__spiceGetPlaybackSnapshot\(\)/);
  assert.match(main, /dataset\.spiceActive === 'true'/);
});

test('Native shell removes the wrapper settings gear from its title bar', () => {
  const index = read('index.html');

  assert.match(index, /\$\{!nativeMode\s*&&\s*html`<button class="nav-btn" onClick=\$\{function\(\) \{ callApi\('openSettings'\); \}\}/s);
});

test('Electron boost confirmation uses a native dialog instead of covering the BrowserView', () => {
  const index = read('index.html');
  const main = read('main.js');
  const preload = read('preload.js');

  assert.match(index, /typeof window\.api\.confirmBoost === ['"]function['"]/);
  assert.match(index, /callApi\('confirmBoost'\)/);
  assert.match(main, /ipcMain\.handle\("confirm-boost"/);
  assert.match(main, /dialog\.showMessageBox\(parentWindow/);
  assert.match(preload, /confirmBoost: \(\) => ipcRenderer\.invoke\("confirm-boost"\)/);
});

test('desktop updater status reaches the settings window', () => {
  const main = read('main.js');
  const viewPreload = read('preload-view.js');

  assert.match(main, /function broadcastUpdateStatus\(payload\)/);
  assert.match(main, /for \(const target of \[mainWindow, settingsWindow\]\)/);
  assert.match(main, /view\.webContents\.send\("update-status", payload\)/);
  for (const status of ['checking', 'available', 'not-available', 'error', 'downloading', 'downloaded']) {
    assert.match(main, new RegExp(`broadcastUpdateStatus\\(\\{ status: ["']${status}["']`));
  }
  assert.match(viewPreload, /if \(!IS_SPICE_MUSIC \|\| window\.spiceDesktopUpdater\) return/);
  assert.match(viewPreload, /Object\.defineProperty\(window, 'spiceDesktopUpdater'/);
  assert.match(viewPreload, /checkForUpdates: \(\) => ipcRenderer\.invoke\('check-for-updates'\)/);
  assert.match(viewPreload, /return \(\) => ipcRenderer\.removeListener\('update-status', listener\)/);
});

test('desktop offline library is an explicit Spice-only file bridge', () => {
  const main = read('main.js');
  const viewPreload = read('preload-view.js');
  const spiceApp = read('apps/backend/app/spice-app.tsx');

  assert.match(main, /return app\.getPath\("downloads"\)/);
  assert.match(main, /requireTrustedSpiceSender\(event\)/);
  assert.match(main, /path\.basename\(fileName\) !== fileName/);
  assert.match(main, /protocol\.handle\("spice-offline"/);
  assert.match(main, /parsed\.searchParams\.get\("access"\) !== offlineLibraryProtocolToken\(\)/);
  assert.doesNotMatch(viewPreload, /require\(['"]\.\/desktop-helpers['"]\)/);
  assert.match(viewPreload, /function shouldBlockNativeStartupPlayback\(/);
  assert.match(viewPreload, /contextBridge\.exposeInMainWorld\('spiceDesktopOfflineLibrary', bridge\)/);
  assert.match(viewPreload, /if \(!process\.contextIsolated && window\.spiceDesktopOfflineLibrary\) return/);
  assert.doesNotMatch(
    viewPreload,
    /function installSpiceDesktopOfflineLibraryBridge\(\) \{\s*if \(!IS_SPICE_MUSIC/,
  );
  assert.match(viewPreload, /if \(!\(bytes instanceof ArrayBuffer\)\)/);
  assert.match(spiceApp, /bridge\.save\(fileName, await blob\.arrayBuffer\(\), track\)/);
  assert.match(viewPreload, /spice-offline-library-save/);
  assert.match(viewPreload, /spice-offline-library-exists/);
  assert.match(spiceApp, /offlineLibraryEntries\.reduce\(\(total, entry\).*entry\.bytes/s);
  assert.match(spiceApp, /await bridge\.exists\(entry\.fileName\)/);
  assert.match(
    spiceApp,
    /startTrackOnActiveReceiver\(\s*entry\.track,\s*offlineLibraryEntries\.map\(\(item\) => item\.track\),\s*'offline-library'/s,
  );
  assert.match(spiceApp, /Change folder/);
  assert.match(spiceApp, /Downloads Folder/);
  assert.match(
    spiceApp,
    /\{ id: 'offline-library', label: 'Downloads Folder', icon: Icons\.folder \}/,
  );
  assert.match(spiceApp, /Songs download to your system Downloads folder by default/);
  assert.match(spiceApp, /This web browser controls where downloads are saved/);
  assert.match(spiceApp, /Open folder/);
  assert.match(spiceApp, /Library → Downloads/);
  assert.match(spiceApp, /Download playlist/);
});

test('custom palettes and desktop boot launch are opt-in settings', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const viewPreload = read('preload-view.js');
  const main = read('main.js');

  assert.match(spiceApp, /useState\(false\).*customThemeEnabled|customThemeEnabled, setCustomThemeEnabled\] = useState\(false\)/);
  assert.match(spiceApp, /getItem\('spice_custom_theme_enabled'\) === 'true'/);
  assert.match(viewPreload, /getItem\('spice_custom_theme_enabled'\) === 'true'/);
  assert.match(spiceApp, /Start SPICE on boot/);
  assert.match(main, /ipcMain\.handle\("set-start-on-boot"/);
  assert.match(viewPreload, /setStartOnBoot: \(enabled\) => ipcRenderer\.invoke\('set-start-on-boot'/);
});

test('fresh launch stays idle while the selected Spice Connect receiver persists', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const switchProfileStart = spiceApp.indexOf('const switchProfile =');
  const switchProfileEnd = spiceApp.indexOf('const createProfile =', switchProfileStart);
  assert.notEqual(switchProfileStart, -1);
  assert.notEqual(switchProfileEnd, -1);
  const switchProfile = spiceApp.slice(switchProfileStart, switchProfileEnd);

  assert.match(switchProfile, /currentTrackRef\.current = IDLE_PLAYER_TRACK/);
  assert.match(switchProfile, /durationRef\.current = 0/);
  assert.match(switchProfile, /setCurrentTrack\(IDLE_PLAYER_TRACK\)/);
  assert.match(switchProfile, /setDuration\(0\)/);
  assert.doesNotMatch(switchProfile, /setCurrentTrack\(savedPlayback\.currentTrack\)/);
  assert.match(spiceApp, /localStorage\.getItem\('spice_connect_receiver_id'\) \|\| ''/);
  assert.match(spiceApp, /localStorage\.setItem\('spice_connect_receiver_id', safeDeviceId\)/);
});

test('SPICE BrowserViews keep Connect polling active while minimized', () => {
  const main = read('main.js');

  assert.match(main, /backgroundThrottling: serviceKey !== "spice_crazy"/);
  assert.match(main, /backgroundThrottling: target\.serviceKey !== "spice_crazy"/);
});

test('collapsed SPICE sidebar remains an interactive icon rail', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const styles = read('apps/backend/app/globals.css');

  assert.match(styles, /\.app\.app--sidebar-hidden\s*\{[^}]*grid-template-columns:\s*var\(--sidebar-collapsed\) 1fr/s);
  assert.match(styles, /\.sidebar\.sidebar--hidden\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(styles, /\.app--sidebar-hidden \.sidebar__nav-label[\s\S]*display:\s*none/);
  assert.match(spiceApp, /aria-label=\{sidebarHidden \? 'Collapsed sidebar' : 'Sidebar'\}/);
  assert.match(spiceApp, /sidebarHidden \? Icons\.chevronRight : Icons\.chevronLeft/);
  assert.doesNotMatch(spiceApp, /className="sidebar-restore-btn"/);
});

test('SPICE topbar search dismisses on an outside pointer press', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');

  assert.match(spiceApp, /const topbarSearchShellRef = useRef/);
  assert.match(spiceApp, /topbarSearchShellRef\.current\?\.contains\(target\)/);
  assert.match(spiceApp, /document\.addEventListener\('pointerdown', dismissTopbarSearch\)/);
  assert.match(spiceApp, /document\.removeEventListener\('pointerdown', dismissTopbarSearch\)/);
  assert.match(spiceApp, /className="app-topbar__search-shell" ref=\{topbarSearchShellRef\}/);
});

test('SPICE topbar layout is user-selectable and keeps search with its provider', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const styles = read('apps/backend/app/globals.css');

  assert.match(spiceApp, /type TopbarLayout = 'embedded' \| 'floating'/);
  assert.match(spiceApp, /localStorage\.getItem\('spice_topbar_layout'\)/);
  assert.match(spiceApp, /localStorage\.setItem\('spice_topbar_layout', e\.target\.value\)/);
  assert.match(
    spiceApp,
    /className="app-topbar__search-shell"[\s\S]*className="app-topbar__search"[\s\S]*className="app-topbar__provider"/,
  );
  assert.match(styles, /\.topbar-layout--embedded \.app-topbar\s*\{[\s\S]*border-radius:\s*0/);
  assert.match(styles, /\.app-topbar__search-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.app-topbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(260px, 780px\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.app-topbar__search-shell\s*\{[\s\S]*justify-self:\s*start/);
  assert.doesNotMatch(spiceApp, /className="app-topbar__context"/);
});

test('SPICE embedded header keeps an accessible profile menu and compact breakpoints', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const styles = read('apps/backend/app/globals.css');

  assert.match(spiceApp, /aria-haspopup="menu"/);
  assert.match(spiceApp, /aria-expanded=\{profileMenuOpen\}/);
  assert.match(spiceApp, /className="app-topbar__profile-menu" role="menu"/);
  assert.match(spiceApp, /document\.addEventListener\('keydown', dismissProfileMenuWithKeyboard\)/);
  assert.match(spiceApp, /event\.key === 'Escape'/);
  assert.match(spiceApp, /aria-label="Header layout"/);
  assert.match(spiceApp, /aria-label="Surface style"/);
  assert.match(styles, /@media \(max-width: 1500px\) and \(min-width: 1181px\)/);
  assert.match(
    styles,
    /grid-template-columns:\s*minmax\(280px, 780px\) minmax\(250px, 1fr\)/,
  );
  assert.match(styles, /@media \(max-width: 820px\) and \(min-width: 601px\)/);
  assert.match(styles, /\.app-topbar__profile,\s*\.topbar-layout--embedded \.app-topbar__profile/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.app-topbar__profile-menu\s*\{[\s\S]*var\(--bg-primary\)/);
  assert.match(spiceApp, /type VisualSurface = [^;]*'daylight'/);
  assert.match(spiceApp, /daylight:\s*`[\s\S]*--text-primary:\s*#19151f/);
  assert.match(spiceApp, /surface--\$\{visualSurface\}/);
});

test('restart-based desktop settings validate input and skip no-op restarts', () => {
  const main = read('main.js');

  assert.match(main, /DESKTOP_STARTUP_SERVICES\.has\(service\)/);
  assert.match(main, /DESKTOP_AD_BLOCKERS\.has\(value\)/);
  assert.match(main, /store\.get\("vkPlayerEnabled", false\) === next/);
  assert.match(main, /store\.get\("defaultService", DEFAULT_STARTUP_SERVICE\) === service/);
});

test('settings windows apply and clear live custom theme variables', () => {
  const custom = {
    primary: '#12ab34',
    secondary: '#3456cd',
    highlight: '#67ef89',
    background: '#020603',
    surface: '#0a170d',
    glass: 'rgba(2, 6, 3, 0.9)',
    border: 'rgba(18, 171, 52, 0.4)',
    primaryRgb: '18, 171, 52',
  };

  for (const [file, functionName] of [
    ['settings.html', 'applySettingsTheme'],
    ['toolbar-icons.html', 'applyToolbarTheme'],
  ]) {
    const source = read(file);
    const themed = executeThemeFunction(source, functionName, [
      { accent: 'green', surface: 'aurora', custom },
    ]);
    assert.equal(themed.documentElement.dataset.spiceAccent, 'green');
    assert.equal(themed.documentElement.dataset.spiceSurface, 'aurora');
    assert.equal(themed.properties.get('--accent'), custom.primary);
    assert.equal(themed.properties.get('--shell-background'), custom.background);
    assert.equal(themed.properties.get('--shell-surface'), custom.glass);
    assert.equal(themed.properties.get('--card-bg'), custom.surface);
    assert.equal(themed.properties.get('--border-glass'), custom.border);

    const reset = executeThemeFunction(source, functionName, [
      { accent: 'green', surface: 'aurora', custom },
      { accent: 'blue', surface: 'solid' },
    ]);
    assert.equal(reset.documentElement.dataset.spiceAccent, 'blue');
    assert.equal(reset.documentElement.dataset.spiceSurface, 'solid');
    assert.equal(reset.properties.size, 0);
  }
});

test('desktop settings keep one bounded scroller and scope wheel handling to hovered selects', () => {
  const settings = read('settings.html');

  assert.match(settings, /\.settings-layout\s*\{[^}]*min-height:\s*0/s);
  assert.match(settings, /\.settings-content\s*\{[^}]*min-height:\s*0/s);
  assert.match(settings, /document\.querySelectorAll\(['"]select['"]\)/);
  assert.match(settings, /event\.preventDefault\(\)/);
  assert.doesNotMatch(settings, /document\.activeElement\.tagName === ['"]SELECT['"]/);
});

test('desktop settings sidebar locks a requested section through smooth scrolling', () => {
  const settings = read('settings.html');

  assert.match(settings, /let requestedSidebarSection = null/);
  assert.match(settings, /if \(requestedSidebarSection\) \{\s*setActiveSidebarLink\(requestedSidebarSection\)/s);
  assert.match(settings, /scrollContainer\.scrollTop \+ sectionRect\.top - containerRect\.top - 20/);
  assert.match(settings, /link\.setAttribute\('aria-current', 'location'\)/);
  assert.match(settings, /sectionLink\.classList\.toggle\("hidden", isNativeMode\)/);
});

test('SPICE Music keeps command palette keyboard access without a topbar button', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');

  assert.match(spiceApp, /className="settings-page-nav"/);
  assert.match(spiceApp, /rgba\(var\(--accent-pink-rgb/);
  assert.match(spiceApp, /if \(!isCommandPaletteShortcut\(event\)\) return/);
  assert.match(spiceApp, /window\.addEventListener\('keydown', handleCommandPaletteShortcut\)/);
  assert.doesNotMatch(spiceApp, /className="app-topbar__command-palette"/);
  assert.doesNotMatch(spiceApp, /aria-label="Open command palette"/);
  assert.doesNotMatch(spiceApp, /className="now-playing__btn now-playing__command-palette"/);
  assert.doesNotMatch(spiceApp, /document\.activeElement.*tagName === 'SELECT'/s);
});

test('desktop starts at the requested wider default window size', () => {
  const main = read('main.js');

  assert.match(main, /const windowInstance = new BrowserWindow\(\{\s*width:\s*1350,\s*height:\s*800,/);
});

test('Native shell uses an authentication gate instead of a signed-in homepage', () => {
  const index = read('index.html');
  const main = read('main.js');
  const preload = read('preload.js');
  const styles = read('styles.css');

  assert.match(index, /class="theme-home-bg native-auth"/);
  assert.match(index, /Sign in to SPICE/);
  assert.match(index, /Continue without an account/);
  assert.match(index, /Startup interrupted/);
  assert.doesNotMatch(index, /Your music\.<br \/>/);
  assert.doesNotMatch(index, /Auto-open enabled/);
  assert.doesNotMatch(preload, /setAutoOpen/);
  assert.match(main, /const nativeDirectOpen = shouldOpenNativePlayerOnLaunch/);
  assert.match(main, /if \(!nativeDirectOpen\) \{\s*windowInstance\.show\(\)/s);
  assert.match(main, /await loadService\(startupService\)/);
  assert.match(styles, /\.native-auth__panel\s*\{[^}]*var\(--shell-surface\)/s);
  assert.match(styles, /\.native-auth__input\s*\{[^}]*var\(--text-primary\)/s);
});

test('desktop updater cleanup cannot quit before electron-updater launches the installer', () => {
  const main = read('main.js');

  assert.match(main, /for \(const targetWindow of BrowserWindow\.getAllWindows\(\)\)/);
  assert.match(main, /if \(updateInstallInProgress\) return;\s*if \(shouldQuitWhenLastWindowCloses\(process\.platform\)\) app\.quit\(\);/);
  assert.match(main, /await cleanupDesktopProcessForQuit\(\)/);
  assert.match(main, /await spiceRuntimeManager\.stop\(\)/);
  assert.match(main, /autoUpdater\.quitAndInstall\(false, true\)/);
});

test('single-note branding is used by the player favicon and hosted portal', () => {
  const spiceApp = read('apps/backend/app/spice-app.tsx');
  const portal = read('apps/backend/app/cloud-portal.tsx');
  const portalStyles = read('apps/backend/app/cloud-portal.module.css');

  assert.match(spiceApp, /<path d="M64 25v55\.2/);
  assert.match(portal, /<path d="M12 3v10\.55/);
  assert.match(portalStyles, /\.logoMark\s*\{[^}]*width:\s*54px/s);
});
