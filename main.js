const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  net,
  protocol,
  shell,
  session,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { autoUpdater } = require("electron-updater");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "spice-offline",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
const { SpiceLocalRuntimeManager } = require("./spice-local-runtime-manager");
const {
  DEFAULT_SHELL_THEME,
  normalizeShellTheme,
  parseSupportedServiceUrl,
  getNavigationHistory,
  navigateHistory,
  resolveLocalRuntimePlatform,
  shouldQuitWhenLastWindowCloses,
  supportsStartOnBoot,
  createLoginItemSettings,
  shouldOpenNativePlayerOnLaunch,
  collectOfflineLibraryFiles,
  resolveWrapperVolumeStages,
} = require("./desktop-helpers");

// Simple File Logger for Production Debugging - INITIALIZE FIRST
const logFile = path.join(app.getPath("userData"), "debug.log");
function logToFile(msg) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  } catch (e) {}
}

// Override console methods to log to file in production
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args) => {
  originalConsoleLog(...args);
  try {
    logToFile(`INFO: ${args.join(" ")}`);
  } catch (e) {}
};
console.error = (...args) => {
  originalConsoleError(...args);
  try {
    logToFile(`ERROR: ${args.join(" ")}`);
  } catch (e) {}
};

// Handle uncaught exceptions immediately
process.on("uncaughtException", (error) => {
  logToFile(`CRITICAL ERROR: ${error.stack}`);
  try {
    dialog.showErrorBox(
      "Critical Error",
      `A critical error occurred:\n${error.message}\nCheck debug.log for details.`,
    );
  } catch (e) {}
});

console.log("App Starting...");

let ElectronBlocker, fetch, Scrobbler, validateListenBrainzToken, discordRpc;

try {
  console.log("Loading dependencies...");
  ({ ElectronBlocker } = require("@cliqz/adblocker-electron"));
  fetch = require("node-fetch");
  ({ Scrobbler, validateListenBrainzToken } = require("./scrobbler"));
  discordRpc = require("./discord-rpc");
  console.log("Dependencies loaded successfully.");
} catch (err) {
  console.error("FAILED TO LOAD DEPENDENCIES:", err);
}

let store;
let mainWindow;
let view;
let viewHiddenForModal = false;
let settingsWindow = null;
let toolbarSettingsWindow = null;
let adBlocker = null;
let scrobbler = null;
let currentService = null; // Track which service is active for Discord RPC
let lastTrack = null; // Store last track to send to lyrics on open
let lyricsWindow = null;
let queueWindow = null;
let currentVolume = 1.0; // Volume gain value (0.0 - 10.0), shared across scopes
let currentBoostEnabled = false;
let spiceAudioControlRevision = 0;
let spiceRuntimeManager = null;
let applyVolumeToActiveView = () => {};
let updateInstallInProgress = false;
let updateInstallCleanupPromise = null;
let updateInstallCleanupCompleted = false;
let downloadedUpdateInfo = null;
let updateInstallPromptActive = false;
let skipDownloadedUpdateOnClose = false;
let appQuitCleanupPromise = null;
let appQuitCleanupCompleted = false;
let appRestartInProgress = false;

const SPICE_LOCAL_RUNTIME_PLATFORM = resolveLocalRuntimePlatform(process.platform);
const APP_NATIVE_MODE =
  Boolean(SPICE_LOCAL_RUNTIME_PLATFORM) &&
  (process.env.SPICE_NATIVE_APP === "1" ||
    process.env.SPICE_APP_MODE === "native" ||
    (app.isPackaged && hasBundledNativeRuntime()));
const UPDATE_CHANNEL = APP_NATIVE_MODE ? "native" : "latest";
const AUTO_UPDATE_SUPPORTED = process.platform !== "linux" || Boolean(process.env.APPIMAGE);
const SPICE_LOCAL_RUNTIME_URL = normalizeServiceUrl(
  process.env.SPICE_LOCAL_RUNTIME_URL || "http://127.0.0.1:3939/",
);
const SPICE_INSTALL_URL = normalizeServiceUrl(
  process.env.SPICE_INSTALL_URL || "https://install.spice-app.xyz/",
);
const SPICE_REMOTE_MUSIC_URL = "https://music.spice-app.xyz/";
const SPICE_LOCAL_MANIFEST_URL = SPICE_LOCAL_RUNTIME_PLATFORM
  ? process.env.SPICE_LOCAL_UPDATE_MANIFEST_URL ||
    `https://music.spice-app.xyz/api/updates/local-${SPICE_LOCAL_RUNTIME_PLATFORM}`
  : null;

const SERVICES = {
  yt: "https://music.youtube.com",
  yt_vk: "https://music.youtube.com", // VK layout uses same URL, just injects VK player UI
  sc: "https://soundcloud.com",
  spice_crazy: SPICE_LOCAL_RUNTIME_URL,
};
const DEFAULT_STARTUP_SERVICE = "spice_crazy";
const DEFAULT_NATIVE_STARTUP_SERVICE = "home";
const DESKTOP_STARTUP_SERVICES = new Set(["home", "yt", "sc", "spice_crazy"]);
const DESKTOP_AD_BLOCKERS = new Set(["spice", "ublock", "none"]);
const DEFAULT_TOOLBAR_BUTTONS = {
  back: true,
  reload: true,
  openUrl: true,
  home: true,
  volume: true,
  lyrics: true,
  miniPlayer: true,
  queue: true,
};

function getShellTheme() {
  return normalizeShellTheme(
    store ? store.get("shellTheme", DEFAULT_SHELL_THEME) : DEFAULT_SHELL_THEME,
  );
}

function sendShellTheme(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send("shell-theme-changed", getShellTheme());
}

function broadcastShellTheme() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendShellTheme(mainWindow.webContents);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    sendShellTheme(settingsWindow.webContents);
  }
  if (toolbarSettingsWindow && !toolbarSettingsWindow.isDestroyed()) {
    sendShellTheme(toolbarSettingsWindow.webContents);
  }
}

function broadcastUpdateStatus(payload) {
  for (const target of [mainWindow, settingsWindow]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send("update-status", payload);
    }
  }
  if (view && view.webContents && !view.webContents.isDestroyed()) {
    view.webContents.send("update-status", payload);
  }
}

function updateShellTheme(value) {
  const next = normalizeShellTheme(value);
  if (store) store.set("shellTheme", next);
  broadcastShellTheme();
  return next;
}

function getAlwaysOnTop() {
  return store ? store.get("alwaysOnTop", false) === true : false;
}

function setAlwaysOnTop(enabled) {
  const next = enabled === true;
  if (store) store.set("alwaysOnTop", next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(next);
  }
  return next;
}

function getStartOnBootSettings() {
  if (!supportsStartOnBoot(process.platform)) {
    return { supported: false, enabled: false };
  }
  try {
    const query = createLoginItemSettings(false, process.platform, process.execPath);
    delete query.openAtLogin;
    const settings = app.getLoginItemSettings(query);
    return { supported: true, enabled: settings.openAtLogin === true };
  } catch (error) {
    console.error("Could not read the start-on-boot setting:", error);
    return { supported: false, enabled: false };
  }
}

function setStartOnBoot(enabled) {
  if (!supportsStartOnBoot(process.platform)) {
    return { supported: false, enabled: false };
  }
  app.setLoginItemSettings(
    createLoginItemSettings(enabled, process.platform, process.execPath),
  );
  return getStartOnBootSettings();
}

function normalizeServiceUrl(url) {
  const value = String(url || "").trim();
  return value.endsWith("/") ? value : `${value}/`;
}

function bundledNativeRuntimeDir() {
  if (!SPICE_LOCAL_RUNTIME_PLATFORM) return null;
  const bundleName = `spice-local-${SPICE_LOCAL_RUNTIME_PLATFORM}`;
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "native-runtime", bundleName));
  }
  candidates.push(path.join(__dirname, "native-runtime", bundleName));

  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "apps", "backend", "server.js")),
  ) || candidates[0];
}

function hasBundledNativeRuntime() {
  const runtimeDir = bundledNativeRuntimeDir();
  return Boolean(
    runtimeDir &&
      fs.existsSync(path.join(runtimeDir, "apps", "backend", "server.js")),
  );
}

function nativeModeSettings() {
  return {
    nativeMode: APP_NATIVE_MODE,
    bundledRuntimeAvailable: hasBundledNativeRuntime(),
  };
}

function getNativeAccountSnapshot() {
  if (!store) return null;
  const saved = store.get("nativeAccount", null);
  if (!saved || typeof saved !== "object" || typeof saved.token !== "string") {
    return null;
  }
  return {
    token: saved.token,
    user: saved.user && typeof saved.user === "object" ? saved.user : null,
    signedInAt: saved.signedInAt || null,
  };
}

function getNativeAccountSummary() {
  const snapshot = getNativeAccountSnapshot();
  if (!snapshot) return null;
  return {
    user: snapshot.user,
    signedInAt: snapshot.signedInAt,
  };
}

function saveNativeAccount(token, user) {
  if (!store || !token) return null;
  const snapshot = {
    token,
    user: user && typeof user === "object" ? user : null,
    signedInAt: new Date().toISOString(),
  };
  store.set("nativeAccount", snapshot);
  store.set("nativeOnboarded", true);
  return getNativeAccountSummary();
}

function clearNativeAccount() {
  if (!store) return;
  store.delete("nativeAccount");
  store.set("nativeOnboarded", false);
}

async function ensureLocalRuntimeReady() {
  if (!spiceRuntimeManager) {
    throw new Error("SPICE local runtime manager is not ready yet.");
  }
  await spiceRuntimeManager.ensureBundledRuntimeInstalled();
  let updateError = null;
  try {
    await spiceRuntimeManager.installLatestIfAvailable();
  } catch (error) {
    updateError = error;
    console.error("Native runtime update check failed:", error);
  }
  const status = await spiceRuntimeManager.getStatus();
  if (!status.installed && !status.running) {
    if (updateError) {
      throw updateError;
    }
    await spiceRuntimeManager.installOrUpdate();
  }
  await spiceRuntimeManager.start();
  return spiceRuntimeManager.getStatus();
}

async function nativeCloudAuth(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing sign-in payload.");
  }

  await ensureLocalRuntimeReady();

  const requestedMode = String(payload.mode || "signin");
  const mode = requestedMode === "register"
    ? "signup"
    : requestedMode === "verify"
      ? "verify-email"
      : requestedMode === "resend"
        ? "resend-verification"
        : "signin";
  const body = {};
  if (mode === "signup" || mode === "signin") {
    body.email = String(payload.email || "").trim();
    body.password = String(payload.password || "");
  }
  if (mode === "signup") {
    body.username = String(payload.username || "").trim();
  }
  if (mode === "verify-email") {
    body.registrationId = String(payload.registrationId || "");
    body.code = String(payload.code || "");
  }
  if (mode === "resend-verification") {
    body.registrationId = String(payload.registrationId || "");
  }

  const response = await fetch(new URL(`/api/cloud/auth/spice/${mode}`, SPICE_LOCAL_RUNTIME_URL).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: SPICE_LOCAL_RUNTIME_URL.replace(/\/$/, ""),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || "SPICE account request failed.");
  }

  if (data.verificationRequired === true) {
    return data;
  }

  const token = data.token || data.sessionToken || data.accessToken;
  const user = data.user || data.account || data.accountSnapshot || null;
  if (!token) {
    throw new Error("SPICE account service did not return a session token.");
  }

  return saveNativeAccount(token, user);
}

function getFetchImplementation() {
  if (typeof fetch === "function") return fetch;
  if (typeof global.fetch === "function") return global.fetch;
  return null;
}

async function isLocalSpiceRuntimeReady() {
  const fetchFn = getFetchImplementation();
  if (!fetchFn) return false;

  const runtimeStatusUrl = new URL("/api/runtime", SPICE_LOCAL_RUNTIME_URL).toString();
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), 1500);
  });

  const request = fetchFn(runtimeStatusUrl, {
    headers: { Accept: "application/json" },
  }).catch(() => null);

  const response = await Promise.race([request, timeout]);
  return Boolean(response && response.ok);
}

async function resolveServiceUrl(serviceKey) {
  if (serviceKey !== "spice_crazy") return SERVICES[serviceKey];
  if (await isLocalSpiceRuntimeReady()) return SPICE_LOCAL_RUNTIME_URL;
  if (!SPICE_LOCAL_RUNTIME_PLATFORM) return SPICE_REMOTE_MUSIC_URL;

  if (APP_NATIVE_MODE && spiceRuntimeManager) {
    try {
      await ensureLocalRuntimeReady();
      return SPICE_LOCAL_RUNTIME_URL;
    } catch (error) {
      console.warn("Native runtime prepare failed before loading SPICE Music:", error && error.message);
    }
  }

  if (spiceRuntimeManager) {
    const status = await spiceRuntimeManager.getStatus();

    if (status.supported && status.installed) {
      try {
        await spiceRuntimeManager.start();
        return SPICE_LOCAL_RUNTIME_URL;
      } catch (error) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          buttons: ["Install / update", "Open install guide", "Try localhost anyway", "Cancel"],
          defaultId: 0,
          cancelId: 3,
          title: "SPICE local runtime could not start",
          message: "Spice could not auto-start the local runtime.",
          detail:
            error instanceof Error
              ? error.message
              : "Update the local runtime or open the install guide before trying again.",
        });

        if (result.response === 0) {
          await spiceRuntimeManager.installOrUpdate();
          await spiceRuntimeManager.start();
          return SPICE_LOCAL_RUNTIME_URL;
        }
        if (result.response === 1) return SPICE_INSTALL_URL;
        if (result.response === 2) return SPICE_LOCAL_RUNTIME_URL;
        return null;
      }
    }

    if (status.supported && !status.installed) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Install runtime", "Open install guide", "Try localhost anyway", "Cancel"],
        defaultId: 0,
        cancelId: 3,
        title: "Install SPICE local runtime",
        message: "SPICE Music now runs from a local runtime package.",
        detail:
          "Spice can download, verify, install, and start the local runtime for you. The hosted install guide remains available if you want the manual scripts or ZIP.",
      });

      if (result.response === 0) {
        await spiceRuntimeManager.installOrUpdate();
        await spiceRuntimeManager.start();
        return SPICE_LOCAL_RUNTIME_URL;
      }
      if (result.response === 1) return SPICE_INSTALL_URL;
      if (result.response === 2) return SPICE_LOCAL_RUNTIME_URL;
      return null;
    }
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Open install guide", "Try localhost anyway", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "SPICE local runtime is not running",
    message: "SPICE Music now runs from the local PC runtime.",
    detail:
      "Start the SPICE local runtime on 127.0.0.1:3939, or open the install guide to download and set it up.",
  });

  if (result.response === 0) return SPICE_INSTALL_URL;
  if (result.response === 1) return SPICE_LOCAL_RUNTIME_URL;
  return null;
}

const AD_CSS = `
    .video-ads, .ytp-ad-module, .ytp-ad-image-overlay, .ytp-ad-text-overlay,
    ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-compact-promoted-item-renderer,
    .ytd-action-companion-ad-renderer, .ytd-search-pyv-renderer,
    #player-ads, .ad-container, .masthead-ad-control {
        display: none !important;
    }
`;

function initStore() {
  // Synchronous init with CJS electron-store
  try {
    const Store = require("electron-store");
    store = new Store();
    const savedVolume = Number(store.get("volume", currentVolume));
    if (Number.isFinite(savedVolume)) currentVolume = Math.max(0, Math.min(10, savedVolume));
    currentBoostEnabled = Boolean(store.get("boostEnabled", false));
    syncMiniPlayerAudioState();
    // Initialize scrobbler after store
    scrobbler = new Scrobbler(store);
    console.log("Scrobbler initialized");
  } catch (error) {
    console.error("Failed to initialize electron-store:", error);
  }
}

const OFFLINE_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wav",
  ".flac",
  ".webm",
]);
const OFFLINE_LIBRARY_DIRECTORY_KEY = "offlineLibraryDirectory";
const OFFLINE_LIBRARY_METADATA_KEY = "offlineLibraryMetadata";
const OFFLINE_LIBRARY_PROTOCOL_TOKEN_KEY = "offlineLibraryProtocolToken";
const MAX_OFFLINE_AUDIO_BYTES = 500 * 1024 * 1024;
let offlineLibraryProtocolAccessToken = null;

function offlineLibraryProtocolToken() {
  if (offlineLibraryProtocolAccessToken) return offlineLibraryProtocolAccessToken;
  const configured = store && store.get(OFFLINE_LIBRARY_PROTOCOL_TOKEN_KEY);
  offlineLibraryProtocolAccessToken = typeof configured === "string" && /^[a-f0-9]{48}$/i.test(configured)
    ? configured
    : crypto.randomBytes(24).toString("hex");
  if (store && configured !== offlineLibraryProtocolAccessToken) {
    store.set(OFFLINE_LIBRARY_PROTOCOL_TOKEN_KEY, offlineLibraryProtocolAccessToken);
  }
  return offlineLibraryProtocolAccessToken;
}

function defaultOfflineLibraryDirectory() {
  return app.getPath("downloads");
}

function offlineLibraryDirectory() {
  const configured = store && store.get(OFFLINE_LIBRARY_DIRECTORY_KEY);
  return typeof configured === "string" && path.isAbsolute(configured)
    ? path.resolve(configured)
    : defaultOfflineLibraryDirectory();
}

function safeOfflineFileStem(value) {
  const cleaned = String(value || "Spice download")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return cleaned || "Spice download";
}

function isTrustedSpiceWebContents(webContents) {
  try {
    const parsed = new URL(webContents.getURL());
    return (
      parsed.protocol === "https:"
      && ["music.spice-app.xyz", "spice-app.xyz", "www.spice-app.xyz"].includes(parsed.hostname)
    ) || (
      parsed.protocol === "http:"
      && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
      && parsed.port === "3939"
    );
  } catch (_) {
    return false;
  }
}

function requireTrustedSpiceSender(event) {
  if (!isTrustedSpiceWebContents(event.sender)) {
    throw new Error("Offline library access is restricted to the Spice music client.");
  }
}

function offlineMetadata() {
  const value = store && store.get(OFFLINE_LIBRARY_METADATA_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function ensureOfflineLibraryDirectory() {
  const directory = offlineLibraryDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  return directory;
}

async function uniqueOfflineFilePath(directory, requestedStem, extension = ".mp3") {
  const stem = safeOfflineFileStem(requestedStem);
  const safeExtension = OFFLINE_AUDIO_EXTENSIONS.has(extension.toLowerCase())
    ? extension.toLowerCase()
    : ".mp3";
  let suffix = 1;
  let candidate = path.join(directory, `${stem}${safeExtension}`);
  while (fs.existsSync(candidate)) {
    suffix += 1;
    candidate = path.join(directory, `${stem} (${suffix})${safeExtension}`);
  }
  return candidate;
}

async function listOfflineLibraryTracks() {
  const directory = await ensureOfflineLibraryDirectory();
  const metadata = offlineMetadata();
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && OFFLINE_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
  const snapshot = await collectOfflineLibraryFiles(
    fileNames,
    (fileName) => fs.promises.stat(path.join(directory, fileName)),
    metadata,
  );
  if (snapshot.metadataChanged && store) {
    store.set(OFFLINE_LIBRARY_METADATA_KEY, snapshot.metadata);
  }
  const tracks = snapshot.files.map((entry) => {
      const saved = snapshot.metadata[entry.fileName] && typeof snapshot.metadata[entry.fileName] === "object"
        ? snapshot.metadata[entry.fileName]
        : {};
      const fallbackTitle = path.basename(entry.fileName, path.extname(entry.fileName));
      const url = `spice-offline://audio/${encodeURIComponent(entry.fileName)}?access=${offlineLibraryProtocolToken()}`;
      return {
        fileName: entry.fileName,
        bytes: entry.bytes,
        updatedAt: entry.updatedAt,
        url,
        track: {
          id: `offline:${encodeURIComponent(entry.fileName)}`,
          title: saved.title || fallbackTitle,
          artists: Array.isArray(saved.artists) && saved.artists.length
            ? saved.artists
            : [{ id: "offline-artist", name: "Offline library" }],
          album: saved.album,
          durationMs: saved.durationMs,
          artworkUrl: saved.artworkUrl,
          sourceId: "offline",
          permalinkUrl: url,
        },
      };
    });
  return tracks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function installOfflineAudioProtocol() {
  protocol.handle("spice-offline", async (request) => {
    try {
      const parsed = new URL(request.url);
      if (parsed.hostname !== "audio") return new Response("Not found", { status: 404 });
      if (parsed.searchParams.get("access") !== offlineLibraryProtocolToken()) {
        return new Response("Forbidden", { status: 403 });
      }
      const fileName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      if (!fileName || path.basename(fileName) !== fileName) {
        return new Response("Invalid offline audio path", { status: 400 });
      }
      const extension = path.extname(fileName).toLowerCase();
      if (!OFFLINE_AUDIO_EXTENSIONS.has(extension)) {
        return new Response("Unsupported audio file", { status: 415 });
      }
      const directory = await ensureOfflineLibraryDirectory();
      const filePath = path.join(directory, fileName);
      if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
      const headers = {};
      const range = request.headers.get("range");
      if (range) headers.Range = range;
      return net.fetch(pathToFileURL(filePath).toString(), { headers });
    } catch (error) {
      console.error("[Offline Library] Protocol error:", error);
      return new Response("Offline audio unavailable", { status: 500 });
    }
  });
}

ipcMain.handle("spice-offline-library-settings", async (event) => {
  requireTrustedSpiceSender(event);
  const directory = await ensureOfflineLibraryDirectory();
  return { directory };
});

ipcMain.handle("spice-offline-library-choose-directory", async (event) => {
  requireTrustedSpiceSender(event);
  const options = {
    title: "Choose Spice offline music folder",
    defaultPath: offlineLibraryDirectory(),
    properties: ["openDirectory", "createDirectory"],
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, directory: offlineLibraryDirectory() };
  }
  const directory = path.resolve(result.filePaths[0]);
  await fs.promises.mkdir(directory, { recursive: true });
  if (store) store.set(OFFLINE_LIBRARY_DIRECTORY_KEY, directory);
  return { canceled: false, directory };
});

ipcMain.handle("spice-offline-library-list", async (event) => {
  requireTrustedSpiceSender(event);
  return { directory: offlineLibraryDirectory(), tracks: await listOfflineLibraryTracks() };
});

ipcMain.handle("spice-offline-library-exists", async (event, fileName) => {
  requireTrustedSpiceSender(event);
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName) {
    throw new Error("Invalid offline audio file.");
  }
  const filePath = path.join(offlineLibraryDirectory(), fileName);
  const exists = await fs.promises.stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
  return { exists, fileName };
});

ipcMain.handle("spice-offline-library-save", async (event, payload = {}) => {
  requireTrustedSpiceSender(event);
  const bytes = payload.bytes instanceof ArrayBuffer
    ? Buffer.from(payload.bytes)
    : Buffer.from(payload.bytes || []);
  if (!bytes.length || bytes.length > MAX_OFFLINE_AUDIO_BYTES) {
    throw new Error("The downloaded audio file is empty or too large.");
  }
  const track = payload.track && typeof payload.track === "object" ? payload.track : {};
  const directory = await ensureOfflineLibraryDirectory();
  const filePath = await uniqueOfflineFilePath(
    directory,
    payload.fileName || `${track.artists?.[0]?.name || "Unknown artist"} - ${track.title || "Spice download"}`,
    ".mp3",
  );
  const temporaryPath = `${filePath}.spice-part`;
  await fs.promises.writeFile(temporaryPath, bytes, { flag: "wx" });
  await fs.promises.rename(temporaryPath, filePath);
  const fileName = path.basename(filePath);
  const metadata = offlineMetadata();
  metadata[fileName] = {
    title: track.title,
    artists: track.artists,
    album: track.album,
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl,
  };
  if (store) store.set(OFFLINE_LIBRARY_METADATA_KEY, metadata);
  return { success: true, directory, fileName };
});

ipcMain.handle("spice-offline-library-remove", async (event, fileName) => {
  requireTrustedSpiceSender(event);
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName) {
    throw new Error("Invalid offline audio file.");
  }
  const filePath = path.join(offlineLibraryDirectory(), fileName);
  await fs.promises.rm(filePath, { force: true });
  const metadata = offlineMetadata();
  delete metadata[fileName];
  if (store) store.set(OFFLINE_LIBRARY_METADATA_KEY, metadata);
  return { success: true };
});

ipcMain.handle("spice-offline-library-show", async (event, fileName) => {
  requireTrustedSpiceSender(event);
  const directory = await ensureOfflineLibraryDirectory();
  if (typeof fileName === "string" && path.basename(fileName) === fileName) {
    const filePath = path.join(directory, fileName);
    if (!fs.existsSync(filePath)) return { success: false, missing: true };
    shell.showItemInFolder(filePath);
  } else {
    await shell.openPath(directory);
  }
  return { success: true };
});

// Basic UI IPC Handlers - Registered immediately for responsiveness
ipcMain.on("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.minimize();
});

ipcMain.on("window-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on("window-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.close();
});

ipcMain.on("open-devtools", () => {
  if (view) {
    view.webContents.openDevTools({ mode: "detach" });
  } else if (mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
});

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const windowInstance = new BrowserWindow({
    width: 1350,
    height: 800,
    backgroundColor: "#121212", // Match CSS bg
    icon: path.join(__dirname, "icon.png"), // App icon for taskbar/desktop
    frame: false, // Frameless window
    titleBarStyle: "hidden", // Hide default title bar, but keep traffic lights on macOS (we'll implement custom anyway)
    titleBarOverlay: false,
    alwaysOnTop: getAlwaysOnTop(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow = windowInstance;

  // Remove default menu
  windowInstance.setMenuBarVisibility(false);

  // Block default DevTools shortcuts (F12, Ctrl+Shift+I)
  windowInstance.webContents.on("before-input-event", (event, input) => {
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i")
    ) {
      event.preventDefault();
      console.log("Blocked DevTools shortcut");
    }
  });

  // Bridge console messages to terminal for debugging
  windowInstance.webContents.on("console-message", (event, level, message) => {
    if (!message.includes("[Main Poll]")) {
      console.log(`[MainWindow] ${message}`);
    }
  });

  // Initial load via local server
  windowInstance.loadURL(APP_NATIVE_MODE ? "http://localhost:6969/?native=1" : "http://localhost:6969/").then(async () => {
    if (mainWindow !== windowInstance || windowInstance.isDestroyed()) return;
    applyCustomCssToWebContents(windowInstance.webContents);
    sendShellTheme(windowInstance.webContents);
    // mainWindow.webContents.openDevTools({ mode: "detach" }); // Disabled to stop DevTools console from popping up automatically

    if (view && view.webContents.isDestroyed()) {
      view = null;
    }
    if (view && currentService) {
      viewHiddenForModal = false;
      windowInstance.setBrowserView(view);
      updateViewBounds();
      sendActiveServiceState(true);
      sendAudioControlState();
      applyVolumeToActiveView();
      windowInstance.show();
      return;
    }

    // Check for Default Service Startup. Native keeps the shell hidden once
    // onboarding is complete so the login gate never flashes during boot.
    const nativeDirectOpen = shouldOpenNativePlayerOnLaunch({
      nativeMode: APP_NATIVE_MODE,
      onboarded: store ? store.get("nativeOnboarded", false) : false,
      account: getNativeAccountSummary(),
    });
    if (!nativeDirectOpen) {
      windowInstance.show();
    }
    const startupService = APP_NATIVE_MODE
      ? nativeDirectOpen
        ? "spice_crazy"
        : DEFAULT_NATIVE_STARTUP_SERVICE
      : (currentService || (store ? store.get("defaultService", DEFAULT_STARTUP_SERVICE) : DEFAULT_STARTUP_SERVICE));

    if (
      startupService &&
      startupService !== "home" &&
      SERVICES[startupService]
    ) {
      console.log(`Auto-loading Default Service: ${startupService}`);
      await loadService(startupService);
    } else {
      // If 'home' or invalid, stay on home (index.html)
      console.log("Staying on Home Screen");
      sendActiveServiceState(false);
    }
    if (mainWindow === windowInstance && !windowInstance.isDestroyed()) {
      windowInstance.show();
    }
  }).catch((error) => {
    console.error("Failed to load the SPICE desktop shell:", error);
    if (mainWindow === windowInstance && !windowInstance.isDestroyed()) {
      windowInstance.show();
    }
  });

  windowInstance.on("resize", () => {
    if (mainWindow === windowInstance && view) {
      updateViewBounds();
    }
  });

  windowInstance.on("close", async (event) => {
    if (
      !downloadedUpdateInfo ||
      !app.isPackaged ||
      updateInstallInProgress ||
      skipDownloadedUpdateOnClose
    ) {
      if (
        process.platform === "darwin" &&
        mainWindow === windowInstance &&
        view &&
        !view.webContents.isDestroyed()
      ) {
        windowInstance.setBrowserView(null);
      }
      return;
    }

    event.preventDefault();
    if (updateInstallPromptActive) return;

    updateInstallPromptActive = true;
    try {
      const result = await dialog.showMessageBox(windowInstance, {
        type: "info",
        buttons: ["Install update", "Quit without installing", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        title: "SPICE update ready",
        message: "A downloaded SPICE update is ready to install.",
        detail:
          "Install it now to start the new version, or quit without installing if you want to keep this build for now.",
      });

      if (result.response === 0) {
        await installDownloadedUpdate();
      } else if (result.response === 1) {
        skipDownloadedUpdateOnClose = true;
        app.quit();
      }
    } finally {
      updateInstallPromptActive = false;
    }
  });

  // macOS keeps the process and detached service view alive until the user
  // explicitly quits. Companion windows are transient and close with the shell.
  windowInstance.on("closed", () => {
    if (mainWindow === windowInstance) {
      mainWindow = null;
    }
    viewHiddenForModal = false;
    for (const companionWindow of [
      lyricsWindow,
      miniPlayerWindow,
      queueWindow,
      settingsWindow,
      toolbarSettingsWindow,
    ]) {
      if (companionWindow && !companionWindow.isDestroyed()) {
        companionWindow.close();
      }
    }
  });
}

// Mini Player Logic
let miniPlayerWindow = null;
const miniPlayerServer = require("./src/server");

function createMiniPlayerWindow() {
  if (miniPlayerWindow) {
    miniPlayerWindow.focus();
    return;
  }

  miniPlayerWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: "#121212",
    title: "Spice Mini Player",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  miniPlayerWindow.setMenuBarVisibility(false);
  miniPlayerWindow.loadURL("http://localhost:6969/mini-player/"); // Load from local server

  miniPlayerWindow.on("closed", () => {
    miniPlayerWindow = null;
  });
}

// Mini player control handler is registered in the main startup flow.

const TITLE_BAR_HEIGHT = 40;
const VK_PLAYER_HEIGHT = 50;

function updateViewBounds() {
  if (!view || !mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  const vkEnabled =
    currentService === "yt" && (store ? store.get("vkPlayerEnabled", false) : false);
  const topOffset = TITLE_BAR_HEIGHT + (vkEnabled ? VK_PLAYER_HEIGHT : 0);

  const newBounds = {
    x: 0,
    y: Math.round(topOffset),
    width: Math.round(bounds.width),
    height: Math.max(0, Math.round(bounds.height - topOffset)),
  };

  console.log(`[Main] Setting BrowserView bounds:`, newBounds);
  view.setBounds(newBounds);

  // Tell renderer to show/hide the VK player bar
  mainWindow.webContents.send("vk-player-visibility", vkEnabled);
}

function sendActiveServiceState(active) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("service-active", active);
  mainWindow.webContents.send("active-service-changed", active ? currentService : null);
}

function sendAudioControlState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  syncMiniPlayerAudioState();
  mainWindow.webContents.send("volume-changed", currentVolume);
  mainWindow.webContents.send("boost-changed", currentBoostEnabled);
}

function syncMiniPlayerAudioState() {
  try {
    miniPlayerServer.updateState({ volume: currentVolume });
  } catch (error) {
    console.error("Failed to sync mini player audio state:", error.message);
  }
}

function getToolbarButtons() {
  const saved = store ? store.get("toolbarButtons", {}) : {};
  return { ...DEFAULT_TOOLBAR_BUTTONS, ...(saved || {}) };
}

function applyCustomCssToWebContents(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  const css = store ? store.get("customCss", "") : "";
  const script = `
    (() => {
      const existing = document.getElementById('spice-custom-css');
      if (existing) existing.remove();
      const css = ${JSON.stringify(css)};
      if (!css.trim()) return;
      const style = document.createElement('style');
      style.id = 'spice-custom-css';
      style.textContent = css;
      document.head.appendChild(style);
    })();
  `;
  webContents.executeJavaScript(script).catch((err) => {
    console.error("[CustomCSS] Failed to apply CSS:", err);
  });
}

function applyCustomCssEverywhere() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyCustomCssToWebContents(mainWindow.webContents);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    applyCustomCssToWebContents(settingsWindow.webContents);
  }
  if (toolbarSettingsWindow && !toolbarSettingsWindow.isDestroyed()) {
    applyCustomCssToWebContents(toolbarSettingsWindow.webContents);
  }
  if (view && !view.webContents.isDestroyed()) {
    applyCustomCssToWebContents(view.webContents);
  }
}

function sendSpiceRuntimeStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("spice-runtime-status", status);
}

const AD_SKIP_SCRIPT = `
        (function () {
            console.log('[Spice AdBlocker] Script injected');

            setInterval(() => {
                // Skip video ads by clicking skip button
                const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
                if (skipBtn) {
                    skipBtn.click();
                    console.log('[Spice AdBlocker] Clicked skip button');
                }

                // Fast-forward ads that can't be skipped
                const adContainer = document.querySelector('.ad-showing');
                const video = document.querySelector('video');
                if (adContainer && video && video.duration && !isNaN(video.duration)) {
                    video.currentTime = video.duration;
                    console.log('[Spice AdBlocker] Fast-forwarded ad');
                }

                // Close overlay ads
                const closeBtn = document.querySelector('.ytp-ad-overlay-close-button');
                if (closeBtn) {
                    closeBtn.click();
                    console.log('[Spice AdBlocker] Closed overlay ad');
                }

                // Mute ads (backup if they still play)
                const adPlaying = document.querySelector('.ad-interrupting');
                if (adPlaying && video) {
                    video.muted = true;
                }
            }, 300);
        })();
    `;

function injectAdSkipper(targetView) {
  if (!targetView) return;
  targetView.webContents.executeJavaScript(AD_SKIP_SCRIPT).catch((err) => {
    console.error("[AdBlocker] Failed to inject script:", err);
  });
}

function supportsInjectedPlayback(serviceKey) {
  return (
    serviceKey === "yt" ||
    serviceKey === "sc" ||
    serviceKey === "spice_crazy"
  );
}

function resetActiveScrobbleState() {
  if (!scrobbler) return;
  scrobbler.currentTrack = null;
  scrobbler.trackStartTime = null;
  scrobbler.hasScrobbled = false;
}

function clearPlaybackSurfaces(rawData = {}, options = {}) {
  lastTrack = null;
  lastPolledTrackKey = null;
  lastScrobbledTrackKey = null;
  lastPolledTime = 0;
  lastInlineLyricsKey = null;
  if (options.resetScrobbler) {
    resetActiveScrobbleState();
  }
  discordRpc.clearPresence();
  miniPlayerServer.updateState({
    track: null,
    currentTime: 0,
    paused: true,
    volume: currentVolume,
    shuffle: rawData.shuffle || false,
    repeat: rawData.repeat || "off",
    likeStatus: false,
  });
}

function resetTrackedPlayback() {
  stopTrackPolling();
  clearPlaybackSurfaces({
    shuffle: false,
    repeat: "off",
  });
}

// Helper: returns the correct backend view for track detection/polling
function getActiveBackendView() {
  return view;
}

function markSpiceNativePlaybackIntent(reason = "shell") {
  if (currentService !== "spice_crazy" || !view || !view.webContents || view.webContents.isDestroyed()) {
    return;
  }

  view.webContents
    .executeJavaScript(
      `
        if (typeof window.__spiceNativeAllowPlaybackIntent === 'function') {
          window.__spiceNativeAllowPlaybackIntent(${JSON.stringify(reason)});
        }
        true;
      `,
    )
    .catch(() => {});
}

async function cleanupDesktopProcessForQuit() {
  if (appQuitCleanupPromise) return appQuitCleanupPromise;

  appQuitCleanupPromise = (async () => {
    try {
      stopTrackPolling();
      clearPlaybackSurfaces();
    } catch (error) {
      console.warn("Failed to clear desktop playback during quit:", error && error.message);
    }

    const activeView = view;
    view = null;
    if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBrowserView(null);
        activeView.webContents.destroy();
      } catch (_) {}
    }

    if (spiceRuntimeManager) {
      try {
        await spiceRuntimeManager.stop();
      } catch (_) {}
    }

    if (discordRpc) {
      try {
        discordRpc.disconnect();
      } catch (_) {}
    }

    appQuitCleanupCompleted = true;
  })();

  return appQuitCleanupPromise;
}

async function restartDesktopApp() {
  if (appRestartInProgress) return;
  appRestartInProgress = true;
  app.relaunch();
  try {
    await cleanupDesktopProcessForQuit();
  } catch (error) {
    console.error("Failed to clean up SPICE before restart:", error);
  } finally {
    app.exit(0);
  }
}

app.on("before-quit", (event) => {
  if (updateInstallInProgress || appQuitCleanupCompleted) return;

  // Let the existing close prompt run before tearing down playback when a
  // downloaded update still needs an explicit user choice.
  if (
    downloadedUpdateInfo &&
    app.isPackaged &&
    !skipDownloadedUpdateOnClose &&
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    return;
  }

  event.preventDefault();
  cleanupDesktopProcessForQuit()
    .catch((error) => {
      console.error("Failed to clean up SPICE before quit:", error);
    })
    .finally(() => {
      app.quit();
    });
});

async function prepareForUpdateInstall() {
  if (updateInstallCleanupPromise) return updateInstallCleanupPromise;

  updateInstallInProgress = true;
  updateInstallCleanupCompleted = false;
  updateInstallCleanupPromise = (async () => {
    const destroyWindow = (targetWindow) => {
      if (!targetWindow || targetWindow.isDestroyed()) return;
      try {
        targetWindow.destroy();
      } catch (_) {}
    };

    await cleanupDesktopProcessForQuit();

    // Destroy every renderer only after asynchronous runtime cleanup. Closing
    // the last window earlier emits `window-all-closed` and can terminate the
    // process before electron-updater has a chance to launch the installer.
    for (const targetWindow of BrowserWindow.getAllWindows()) {
      destroyWindow(targetWindow);
    }
    mainWindow = null;
    lyricsWindow = null;
    miniPlayerWindow = null;
    queueWindow = null;
    settingsWindow = null;
    toolbarSettingsWindow = null;

    try {
      app.releaseSingleInstanceLock();
    } catch (_) {}

    updateInstallCleanupCompleted = true;
  })();

  return updateInstallCleanupPromise;
}

async function installDownloadedUpdate() {
  if (!app.isPackaged || updateInstallInProgress) return;
  try {
    await prepareForUpdateInstall();
  } catch (error) {
    console.error("Failed to prepare for update install:", error);
  }
  autoUpdater.quitAndInstall(false, true);
}

async function promptForDownloadedUpdate(info) {
  if (!app.isPackaged || updateInstallInProgress || updateInstallPromptActive) return;
  const parentWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;

  updateInstallPromptActive = true;
  try {
    const version = info && info.version ? ` ${info.version}` : "";
    const options = {
      type: "info",
      buttons: ["Restart and install", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "SPICE update ready",
      message: `SPICE update${version} is ready to install.`,
      detail:
        "Restart SPICE now to apply it. If you choose Later, SPICE will ask again when you close the app.",
    };
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    if (result.response === 0) {
      await installDownloadedUpdate();
    }
  } finally {
    updateInstallPromptActive = false;
  }
}

// Send VK track info to the main window's renderer (for the app-frame player bar)
function sendVkTrackUpdate(trackInfo) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("vk-track-update", trackInfo);
  }
}

let lastInlineLyricsKey = null;

function injectInlineLyrics(trackInfo) {
  if (currentService !== "yt" || !trackInfo || !trackInfo.title || !trackInfo.artist) {
    return;
  }

  const targetView = getActiveBackendView();
  if (!targetView) return;

  const trackKey = `${trackInfo.artist} - ${trackInfo.title}`;
  if (trackKey === lastInlineLyricsKey) return;
  lastInlineLyricsKey = trackKey;

  const payload = JSON.stringify({
    title: trackInfo.title,
    artist: trackInfo.artist,
    album: trackInfo.album || "",
    duration: trackInfo.duration || 0,
  });

  targetView.webContents
    .executeJavaScript(`
      (async function() {
        const track = ${payload};
        const panelId = 'spice-inline-lyrics';
        const styleId = 'spice-inline-lyrics-style';

        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = [
            '#' + panelId + ' {',
            '  position: fixed;',
            '  left: 50%;',
            '  bottom: 92px;',
            '  transform: translateX(-50%);',
            '  z-index: 999999;',
            '  max-width: min(760px, 72vw);',
            '  pointer-events: none;',
            '  text-align: center;',
            '  font-family: Inter, Roboto, Arial, sans-serif;',
            '  color: rgba(255,255,255,0.92);',
            '  text-shadow: 0 2px 16px rgba(0,0,0,0.85), 0 0 18px rgba(168,85,247,0.35);',
            '}',
            '#' + panelId + ' .spice-line {',
            '  display: inline-block;',
            '  padding: 10px 18px;',
            '  border-radius: 999px;',
            '  background: rgba(10,10,12,0.62);',
            '  border: 1px solid rgba(168,85,247,0.20);',
            '  backdrop-filter: blur(18px);',
            '  font-size: 20px;',
            '  line-height: 1.25;',
            '  font-weight: 650;',
            '  letter-spacing: -0.02em;',
            '  transition: opacity 180ms ease, transform 180ms ease;',
            '}',
            '#' + panelId + ' .spice-next {',
            '  margin-top: 7px;',
            '  font-size: 13px;',
            '  color: rgba(255,255,255,0.42);',
            '}'
          ].join('');
          document.head.appendChild(style);
        }

        let panel = document.getElementById(panelId);
        if (!panel) {
          panel = document.createElement('div');
          panel.id = panelId;
          const currentLine = document.createElement('div');
          currentLine.className = 'spice-line';
          const nextLine = document.createElement('div');
          nextLine.className = 'spice-next';
          panel.append(currentLine, nextLine);
          document.body.appendChild(panel);
        }

        const lineEl = panel.querySelector('.spice-line');
        const nextEl = panel.querySelector('.spice-next');
        panel.style.display = 'none';
        lineEl.textContent = '';
        nextEl.textContent = '';

        function toSeconds(min, sec, frac) {
          const ms = String(frac || '0').padEnd(3, '0').slice(0, 3);
          return Number(min) * 60 + Number(sec) + Number(ms) / 1000;
        }

        function parseLrc(text) {
          const pattern = /\\[(\\d{1,3}):(\\d{2})(?:[.:](\\d{1,3}))?\\]/g;
          const lines = [];
          String(text || '').split('\\n').forEach(function(raw) {
            pattern.lastIndex = 0;
            const matches = [];
            let match;
            while ((match = pattern.exec(raw)) !== null) {
              matches.push(toSeconds(match[1], match[2], match[3]));
            }
            const lyric = raw.replace(pattern, '').replace(/<\\d{1,3}:\\d{2}(?:[.:]\\d{1,3})?>/g, '').trim();
            if (!lyric) return;
            matches.forEach(function(time) {
              lines.push({ time: time, text: lyric });
            });
          });
          return lines.sort(function(a, b) { return a.time - b.time; });
        }

        async function loadSyncedLyrics() {
          const direct = new URLSearchParams({
            track_name: track.title,
            artist_name: track.artist,
            album_name: track.album || ''
          });

          let response = await fetch('https://lrclib.net/api/get?' + direct.toString());
          if (response.ok) {
            const data = await response.json();
            if (data && data.syncedLyrics) return data.syncedLyrics;
          }

          response = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(track.title + ' ' + track.artist));
          if (!response.ok) return null;
          const results = await response.json();
          const match = Array.isArray(results) ? results.find(function(item) { return item && item.syncedLyrics; }) : null;
          return match ? match.syncedLyrics : null;
        }

        function activeIndex(lines, time) {
          let index = -1;
          for (let i = 0; i < lines.length; i += 1) {
            if (time >= lines[i].time) index = i;
            else break;
          }
          return index;
        }

        try {
          const syncedLyrics = await loadSyncedLyrics();
          const lines = parseLrc(syncedLyrics);
          if (!lines.length) return;
          window.spiceInlineLyrics = { trackKey: track.artist + ' - ' + track.title, lines: lines, active: -1 };
          if (window.spiceInlineLyricsTimer) clearInterval(window.spiceInlineLyricsTimer);

          window.spiceInlineLyricsTimer = setInterval(function() {
            const state = window.spiceInlineLyrics;
            const video = document.querySelector('video');
            if (!state || !video || video.paused) {
              if (panel) panel.style.opacity = video && video.paused ? '0.35' : '0';
              return;
            }

            const index = activeIndex(state.lines, video.currentTime);
            if (index < 0) {
              panel.style.display = 'none';
              return;
            }

            panel.style.display = 'block';
            panel.style.opacity = '1';
            if (index !== state.active) {
              state.active = index;
              lineEl.textContent = state.lines[index].text;
              nextEl.textContent = state.lines[index + 1] ? state.lines[index + 1].text : '';
            }
          }, 250);
        } catch (error) {
          console.debug('[Spice Inline Lyrics] unavailable:', error && error.message);
        }
      })();
    `)
    .catch((err) => {
      console.error("[Inline Lyrics] Failed to inject:", err.message);
    });
}

function seekPlayback(time) {
  const targetView = getActiveBackendView();
  const seekTime = Number(time);
  if (!targetView || !Number.isFinite(seekTime) || seekTime < 0) return;
  const serializedSeekTime = JSON.stringify(seekTime);

  targetView.webContents
    .executeJavaScript(`
      (function() {
        if (typeof window.__spiceSeekPlayback === 'function') {
          return window.__spiceSeekPlayback(${serializedSeekTime});
        }

        const media = document.querySelector('[data-spice-active="true"]')
          || document.querySelector('video, audio');
        if (!media) return false;

        const duration = Number(media.duration);
        media.currentTime = Number.isFinite(duration)
          ? Math.min(${serializedSeekTime}, duration)
          : ${serializedSeekTime};
        return true;
      })();
    `)
    .catch((error) => {
      console.error("[Player] Failed to seek playback:", error);
    });
}

// Handle VK player commands from the app-frame player bar
ipcMain.on("vk-player-command", (event, cmd) => {
  if (!view) return;

  // Handle seek command (object: {action: 'seek', time: seconds})
  if (typeof cmd === "object" && cmd.action === "seek") {
    seekPlayback(cmd.time);
    return;
  }

  const code = {
    playpause: `(function(){
      // YouTube Music buries the actual click handler in an internal #button element
      const findAndClick = (selector) => {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
              const inner = el.querySelector('button') || el;
              inner.click();
              return true;
          }
          return false;
      };

      if (findAndClick('ytmusic-player-bar #play-pause-button')) return;
      if (findAndClick('ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button')) return;
      if (findAndClick('#play-pause-button')) return;

      // Fallback to video element
      const v = document.querySelector('video, audio');
      if (v) {
          v.paused ? v.play() : v.pause();
      }
    })()`,
    next: `(document.querySelector('.next-button') || document.querySelector('[aria-label="Next"]'))?.click()`,
    prev: `(document.querySelector('.previous-button') || document.querySelector('[aria-label="Previous"]'))?.click()`,
    like: `(function(){
      const bar = document.querySelector('ytmusic-player-bar');
      if (!bar) return;
      // Find the like-button-renderer, then get the LIKE button inside it (first button = like, second = dislike)
      const renderer = bar.querySelector('ytmusic-like-button-renderer');
      if (renderer) {
        // The like button is the first tp-yt-paper-icon-button inside the renderer
        const likeBtn = renderer.querySelector('#button-shape-like button') ||
                        renderer.querySelector('tp-yt-paper-icon-button.like') ||
                        renderer.querySelector('tp-yt-paper-icon-button:first-of-type') ||
                        renderer.querySelector('[aria-label="Like"]') ||
                        renderer.querySelector('[aria-label*="ike"]');
        if (likeBtn) { likeBtn.click(); return; }
        // Fallback: click the renderer itself
        renderer.click();
        return;
      }
      // Last resort fallback
      const b = bar.querySelector('[aria-label="Like"]') || bar.querySelector('[aria-label*="ike"]');
      if(b) b.click();
    })()`,
    shuffle: `(function(){
      const bar = document.querySelector('ytmusic-player-bar');
      if (!bar) return;
      const b = bar.querySelector('tp-yt-paper-icon-button.shuffle') ||
                bar.querySelector('.shuffle.ytmusic-player-bar') ||
                bar.querySelector('[aria-label*="Shuffle"]');
      if(b) b.click();
    })()`,
    repeat: `(function(){
      const bar = document.querySelector('ytmusic-player-bar');
      if (!bar) return;
      const b = bar.querySelector('tp-yt-paper-icon-button.repeat') ||
                bar.querySelector('.repeat.ytmusic-player-bar') ||
                bar.querySelector('[aria-label*="Repeat"]');
      if(b) b.click();
    })()`,
    playlist: `(function(){
      return new Promise((resolve) => {
        let menuBtn = document.querySelector('ytmusic-player-bar ytmusic-menu-renderer button[aria-label="Action menu"]') ||
                      document.querySelector('ytmusic-player-bar button[aria-label="Action menu"]') ||
                      document.querySelector('ytmusic-player-bar ytmusic-menu-renderer tp-yt-paper-icon-button') ||
                      document.querySelector('ytmusic-player-bar tp-yt-paper-icon-button.expand-button') ||
                      document.querySelector('ytmusic-player-bar tp-yt-paper-icon-button[aria-label="More player controls"]');

        if (!menuBtn) {
            const art = document.querySelector('ytmusic-player-bar .thumbnail-image-wrapper img, ytmusic-player-bar img');
            if (art) {
                art.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 2
                }));
            } else {
                return resolve({success: false, html: 'No menu button or art found'});
            }
        } else {
            menuBtn.click();
        }

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;

          const popup = document.querySelector('ytmusic-popup-container, tp-yt-iron-dropdown');
          if (!popup && attempts < 15) return;

          const paths = Array.from(document.querySelectorAll('ytmusic-popup-container path, tp-yt-iron-dropdown path'));
          const playlistIconPath = paths.find(p => p.getAttribute('d') === 'M22 13h-4v4h-2v-4h-4v-2h4V7h2v4h4v2zm-8-6H2v1h12V7zM2 12h8v-1H2v1zm0 4h8v-1H2v1z' ||
                                                     (p.getAttribute('d') && p.getAttribute('d').includes('M22 13h-4v4h-2v-4h-4v-2h4V7h2v4h4v2zm-8-6H2v1h12V7zM2 12h8v-1H2v1zm0 4h8v-1H2v1z')));

          let playlistItem = null;

          if (playlistIconPath) {
              playlistItem = playlistIconPath.closest('ytmusic-menu-navigation-item-renderer, ytmusic-menu-service-item-renderer, ytmusic-toggle-menu-service-item-renderer, tp-yt-paper-icon-item, ytmusic-menu-item-renderer');
          }

          if (!playlistItem) {
              const items = Array.from(document.querySelectorAll('ytmusic-popup-container ytmusic-menu-navigation-item-renderer, ytmusic-popup-container ytmusic-menu-service-item-renderer, ytmusic-popup-container ytmusic-toggle-menu-service-item-renderer, ytmusic-popup-container tp-yt-paper-icon-item, tp-yt-iron-dropdown ytmusic-menu-item-renderer, tp-yt-iron-dropdown ytmusic-menu-navigation-item-renderer'));
              playlistItem = items.find(el => {
                  const text = el.textContent.toLowerCase();
                  return text.includes('playlist') || text.includes('save to');
              });
          }

          if (playlistItem) {
            clearInterval(interval);
            setTimeout(() => {
              // YouTube music often expects the inner anchor tag or formatted string to be clicked to trigger the actual navigation/action
              const clickable = playlistItem.querySelector('a') || playlistItem.querySelector('yt-formatted-string') || playlistItem;
              clickable.click();
              resolve({success: true, msg: 'Clicked add to playlist'});
            }, 50);
          } else if (attempts >= 15) {
            clearInterval(interval);
            resolve({success: false, html: popup ? popup.innerHTML : 'no popup html'});
          }
        }, 50);
      });
    })()`,
  };
  if (code[cmd]) {
    if (cmd === "playpause") {
      markSpiceNativePlaybackIntent("app-frame playpause");
    }
    view.webContents
      .executeJavaScript(code[cmd])
      .then((res) => {
        if (cmd === "playlist" && res && res.success === false) {
          try {
            require("fs").writeFileSync(
              "debug_playlist_popup_dump.html",
              res.html,
            );
          } catch (e) {}
        }
      })
      .catch(() => {});
  }
});

ipcMain.on("seek-playback", (event, time) => {
  seekPlayback(time);
});

async function loadService(serviceKey) {
  if (APP_NATIVE_MODE && serviceKey !== "spice_crazy") {
    console.log(`Native mode rejected legacy service: ${serviceKey}`);
    return false;
  }
  if (!SERVICES[serviceKey]) return false;

  // VK layout uses the same YT Music URL, but force-enables VK player
  if (serviceKey === "yt_vk") {
    if (store) store.set("vkPlayerEnabled", true);
    serviceKey = "yt"; // load YT Music normally, injection handles the UI
  }

  // Track current service for Discord RPC
  currentService = serviceKey;

  // Resolve the track detection key
  const trackDetectionKey = serviceKey;
  let serviceUrl;
  try {
    serviceUrl = await resolveServiceUrl(serviceKey);
  } catch (error) {
    console.error(`Failed to resolve ${serviceKey}: `, error);
    if (serviceKey === "spice_crazy") {
      dialog.showErrorBox(
        "SPICE local runtime",
        error instanceof Error ? error.message : "Failed to prepare the SPICE local runtime.",
      );
    }
    sendActiveServiceState(false);
    return false;
  }

  if (!serviceUrl) {
    sendActiveServiceState(false);
    return false;
  }

  // Save state - DISABLE for now to favor explicit Default Setting
  // if (store) store.set('lastService', serviceKey);

  // Create or update BrowserView
  if (!view) {
    console.log("Creating new BrowserView...");
    view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false, // Disabled so preload can receive window messages
        partition: "persist:main", // Use a named partition
        preload: path.join(__dirname, "preload-view.js"),
        backgroundThrottling: serviceKey !== "spice_crazy",
      },
    });
    // view.setBackgroundColor('#121212'); // Prevent transparent black screen
    mainWindow.setBrowserView(view);
    console.log("BrowserView set to mainWindow");
  } else {
    // Ensure view is attached and correct bounds
    mainWindow.setBrowserView(view);
    console.log(
      "Reuse logic invoked (should be unreachable if view is destroyed)",
    );
  }

  updateViewBounds();

  // Notify renderer that a service is active (to show top bar)
  sendActiveServiceState(true);

  // Send VK player config once DOM is interactive
  view.webContents.once("dom-ready", () => {
    const vkPlayerEnabled = store ? store.get("vkPlayerEnabled", false) : false;
    console.log(
      `[Main] DOM Ready. Sending vk-player-config = ${vkPlayerEnabled}`,
    );
    view.webContents.send("vk-player-config", vkPlayerEnabled);
  });

  // Check if already loading this URL to prevent duplicate calls
  const currentUrl = view.webContents.getURL();
  if (currentUrl && currentUrl.startsWith(serviceUrl)) {
    console.log(
      `[Main] Service URL already loaded or loading: ${serviceUrl}`,
    );
    return true;
  }

  console.log(`Loading service URL: ${serviceUrl} `);
  try {
    await view.webContents.loadURL(serviceUrl);
    console.log(`Successfully loaded ${serviceKey} `);
    updateViewBounds(); // Re-apply bounds just in case
    applyCustomCssToWebContents(view.webContents);

    if (supportsInjectedPlayback(trackDetectionKey)) {
      if (trackDetectionKey !== "spice_crazy") {
        // Inject CSS for cosmetic blocking on legacy web services.
        view.webContents.insertCSS(AD_CSS);
        injectAdSkipper(view);
      }

      // Inject Track Detection Script based on service
      injectTrackDetection(trackDetectionKey);

      // Start main process polling (bypasses broken preload IPC)
      startTrackPolling();
    } else {
      resetTrackedPlayback();
    }

    applyVolumeToActiveView();
    return true;
  } catch (error) {
    console.error(`Failed to load ${serviceKey}: `, error);
    sendActiveServiceState(false);
    return false;
  }
}

async function loadSupportedUrl(rawUrl) {
  const target = parseSupportedServiceUrl(rawUrl, { nativeMode: APP_NATIVE_MODE });
  if (!target) {
    console.log("Invalid or unsupported URL rejected:", rawUrl);
    return { success: false, error: "Only supported HTTPS service URLs are allowed." };
  }

  const previousService = currentService;
  const shouldRecreateView =
    !view || view.webContents.isDestroyed() || previousService !== target.serviceKey;

  if (shouldRecreateView && view) {
    console.log("Destroying BrowserView before switching services...");
    mainWindow.setBrowserView(null);
    if (!view.webContents.isDestroyed()) view.webContents.destroy();
    view = null;
  }

  if (previousService && previousService !== target.serviceKey) {
    resetTrackedPlayback();
  }
  currentService = target.serviceKey;

  if (!view) {
    console.log("Creating BrowserView for supported URL...");
    view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        partition: "persist:main",
        preload: path.join(__dirname, "preload-view.js"),
        backgroundThrottling: target.serviceKey !== "spice_crazy",
      },
    });
  }

  if (!viewHiddenForModal) mainWindow.setBrowserView(view);
  updateViewBounds();
  sendActiveServiceState(true);

  const viewSession = view.webContents.session;
  const adBlockerEnabled = store ? store.get("adBlockerEnabled", true) : true;
  if (adBlockerEnabled && adBlocker) {
    adBlocker.enableBlockingInSession(viewSession);
  }

  view.webContents.once("dom-ready", () => {
    const vkPlayerEnabled = store ? store.get("vkPlayerEnabled", false) : false;
    view.webContents.send("vk-player-config", vkPlayerEnabled);
  });

  try {
    console.log(`Loading URL: ${target.url}`);
    await view.webContents.loadURL(target.url);
    updateViewBounds();
    applyCustomCssToWebContents(view.webContents);

    if (supportsInjectedPlayback(target.serviceKey)) {
      if (target.serviceKey !== "spice_crazy") {
        view.webContents.insertCSS(AD_CSS);
        injectAdSkipper(view);
      }
      injectTrackDetection(target.serviceKey);
      startTrackPolling();
    } else {
      resetTrackedPlayback();
    }

    applyVolumeToActiveView();
    return { success: true, serviceKey: target.serviceKey, url: target.url };
  } catch (error) {
    console.error("Failed to load supported URL:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load URL.",
    };
  }
}

function goHome() {
  console.log("goHome() called");
  resetTrackedPlayback();

  if (view) {
    mainWindow.setBrowserView(null);
    view.webContents.destroy();
    view = null;
    console.log("BrowserView destroyed");
  }
  if (store) store.delete("lastService");
  currentService = null;
  sendActiveServiceState(false);
}

async function dispatchSpiceDesktopNavigation(action) {
  if (
    currentService !== "spice_crazy" ||
    !view ||
    view.webContents.isDestroyed()
  ) {
    return false;
  }

  try {
    return Boolean(
      await view.webContents.executeJavaScript(`
        (() => {
          const detail = { action: ${JSON.stringify(action)}, handled: false };
          window.dispatchEvent(new CustomEvent('spice-desktop-navigation', { detail }));
          return detail.handled === true;
        })();
      `),
    );
  } catch (error) {
    console.error("[Navigation] SPICE navigation bridge failed:", error.message);
    return false;
  }
}

async function navigateActiveView(action) {
  if (action === "home") {
    if (APP_NATIVE_MODE && await dispatchSpiceDesktopNavigation("home")) {
      return true;
    }
    goHome();
    return true;
  }

  if (!view || view.webContents.isDestroyed()) return false;

  if (action === "reload") {
    view.webContents.reload();
    return true;
  }

  if (action === "back" && (await dispatchSpiceDesktopNavigation("back"))) {
    return true;
  }

  if (action === "back" || action === "forward") {
    const history = getNavigationHistory(view.webContents);
    if (navigateHistory(history, action)) return true;

    if (action === "back") {
      goHome();
      return true;
    }
  }

  return false;
}

// ============== MAIN PROCESS TRACK POLLING ==============
// This bypasses the broken preload IPC by polling directly from main
let trackPollingInterval = null;
let lastPolledTrackKey = null;
let lastScrobbledTrackKey = null;
let lastPolledTime = 0;

let queuePollingInterval = null;

function startQueuePolling() {
  if (queuePollingInterval) clearInterval(queuePollingInterval);
  queuePollingInterval = setInterval(async () => {
    const activeView = getActiveBackendView();
    if (!activeView || !activeView.webContents) return;

    try {
      const queueData = await activeView.webContents.executeJavaScript(`
        (function() {
          const items = document.querySelectorAll('ytmusic-player-queue-item');
          if (!items.length) return [];
          return Array.from(items).map((item, index) => {
            return {
              title: item.querySelector('.song-title')?.innerText || '',
              artist: item.querySelector('.byline')?.innerText || '',
              duration: item.querySelector('.duration')?.innerText || '',
              thumbnail: item.querySelector('yt-img-shadow img')?.src || '',
              selected: item.hasAttribute('selected'),
              index: index
            };
          });
        })();
      `);
      if (queueData) {
        miniPlayerServer.updateState({ queue: queueData });
        if (queueWindow && !queueWindow.isDestroyed()) {
          queueWindow.webContents.send("queue-update", queueData);
        }
      }
    } catch (e) {
      // Ignore errors when page is still loading
    }
  }, 1000);
}

function startTrackPolling() {
  if (trackPollingInterval) {
    clearInterval(trackPollingInterval);
  }

  startQueuePolling();

  console.log("[Main] Starting track polling...");

  trackPollingInterval = setInterval(async () => {
    const activeView = getActiveBackendView();
    if (!activeView || !activeView.webContents) {
      return;
    }

    try {
      // Query track info directly from the page - simplified to return raw text
      const rawData = await activeView.webContents.executeJavaScript(`
                    (function () {
                        const serviceKey = ${JSON.stringify(currentService)};

                        if (serviceKey === 'spice_crazy') {
                            try {
                                const snapshot = typeof window.__spiceGetPlaybackSnapshot === 'function'
                                    ? window.__spiceGetPlaybackSnapshot()
                                    : null;
                                if (snapshot && typeof snapshot === 'object') {
                                    return {
                                        sourceService: 'spice_crazy',
                                        shellOnly: snapshot.shellOnly === true,
                                        id: snapshot.id || '',
                                        sourceId: snapshot.sourceId || '',
                                        title: snapshot.title || '',
                                        artist: snapshot.artist || '',
                                        album: snapshot.album || '',
                                        albumArt: snapshot.albumArt || '',
                                        duration: Number.isFinite(snapshot.duration) ? snapshot.duration : 0,
                                        paused: snapshot.paused !== false,
                                        currentTime: Number.isFinite(snapshot.currentTime) ? snapshot.currentTime : 0,
                                        listenUrl: snapshot.listenUrl || '',
                                        shuffle: snapshot.shuffle === true,
                                        repeat: snapshot.repeat || 'off',
                                        likeStatus: snapshot.likeStatus === true,
                                        queueIndex: Number.isInteger(snapshot.queueIndex) ? snapshot.queueIndex : -1,
                                        queueLength: Number.isInteger(snapshot.queueLength) ? snapshot.queueLength : 0,
                                        repeatDebug: 'spice-playback-snapshot'
                                    };
                                }
                            } catch (e) {
                                // Fall through to DOM detection for older cloud runtimes.
                            }

                            const mediaElements = Array.from(document.querySelectorAll('audio, video'));
                            const media = mediaElements.find((element) => element.dataset && element.dataset.spiceActive === 'true')
                                || mediaElements.find((element) => !element.paused && (element.currentSrc || element.src))
                                || mediaElements.find((element) => Number.isFinite(element.duration) && element.duration > 0)
                                || mediaElements[0]
                                || null;
                            const mediaSession = navigator.mediaSession && navigator.mediaSession.metadata
                                ? navigator.mediaSession.metadata
                                : null;

                            function cleanLine(value) {
                                return (value || '')
                                    .replace(/\\s+/g, ' ')
                                    .trim();
                            }

                            function isTimeLine(value) {
                                return /^\\d{1,2}:\\d{2}(\\s*\\/\\s*\\d{1,2}:\\d{2})?$/.test(value);
                            }

                            function parseTime(value) {
                                const parts = cleanLine(value).split(':').map((part) => Number.parseInt(part, 10));
                                if (parts.some((part) => Number.isNaN(part))) return 0;
                                if (parts.length === 2) return parts[0] * 60 + parts[1];
                                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                                return 0;
                            }

                            function normalize(value) {
                                return cleanLine(value).toLowerCase();
                            }

                            function decodeSongParam(value) {
                                try {
                                    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
                                    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
                                    return JSON.parse(decodeURIComponent(escape(atob(padded))));
                                } catch (e) {
                                    return null;
                                }
                            }

                            function sourceFromValue(value) {
                                const text = normalize(value);
                                if (text.includes('soundcloud') || text === 'sc') return 'soundcloud';
                                return 'youtube_music';
                            }

                            function encodeSongLink(id, songTitle, songArtist, sourceId) {
                                if (!id || !songTitle) return '';
                                try {
                                    const payload = [
                                        String(id),
                                        cleanLine(songTitle),
                                        cleanLine(songArtist) || 'Unknown Artist',
                                        sourceFromValue(sourceId || id)
                                    ];
                                    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                                    return 'https://music.spice-app.xyz/?song=' + encodeURIComponent(encoded);
                                } catch (e) {
                                    return '';
                                }
                            }

                            function songParamMatches(url, songTitle, songArtist) {
                                try {
                                    const parsed = new URL(url, window.location.href);
                                    const song = parsed.searchParams.get('song');
                                    if (!song) return false;
                                    const payload = decodeSongParam(song);
                                    if (!Array.isArray(payload)) return false;
                                    const payloadTitle = normalize(payload[1]);
                                    const payloadArtist = normalize(payload[2]);
                                    return payloadTitle === normalize(songTitle) &&
                                        (!songArtist || !payloadArtist || payloadArtist === normalize(songArtist));
                                } catch (e) {
                                    return false;
                                }
                            }

                            function getArtistName(candidate) {
                                if (!candidate || typeof candidate !== 'object') return '';
                                if (Array.isArray(candidate.artists) && candidate.artists.length) {
                                    const first = candidate.artists[0];
                                    return cleanLine(typeof first === 'string' ? first : first && first.name);
                                }
                                return cleanLine(
                                    candidate.artist ||
                                    candidate.artistName ||
                                    candidate.author ||
                                    candidate.channel ||
                                    candidate.uploader
                                );
                            }

                            function trackMatches(candidate, songTitle, songArtist) {
                                if (!candidate || typeof candidate !== 'object') return false;
                                const candidateTitle = normalize(
                                    candidate.title ||
                                    candidate.name ||
                                    candidate.track ||
                                    candidate.trackName
                                );
                                const candidateArtist = normalize(getArtistName(candidate));
                                if (!candidateTitle || candidateTitle !== normalize(songTitle)) return false;
                                return !songArtist || !candidateArtist || candidateArtist === normalize(songArtist);
                            }

                            function linkFromCandidate(candidate, songTitle, songArtist) {
                                if (!candidate || typeof candidate !== 'object') return '';
                                const id = candidate.id ||
                                    candidate.trackId ||
                                    candidate.videoId ||
                                    candidate.songId ||
                                    candidate.soundcloudId ||
                                    candidate.youtubeId;
                                const sourceId = candidate.sourceId ||
                                    candidate.source ||
                                    candidate.provider ||
                                    candidate.platform;
                                return encodeSongLink(
                                    id,
                                    candidate.title || candidate.name || songTitle,
                                    getArtistName(candidate) || songArtist,
                                    sourceId
                                );
                            }

                            function findTrackInValue(value, songTitle, songArtist) {
                                if (!value || typeof value !== 'object') return null;
                                const seen = new WeakSet();
                                let checked = 0;

                                function walk(node, depth) {
                                    if (!node || typeof node !== 'object' || depth > 8 || checked > 6000) return null;
                                    if (seen.has(node)) return null;
                                    seen.add(node);
                                    checked += 1;

                                    if (trackMatches(node, songTitle, songArtist)) return node;

                                    const values = Array.isArray(node) ? node : Object.values(node);
                                    for (const child of values) {
                                        const match = walk(child, depth + 1);
                                        if (match) return match;
                                    }
                                    return null;
                                }

                                return walk(value, 0);
                            }

                            function findStoredTrackLink(songTitle, songArtist) {
                                const stores = [window.localStorage, window.sessionStorage].filter(Boolean);
                                for (const storage of stores) {
                                    for (let i = 0; i < storage.length; i += 1) {
                                        const key = storage.key(i);
                                        const value = storage.getItem(key) || '';
                                        if (!value.includes(songTitle)) continue;
                                        try {
                                            const parsed = JSON.parse(value);
                                            const candidate = findTrackInValue(parsed, songTitle, songArtist);
                                            const link = linkFromCandidate(candidate, songTitle, songArtist);
                                            if (link) return link;
                                        } catch (e) {}
                                    }
                                }
                                return '';
                            }

                            function findResourceTrackLink(songTitle, songArtist) {
                                const resources = performance.getEntriesByType('resource')
                                    .map((entry) => entry.name)
                                    .reverse();
                                for (const resource of resources) {
                                    const match = resource.match(/\\/api\\/(yt|sc)\\/track\\/([^?&#]+)/);
                                    if (!match) continue;
                                    const sourceId = match[1] === 'sc' ? 'soundcloud' : 'youtube_music';
                                    const id = decodeURIComponent(match[2]);
                                    return encodeSongLink(id, songTitle, songArtist, sourceId);
                                }
                                return '';
                            }

                            function findSongAnchorLink(songTitle, songArtist, playerEl) {
                                const currentUrl = window.location.href;
                                if (currentUrl.startsWith('https://music.spice-app.xyz/') && songParamMatches(currentUrl, songTitle, songArtist)) {
                                    return currentUrl;
                                }

                                const anchors = [
                                    ...(playerEl ? Array.from(playerEl.querySelectorAll('a[href*="song="]')) : []),
                                    ...Array.from(document.querySelectorAll('a[href*="song="]'))
                                ];

                                for (const anchor of anchors) {
                                    const href = anchor.href || '';
                                    if (songParamMatches(href, songTitle, songArtist)) return href;
                                }

                                return '';
                            }

                            function buildListenUrl(songTitle, songArtist, playerEl) {
                                return findSongAnchorLink(songTitle, songArtist, playerEl) ||
                                    findStoredTrackLink(songTitle, songArtist) ||
                                    findResourceTrackLink(songTitle, songArtist);
                            }

                            function isUiLine(value) {
                                const text = cleanLine(value).toLowerCase();
                                if (!text) return true;
                                if (isTimeLine(text)) return true;
                                return [
                                    'this device',
                                    'sign in to choose devices',
                                    'choose devices',
                                    'spice music',
                                    'spice listener',
                                    'local profile',
                                    'sidebar',
                                    'playlists',
                                    'no playlists yet',
                                    'welcome back',
                                    'discover, stream, and sync your favorite music across all your devices.',
                                    'home',
                                    'search',
                                    'library',
                                    'profile',
                                    'settings',
                                    'hybrid'
                                ].includes(text);
                            }

                            function firstText(selector) {
                                const element = document.querySelector(selector);
                                return cleanLine(element && element.textContent);
                            }

                            function isShellTrackCandidate(songTitle, songArtist) {
                                const titleText = normalize(songTitle);
                                const artistText = normalize(songArtist);
                                const hardShellTitles = [
                                    'select a track to play',
                                    'spice player'
                                ];
                                const uiTitles = [
                                    'spice',
                                    'spice music',
                                    'search',
                                    'library',
                                    'profile',
                                    'settings',
                                    'home',
                                    'local profile',
                                    'spice listener'
                                ];
                                const shellArtists = [
                                    '',
                                    'spice player',
                                    'spice',
                                    'spice music',
                                    'spice listener',
                                    'local profile',
                                    'sidebar',
                                    'library',
                                    'search',
                                    'profile',
                                    'settings',
                                    'home',
                                    'hybrid'
                                ];
                                if (!titleText || hardShellTitles.includes(titleText)) return true;
                                return uiTitles.includes(titleText) && shellArtists.includes(artistText);
                            }

                            function bottomDistance(el) {
                                const rect = el.getBoundingClientRect();
                                return Math.abs(window.innerHeight - rect.bottom);
                            }

                            const candidates = Array.from(document.querySelectorAll('footer, [class*="player" i], [id*="player" i], [class*="now" i], [class*="bottom" i]'))
                                .filter((el) => {
                                    const rect = el.getBoundingClientRect();
                                    if (rect.width < 180 || rect.height < 32) return false;
                                    const style = getComputedStyle(el);
                                    const nearBottom = rect.bottom > window.innerHeight - 180 || style.position === 'fixed' || style.position === 'sticky';
                                    return nearBottom && cleanLine(el.innerText).length > 0;
                                })
                                .sort((a, b) => {
                                    const aImg = a.querySelectorAll('img').length;
                                    const bImg = b.querySelectorAll('img').length;
                                    const aScore = aImg * 50 - bottomDistance(a);
                                    const bScore = bImg * 50 - bottomDistance(b);
                                    return bScore - aScore;
                                });

                            const player = candidates[0] || null;
                            const rawText = player ? player.innerText : '';
                            const timeMatch = rawText.match(/(\\d{1,2}:\\d{2})(?:\\s*\\/\\s*|\\s+)(\\d{1,2}:\\d{2})/);
                            const uiCurrentTime = timeMatch ? parseTime(timeMatch[1]) : 0;
                            const uiDuration = timeMatch ? parseTime(timeMatch[2]) : 0;
                            const lines = rawText
                                .split('\\n')
                                .map(cleanLine)
                                .filter((line) => line && !isUiLine(line));

                            const metadataTitle = cleanLine(mediaSession && mediaSession.title);
                            const metadataArtist = cleanLine(mediaSession && mediaSession.artist);
                            const metadataAlbum = cleanLine(mediaSession && mediaSession.album);
                            const metadataArt = mediaSession && mediaSession.artwork && mediaSession.artwork.length
                                ? mediaSession.artwork[mediaSession.artwork.length - 1].src
                                : '';

                            const explicitTitle = firstText('.now-playing__title, .mini-player__title, [data-now-playing-title]');
                            const explicitArtist = firstText('.now-playing__artist, .mini-player__artist, [data-now-playing-artist]');

                            let title = metadataTitle || explicitTitle || lines[0] || '';
                            let artist = metadataArtist || explicitArtist || lines.find((line) => line !== title) || '';
                            let album = metadataAlbum || '';
                            const hasPlayableMedia = Boolean(media && (
                                media.currentSrc ||
                                media.src ||
                                (Number.isFinite(media.duration) && media.duration > 0)
                            ));
                            const hasTrustedMediaSession = Boolean(
                                metadataTitle &&
                                !isShellTrackCandidate(metadataTitle, metadataArtist)
                            );

                            const img = player
                                ? player.querySelector('img[src]')
                                : document.querySelector('img[src]');
                            const albumArt = metadataArt || (img ? img.src : '');

                            if (!artist && title.includes(' - ')) {
                                const parts = title.split(' - ');
                                artist = cleanLine(parts[0]);
                                title = cleanLine(parts.slice(1).join(' - '));
                            }

                            if (isShellTrackCandidate(title, artist) || (!hasPlayableMedia && !hasTrustedMediaSession)) {
                                return {
                                    sourceService: 'spice_crazy',
                                    shellOnly: true,
                                    title: '',
                                    artist: '',
                                    album: '',
                                    albumArt: '',
                                    duration: media && Number.isFinite(media.duration) && media.duration > 0 ? media.duration : uiDuration,
                                    paused: true,
                                    currentTime: media && Number.isFinite(media.currentTime) ? media.currentTime : uiCurrentTime,
                                    listenUrl: '',
                                    shuffle: false,
                                    repeat: 'off',
                                    likeStatus: false,
                                    repeatDebug: ''
                                };
                            }

                            const listenUrl = buildListenUrl(title, artist, player);

                            return {
                                sourceService: 'spice_crazy',
                                rawText: rawText,
                                title: title,
                                artist: artist,
                                album: album,
                                albumArt: albumArt,
                                duration: media && Number.isFinite(media.duration) && media.duration > 0 ? media.duration : uiDuration,
                                paused: media ? media.paused : true,
                                currentTime: media && Number.isFinite(media.currentTime) ? media.currentTime : uiCurrentTime,
                                listenUrl: listenUrl,
                                shuffle: false,
                                repeat: 'off',
                                likeStatus: false,
                                repeatDebug: ''
                            };
                        }

                        const playerBar = document.querySelector('ytmusic-player-bar');
                        const video = document.querySelector('video');
                        const albumArtEl = document.querySelector('ytmusic-player-bar .image img, .thumbnail-image-wrapper img');

                        // Get shuffle/repeat state from the DOM
                        let shuffle = false;
                        let repeat = 'off';
                        let likeStatus = false;

                        // Like/Heart button logic
                        const likeBtn = playerBar ? (playerBar.querySelector('ytmusic-like-button-renderer [icon="yt-icons:like"]') ||
                                        playerBar.querySelector('ytmusic-like-button-renderer.like') ||
                                        playerBar.querySelector('[aria-label="Like"]')) : null;
                        if (likeBtn) {
                            // YT Music uses aria-pressed on a parent tp-yt-paper-icon-button
                            const parentBtn = likeBtn.closest('tp-yt-paper-icon-button') || likeBtn;
                            likeStatus = parentBtn.getAttribute('aria-pressed') === 'true';
                        }

                        // Shuffle button logic
                        const shuffleBtn = playerBar ? (playerBar.querySelector('tp-yt-paper-icon-button.shuffle') || playerBar.querySelector('.shuffle.ytmusic-player-bar')) : null;
                        if (shuffleBtn) {
                            let isPressed = shuffleBtn.getAttribute('aria-pressed') === 'true';
                            const innerBtn = shuffleBtn.querySelector('button');
                            if (!isPressed && innerBtn) {
                                isPressed = innerBtn.getAttribute('aria-pressed') === 'true';
                            }
                            const title = (shuffleBtn.getAttribute('title') || '').toLowerCase();
                            const ariaLabel = (shuffleBtn.getAttribute('aria-label') || '').toLowerCase();

                            // Check literal tooltips / explicit active states
                            if (title.includes('shuffle on') || ariaLabel.includes('shuffle on') || shuffleBtn.hasAttribute('active') || shuffleBtn.classList.contains('active')) {
                                shuffle = true;
                            } else if (title.includes('shuffle off') || ariaLabel.includes('shuffle off')) {
                                shuffle = false;
                            } else {
                                shuffle = isPressed; // Fallback
                            }
                        }

                        // Repeat button logic
                        const repeatBtn = playerBar ? (playerBar.querySelector('tp-yt-paper-icon-button.repeat') || playerBar.querySelector('.repeat.ytmusic-player-bar')) : null;
                        let repeatDebug = '';
                        if (repeatBtn) {
                            let isPressed = repeatBtn.getAttribute('aria-pressed') === 'true';
                            const innerBtn = repeatBtn.querySelector('button');
                            if (!isPressed && innerBtn) {
                                isPressed = innerBtn.getAttribute('aria-pressed') === 'true';
                            }

                            const title = (repeatBtn.getAttribute('title') || '').toLowerCase();
                            const ariaLabel = (repeatBtn.getAttribute('aria-label') || '').toLowerCase();

                            // Check literal tooltips: YTM uses literal state strings for ARIA now
                            if (title.includes('repeat one') || ariaLabel.includes('repeat one') || title.includes('unul') || ariaLabel.includes('unul')) {
                                repeat = 'one';
                            } else if (title.includes('repeat off') || ariaLabel.includes('repeat off') || title.includes('dezactivează') || ariaLabel.includes('dezactivează')) {
                                repeat = 'off';
                            } else if (title.includes('repeat all') || ariaLabel.includes('repeat all') || title.includes('toate') || ariaLabel.includes('toate') || isPressed || repeatBtn.hasAttribute('active') || repeatBtn.classList.contains('active')) {
                                repeat = 'all';
                            } else {
                                repeat = 'off';
                            }

                            repeatDebug = repeatBtn.outerHTML;
                        }

                        if (!playerBar || !video) return { videoOnly: true, paused: video ? video.paused : true, shuffle: shuffle, repeat: repeat, repeatDebug };

                        // Get all the text from player bar
                        const rawText = playerBar.innerText;

                        // Try to get title directly
                        let titleEl = document.querySelector('ytmusic-player-bar .title');
                        let title = titleEl ? titleEl.textContent.trim() : '';

                        return {
                            rawText: rawText,
                            title: title,
                            albumArt: albumArtEl ? albumArtEl.src : '',
                            duration: video.duration || 0,
                            paused: video.paused,
                            currentTime: video.currentTime,
                            shuffle: shuffle,
                            repeat: repeat,
                            likeStatus: likeStatus,
                            shuffleDebug: '',
                            repeatDebug: repeatDebug
                        };
                    })();
                `);

      // Parse the raw data in main process
      let track = null;
      if (rawData && rawData.sourceService === "spice_crazy" && rawData.title) {
        track = {
          id: rawData.id || "",
          sourceId: rawData.sourceId || "",
          track: rawData.title,
          title: rawData.title,
          artist: rawData.artist || "Unknown Artist",
          album: rawData.album || "",
          duration: rawData.duration || 0,
          albumArt: rawData.albumArt || "",
          artwork: rawData.albumArt || "",
          listenUrl: rawData.listenUrl || "",
          url: rawData.listenUrl || "",
          paused: rawData.paused,
          currentTime: rawData.currentTime,
          shuffle: rawData.shuffle || false,
          repeat: rawData.repeat || "off",
          likeStatus: rawData.likeStatus || false,
          repeatDebug: rawData.repeatDebug || "",
        };
      } else if (rawData && rawData.sourceService === "spice_crazy") {
        track = null;
      } else if (rawData && rawData.rawText) {
        const lines = rawData.rawText.split("\n");
        let title = rawData.title || (lines.length > 1 ? lines[1].trim() : "");
        let artist = "";

        // Debug: log raw lines
        console.log(
          "[Main Poll] Raw lines:",
          lines.slice(0, 3).map((l) => l.substring(0, 50)),
        );
        console.log(
          "[Main Poll] Shuffle state:",
          rawData.shuffle,
          "Debug:",
          rawData.shuffleDebug,
        );
        console.log(
          "[Main Poll] Repeat state:",
          rawData.repeat,
          "Debug:",
          rawData.repeatDebug,
        );

        // Third line has "Artist • Album • Year" (line 0 = time, line 1 = title, line 2 = artist)
        if (lines.length >= 3) {
          artist = lines[2].trim();
          // Split on bullet character (• or similar)
          const bulletIndex = artist.indexOf("•");
          if (bulletIndex > 0) {
            artist = artist.substring(0, bulletIndex).trim();
          }
          // Remove duplicate artist names (e.g., "Clams CasinoClams Casino" -> "Clams Casino")
          if (artist.length > 4) {
            const halfLen = Math.floor(artist.length / 2);
            const firstHalf = artist.substring(0, halfLen);
            const secondHalf = artist.substring(halfLen);
            if (firstHalf === secondHalf) {
              artist = firstHalf;
            }
          }
        }

        if (title && artist) {
          track = {
            track: title,
            title: title,
            artist: artist,
            album: "",
            duration: rawData.duration || 0,
            albumArt: rawData.albumArt || "",
            paused: rawData.paused,
            currentTime: rawData.currentTime,
            shuffle: rawData.shuffle || false,
            repeat: rawData.repeat || "off",
            likeStatus: rawData.likeStatus || false,
            repeatDebug: rawData.repeatDebug || "",
          };
        }
      }

      console.log(
        "[Main Poll] Result:",
        track ? `${track.title} by ${track.artist}` : "null",
        "repeat=" + (track ? track.repeat : ""),
        track && track.repeatDebug ? `[DEBUG REPEAT] ${track.repeatDebug}` : "",
      );

      if (track && track.repeatDebug) {
        try {
          require("fs").appendFileSync(
            "spice_debug.log",
            `[DEBUG REPEAT] repeat=${track.repeat} ` + track.repeatDebug + "\n",
          );
        } catch (e) {}
      }

      if (track && track.title && track.artist) {
        const trackKey = track.artist + " - " + track.title;
        const currentTime = track.currentTime || 0;

        // Always update lastTrack for progress tracking
        lastTrack = track;

        // Send to VK player bar in app frame
        sendVkTrackUpdate(track);

        // Detect repeat: same track but time jumped back significantly
        let isRepeat = false;
        if (
          trackKey === lastPolledTrackKey &&
          lastPolledTime > 10 &&
          currentTime < 5
        ) {
          isRepeat = true;
          track.isRepeat = true;
          console.log(
            "[Main Poll] REPEAT DETECTED! Time jumped from",
            lastPolledTime.toFixed(1),
            "to",
            currentTime.toFixed(1),
          );
        }

        // Update lastPolledTime
        lastPolledTime = currentTime;

        const trackChangedOrRepeated = trackKey !== lastPolledTrackKey || isRepeat;

        // Update components on track change OR repeat
        if (trackChangedOrRepeated) {
          lastPolledTrackKey = trackKey;
          console.log(
            "[Main] TRACK POLLED:",
            track.title,
            "by",
            track.artist,
            isRepeat ? "(REPEAT)" : "",
          );
          applyVolumeToActiveView();

          // Enhance album art
          if (track.albumArt && track.albumArt.includes("ggpht.com")) {
            track.albumArt = track.albumArt.replace(/w\d+-h\d+/, "w1200-h1200");
            track.artwork = track.albumArt;
            lastTrack.artwork = track.albumArt;
          }

          // Update Lyrics Window
          console.log("[Main Poll] Updating Lyrics Window...");
          if (lyricsWindow) {
            lyricsWindow.webContents.send("lyrics-track-update", track);
          }

          injectInlineLyrics(track);
        }

        if (scrobbler && !track.paused && (trackChangedOrRepeated || trackKey !== lastScrobbledTrackKey)) {
          console.log("[Main Poll] Updating scrobbler...");
          scrobbler.updateNowPlaying(track);
          lastScrobbledTrackKey = trackKey;
        }

        // ALWAYS update Mini Player and Discord (for progress/time sync)
        // Update Mini Player
        miniPlayerServer.updateState({
          track: {
            title: track.title,
            artist: track.artist,
            art: track.albumArt || track.artwork,
            duration: track.duration,
          },
          paused: track.paused,
          currentTime: track.currentTime,
          volume: currentVolume,
          shuffle: rawData.shuffle || false,
          repeat: rawData.repeat || "off",
          likeStatus: rawData.likeStatus || false,
        });

        // Update Discord RPC with current progress
        const discordEnabled = store
          ? store.get("discordRpcEnabled", true)
          : true;
        if (discordEnabled) {
          discordRpc.updatePresence({
            ...track,
            service: currentService,
            currentTime: track.currentTime,
            duration: track.duration,
          });
        }

        // Update Lyrics progress for synced lyrics
        if (lyricsWindow) {
          lyricsWindow.webContents.send("lyrics-progress-update", {
            currentTime: track.currentTime,
            duration: track.duration,
            paused: track.paused,
          });
        }

        // Update scrobbler progress for threshold-based scrobbling
        if (scrobbler && !track.paused) {
          scrobbler.updateProgress(track.currentTime, track.duration);
        }
      }

      // ALWAYS send basic playback state to mini player, even when track is null
      // This ensures play/pause, shuffle, repeat, and volume stay in sync
      if (!track && rawData) {
        if (rawData.shellOnly || rawData.sourceService === "spice_crazy") {
          clearPlaybackSurfaces(rawData, { resetScrobbler: true });
        } else {
          miniPlayerServer.updateState({
            paused: rawData.paused,
            volume: currentVolume,
            shuffle: rawData.shuffle || false,
            repeat: rawData.repeat || "off",
          });
        }
      }
    } catch (e) {
      console.log("[Main Poll] Error:", e.message);
    }
  }, 350); // Poll every 350ms for smooth VK player progress
}

function stopTrackPolling() {
  if (trackPollingInterval) {
    clearInterval(trackPollingInterval);
    trackPollingInterval = null;
  }
  if (queuePollingInterval) {
    clearInterval(queuePollingInterval);
    queuePollingInterval = null;
  }
  lastPolledTrackKey = null;
  lastScrobbledTrackKey = null;
}
// ============== END TRACK POLLING ==============

// Track Detection Script Injection
function injectTrackDetection(serviceKey) {
  console.log(`[Main] injectTrackDetection called for: ${serviceKey} `);
  const targetView = getActiveBackendView();
  if (!targetView) {
    console.log("[Main] injectTrackDetection ABORTED: No view");
    return;
  }

  let script = "";

  if (serviceKey === "yt") {
    // YouTube Music track detection
    script = `
    (function () {
      console.log('[Spice Scrobbler] YouTube Music track detection injected');
      console.log('[Spice Scrobbler] Checking for spiceReportTrack:', typeof window.spiceReportTrack);

      let lastTrackKey = null;
      let lastTime = 0;

      function getTrackInfo() {
        // Title selectors - try multiple options
        let titleEl = document.querySelector('ytmusic-player-bar .title.ytmusic-player-bar');
        if (!titleEl) titleEl = document.querySelector('.content-info-wrapper .title');
        if (!titleEl) titleEl = document.querySelector('ytmusic-player-bar .title');
        if (!titleEl) titleEl = document.querySelector('.ytmusic-player-bar-title');

        // Artist selectors - YT Music changed their DOM structure
        let artistEl = null;
        // Try byline link first (traditional approach)
        artistEl = document.querySelector('ytmusic-player-bar .byline a');
        if (!artistEl) artistEl = document.querySelector('.content-info-wrapper .byline a');
        // Try complex title (newer structure has yt-formatted-string)
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline yt-formatted-string a');
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline .yt-formatted-string a');
        // Fallback: Get entire byline text (may include extra info but better than nothing)
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline yt-formatted-string');
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline .yt-formatted-string');
        // Ultimate fallback: Any span/text in subtitle or byline
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .subtitle span');
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline span');
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .byline');
        if (!artistEl) artistEl = document.querySelector('ytmusic-player-bar .subtitle');

        // Debug what we found
        if (!artistEl) {
          const playerBar = document.querySelector('ytmusic-player-bar');
          if (playerBar && (!window._lastDump || Date.now() - window._lastDump > 5000)) {
            window._lastDump = Date.now();
            const rawText = playerBar.innerText;
            console.log('[Spice Scrobbler] Player Bar Text:', rawText.substring(0, 200));
            // Split on actual newline character
            const lines = rawText.split(String.fromCharCode(10));
            console.log('[Spice Scrobbler] Lines count:', lines.length);
            if (lines.length >= 2) {
              let artistLine = lines[1]; // Second line usually has artist
              if (artistLine && artistLine.includes(' \\u2022 ')) {
                artistLine = artistLine.split(' \\u2022 ')[0];
              }
              if (artistLine && artistLine.trim()) {
                console.log('[Spice Scrobbler] Extracted artist:', artistLine.trim());
                artistEl = { textContent: artistLine.trim() };
              }
            }
          }
        }

        const albumEl = document.querySelector('ytmusic-player-bar .subtitle .yt-formatted-string[href*="browse"]');
        const video = document.querySelector('video');

        if (!titleEl || !artistEl) {
          // Only log once every 10 seconds to reduce spam
          if (!window._lastSelectorLog || Date.now() - window._lastSelectorLog > 10000) {
            console.log('[Spice Scrobbler] Waiting for player... Title:', !!titleEl, 'Artist:', !!artistEl);
            window._lastSelectorLog = Date.now();
          }
          return null;
        }

        // Get album art
        const albumArtEl = document.querySelector('ytmusic-player-bar .image img, .thumbnail-image-wrapper img, img.ytmusic-player-bar');
        let albumArt = albumArtEl?.src || '';
        if (albumArt) {
          albumArt = albumArt.replace(/w\\d+-h\\d+/, 'w1200-h1200').replace(/=w\\d+-h\\d+/, '=w1200-h1200').replace(/s\\d+-/, 's1200-');
        }

        const title = titleEl.textContent?.trim();
        let artist = artistEl.textContent?.trim();

        // Clean artist if it contains extra info (like " • Album Name • 2024")
        if (artist && artist.includes(' • ')) {
          artist = artist.split(' • ')[0].trim();
        }

        const album = albumEl?.textContent?.trim() || '';
        const duration = video?.duration || 0;

        if (!title || !artist) return null;

        console.log('[Spice Scrobbler] Track detected: ' + title + ' by ' + artist);
        return { track: title, artist, album, duration, albumArt };
      }

      function checkForTrackChange() {
        const video = document.querySelector('video');
        if (!video) return;
        // Note: We check even if paused to detect track changes while paused? Usually not needed but good for seeking.

        const track = getTrackInfo();
        if (!track) return;

        const trackKey = track.artist + ' - ' + track.track;
        const currentTime = video.currentTime;
        const duration = video.duration || 180;

        if (lastTrackKey === trackKey) {
          // If time jumped back by more than 5 seconds, consider it a seek-to-start or loop
          // This handles both automatic loops and manual restarts
          if (currentTime < lastTime && (lastTime - currentTime) > 5) {
            console.log('[Spice Scrobbler] Repeat detected! (Time jump: ' + lastTime.toFixed(1) + ' -> ' + currentTime.toFixed(1) + ')');
            track.isRepeat = true;
            window.spiceReportTrack(track); // Report as repeat
            lastTime = currentTime;
            return;
          }
        }

        if (lastTrackKey !== trackKey) {
          lastTrackKey = trackKey;
          console.log('[Spice Scrobbler] Now Playing:', trackKey);
          console.log('[Spice Scrobbler] spiceReportTrack available:', typeof window.spiceReportTrack);

          // Send to main process
          if (typeof window.spiceReportTrack === 'function') {
            console.log('[Spice Scrobbler] Calling spiceReportTrack...');
            window.spiceReportTrack(track);
            console.log('[Spice Scrobbler] spiceReportTrack called successfully');
          } else {
            console.log('[Spice Scrobbler] ERROR: spiceReportTrack is NOT a function!');
          }
        }

        lastTime = currentTime;
      }

      // Check every 1 second
      setInterval(checkForTrackChange, 1000);

      function getControlsState() {
        return { shuffle: false, repeat: 'off' };
      }

      // Report progress/pause state every 500ms
      setInterval(() => {
        const video = document.querySelector('video');
        if (video) {
          const controls = getControlsState();
          const progress = {
            currentTime: video.currentTime,
            duration: video.duration || 0,
            paused: video.paused,
            shuffle: controls.shuffle,
            repeat: controls.repeat
          };
          if (typeof window.spiceReportProgress === 'function') {
            window.spiceReportProgress(progress);
          }
        }
      }, 500);

      // Also check on video play events to catch immediate changes
      document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') {
          setTimeout(checkForTrackChange, 200);
        }
      }, true);
    })();
  `;
  } else if (serviceKey === "sc") {
    // SoundCloud track detection
    script = `
    (function () {
      console.log('[Spice Scrobbler] SoundCloud track detection injected');

      let lastTrackKey = null;
      let lastTime = 0;

      function parseTime(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length === 2) {
          return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        } else if (parts.length === 3) {
          return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
        return 0;
      }

      function getTrackInfo() {
        const titleEl = document.querySelector('.playbackSoundBadge__titleLink span:last-child');
        const artistEl = document.querySelector('.playbackSoundBadge__lightLink');

        if (!titleEl || !artistEl) return null;

        const title = titleEl.textContent?.trim();
        const artist = artistEl.textContent?.trim();

        if (!title || !artist) return null;

        // Get album art
        const albumArtEl = document.querySelector('.playbackSoundBadge__avatar .image span');
        let albumArt = '';
        if (albumArtEl) {
          const bgImage = getComputedStyle(albumArtEl).backgroundImage;
          const match = bgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (match) {
            albumArt = match[1].replace(/-t\d+x\d+/, '-t500x500');
          }
        }

        // Parse duration from UI
        const progressEl = document.querySelector('.playbackTimeline__duration span[aria-hidden="true"]');
        const duration = progressEl ? parseTime(progressEl.textContent) : 0;

        return { track: title, artist, album: '', duration, albumArt };
      }

      function getPlaybackState() {
        // Try to find audio element first
        const audio = document.querySelector('media') || document.querySelector('audio');
        if (audio) {
          return {
            currentTime: audio.currentTime,
            duration: audio.duration,
            paused: audio.paused
          };
        }

        // Fallback to UI scraping
        const timePassedEl = document.querySelector('.playbackTimeline__timePassed span[aria-hidden="true"]');
        const currentTime = timePassedEl ? parseTime(timePassedEl.textContent) : 0;

        const playBtn = document.querySelector('.playControl');
        const paused = !playBtn || !playBtn.classList.contains('playing');

        return { currentTime, paused };
      }

      function checkForTrackChange() {
        const state = getPlaybackState();
        // If UI based, only proceed if not paused? No, we want to update state even if paused but only if track exists.

        const track = getTrackInfo();
        if (!track) return;

        const trackKey = track.artist + ' - ' + track.track;
        const currentTime = state.currentTime;
        const duration = track.duration || 180;

        // Repeat Detection
        if (lastTrackKey === trackKey) {
          // Relaxed logic: Any significant backward jump
          if (currentTime < lastTime && (lastTime - currentTime) > 5) {
            console.log(\`[Spice Scrobbler] Repeat detected(SC)! (Time jump: \${lastTime.toFixed(1)} -> \${currentTime.toFixed(1)})\`);
                            track.isRepeat = true;
                            window.spiceReportTrack(track);
                            lastTime = currentTime;
                            lastTime = currentTime;
                            return;
                    }
                } else if (lastTrackKey !== trackKey) {
                    lastTrackKey = trackKey;
                    console.log('[Spice Scrobbler] Now Playing:', trackKey);

                    if (typeof window.spiceReportTrack === 'function') {
                        window.spiceReportTrack(track);
                    }
                }
                lastTime = currentTime;
            }

            // Check every 1 second
            setInterval(checkForTrackChange, 1000);

            // Report progress
            setInterval(() => {
                const state = getPlaybackState();
                const track = getTrackInfo(); // Need duration if audio el missing

                const progress = {
                        currentTime: state.currentTime,
                        duration: state.duration || track?.duration || 0,
                        paused: state.paused
                };

                if (typeof window.spiceReportProgress === 'function') {
                    window.spiceReportProgress(progress);
                }
            }, 500);
        })();
    `;
  }

  if (script) {
    const targetView = getActiveBackendView();
    if (targetView) {
      targetView.webContents.executeJavaScript(script).catch((err) => {
        console.error("[Scrobbler] Failed to inject track detection:", err);
      });
    }
  }
}

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  spiceRuntimeManager = new SpiceLocalRuntimeManager({
    app,
    fetch: getFetchImplementation(),
    localUrl: SPICE_LOCAL_RUNTIME_URL,
    manifestUrl: SPICE_LOCAL_MANIFEST_URL,
    bundledRuntimeDir: bundledNativeRuntimeDir(),
    platform: process.platform,
    execPath: process.execPath,
    onStatus: sendSpiceRuntimeStatus,
  });

  try {
    await miniPlayerServer.startServer((action) => {
      console.log("[Server] Remote Action received:", action);

      if (action.action === "close") {
        if (miniPlayerWindow) {
          miniPlayerWindow.close();
        }
        return;
      }

      // Handle Service Loading from Remote
      if (action.action === "loadService" || action.action === "load-service") {
        const service = action.service || (action.args && action.args[0]);
        if (service) {
          console.log(`[Server] Remote load-service: ${service}`);
          loadService(service);
        }
        return;
      }

      // Handle Navigation from Remote
      if (action.action === "navigate") {
        const navAction = action.navAction || (action.args && action.args[0]);
        if (navAction) {
          console.log(`[Server] Remote navigate: ${navAction}`);
          if (["back", "forward", "reload", "home"].includes(navAction)) {
            navigateActiveView(navAction).catch((error) => {
              console.error("[Navigation] Remote navigation failed:", error);
            });
          }
        }
        return;
      }

      const playerView = getActiveBackendView();
      if (!playerView) return;

      const remoteAction = String(action.action || "");
      const allowedPlayerActions = new Set([
        "playpause",
        "next",
        "prev",
        "playQueueIndex",
        "volume",
        "shuffle",
        "repeat",
        "queue",
      ]);
      if (!allowedPlayerActions.has(remoteAction)) {
        console.warn(`[Server] Rejected unknown remote action: ${remoteAction}`);
        return;
      }
      const requestedQueueIndex = Number(action.index);
      const safeQueueIndex = Number.isSafeInteger(requestedQueueIndex)
        ? requestedQueueIndex
        : -1;

      if (remoteAction === "playpause" || remoteAction === "playQueueIndex") {
        markSpiceNativePlaybackIntent(`mini-player ${remoteAction}`);
      }

      // Execute actions on the main player view
      const code = `
            (function() {
                const click = (sel) => document.querySelector(sel)?.click();

                if ('${remoteAction}' === 'playpause') {
                   const findAndClick = (selector) => {
                       const el = document.querySelector(selector);
                       if (el && el.offsetParent !== null) {
                           // Sometimes the button itself is what we want, sometimes the inner
                           const inner = el.querySelector('button') || el;
                           inner.click();
                           return true;
                       }
                       return false;
                   };

                   if (!findAndClick('ytmusic-player-bar #play-pause-button')) {
                       if (!findAndClick('ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button')) {
                           if (!findAndClick('#play-pause-button')) {
                               const v = document.querySelector('video, audio');
                               if (v) {
                                   v.paused ? v.play() : v.pause();
                               } else {
                                   document.querySelector('.playControl')?.click();
                               }
                           }
                       }
                   }
                }                else if ('${remoteAction}' === 'next') {
                    const ytm = document.querySelector('.next-button');
                    if (ytm) ytm.click();
                    else click('.skipControl__next');
                }
                else if ('${remoteAction}' === 'prev') {
                    const ytm = document.querySelector('.previous-button');
                    if (ytm) ytm.click();
                    else click('.skipControl__previous');
                }
                else if ('${remoteAction}' === 'playQueueIndex') {
                    const index = ${safeQueueIndex};
                    if (index >= 0) {
                        const items = document.querySelectorAll('ytmusic-player-queue-item');
                        if (items && items[index]) {
                            const playBtn = items[index].querySelector('ytmusic-play-button-renderer') || items[index];
                            playBtn.click();
                        }
                    }
                }
                else if ('${remoteAction}' === 'volume') {
                    // Handled in main process below
                }
                else if ('${remoteAction}' === 'shuffle') {
                    console.log('[MiniPlayer] Shuffle requested');

                    const findBtn = (selectors) => {
                        for (const s of selectors) {
                            const el = document.querySelector(s);
                            if (el) return el;
                        }
                        return null;
                    };

                    // YTM Selectors (various states)
                    const ytmShuffle = findBtn([
                        '.shuffle-button',
                        'tp-yt-paper-icon-button[aria-label="Shuffle"]',
                        'tp-yt-paper-icon-button[aria-label="Shuffle on"]',
                        'tp-yt-paper-icon-button[aria-label="Shuffle off"]',
                        'ytmusic-player-bar .shuffle',
                        '[class*="shuffle"]'
                    ]);

                    if (ytmShuffle) {
                        console.log('[MiniPlayer] YTM Shuffle found:', ytmShuffle);
                        ytmShuffle.click();
                    } else {
                         console.log('[MiniPlayer] YTM Shuffle NOT found');
                    }

                    // SoundCloud
                    const scShuffle = document.querySelector('.shuffleControl');
                    if (scShuffle) scShuffle.click();
                }
                else if ('${remoteAction}' === 'repeat') {
                    console.log('[MiniPlayer] Repeat requested');

                    const findBtn = (selectors) => {
                        for (const s of selectors) {
                            const el = document.querySelector(s);
                            if (el) return el;
                        }
                        return null;
                    };

                    // YTM Selectors (various states)
                    const ytmRepeat = findBtn([
                        '.repeat-button',
                        'tp-yt-paper-icon-button[aria-label="Repeat"]',
                        'tp-yt-paper-icon-button[aria-label="Repeat all"]',
                        'tp-yt-paper-icon-button[aria-label="Repeat one"]',
                        'tp-yt-paper-icon-button[aria-label="Repeat off"]',
                        'ytmusic-player-bar .repeat',
                        '[class*="repeat"]'
                    ]);

                    if (ytmRepeat) {
                        console.log('[MiniPlayer] YTM Repeat found:', ytmRepeat);
                        ytmRepeat.click();
                    } else {
                         console.log('[MiniPlayer] YTM Repeat NOT found');
                    }

                    // SoundCloud
                    const scRepeat = document.querySelector('.repeatControl');
                    if (scRepeat) scRepeat.click();
                }
            })();
        `;
      playerView.webContents
        .executeJavaScript(code)
        .catch((e) => console.error(e));

      // Handle volume separately in main process (uses AudioContext gain, not video.volume)
      if (
        remoteAction === "volume" &&
        (action.value !== undefined ||
          (action.args && action.args[0] !== undefined))
      ) {
        const val = Number(action.value !== undefined ? action.value : action.args[0]);
        if (!Number.isFinite(val)) return;
        // Emit internally — picked up by ipcMain.on('set-volume') which calls applyVolume
        ipcMain.emit("set-volume", { sender: mainWindow?.webContents }, val);
        // Immediately update mini player server state so slider doesn't reset on next poll
        miniPlayerServer.updateState({ volume: val });
        // Sync the main app's volume slider
        if (mainWindow) mainWindow.webContents.send("volume-changed", val);
      }

      if (remoteAction === "queue") {
        if (queueWindow) {
          queueWindow.focus();
        } else {
          queueWindow = new BrowserWindow({
            width: 400,
            height: 600,
            title: "Spice Queue",
            icon: path.join(__dirname, "icon.png"),
            frame: false,
            autoHideMenuBar: true,
            backgroundColor: "#121212",
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              preload: path.join(__dirname, "preload.js"),
            },
          });
          queueWindow.loadURL(`http://localhost:6969/queue`);
          queueWindow.on("closed", () => {
            queueWindow = null;
          });
        }
      }
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error("[Server] Failed to start:", message);

    const portInUse =
      (err && (err.code === "EADDRINUSE" || err.errno === "EADDRINUSE")) ||
      /EADDRINUSE|address already in use/i.test(message);

    if (portInUse) {
      const probeTargets = [
        "http://localhost:6969/api/status",
        "http://127.0.0.1:6969/api/status",
      ];

      let existingServerDetected = false;
      for (const url of probeTargets) {
        try {
          const res = await fetch(url);
          if (res && res.ok) {
            const status = await res.json().catch(() => null);
            if (status && status.spiceServer === true && status.protocolVersion === 1) {
              existingServerDetected = true;
              console.log(
                `[Server] Port 6969 is already in use by a compatible local server (${url}). Continuing startup.`,
              );
              break;
            }
          }
        } catch (_) {
          // Keep probing alternatives
        }
      }

      if (!existingServerDetected) {
        dialog.showErrorBox(
          "Port 6969 is already in use",
          "Spice could not start its local server because port 6969 is occupied by another process. Close the conflicting app/process and launch Spice again.",
        );
        app.quit();
        return;
      }
    } else {
      dialog.showErrorBox(
        "Local server startup failed",
        `Spice failed to start its local server.\n\n${message}`,
      );
      app.quit();
      return;
    }
  }

  initStore();
  await installOfflineAudioProtocol();
  // NUCLEAR OPTION: Clear Cache on Startup
  if (session.defaultSession) {
    try {
      await session.defaultSession.clearCache();
      console.log("Session cache CLEARED (Nuclear Option)");
    } catch (e) {
      console.error("Failed to clear cache:", e);
    }
  }

  // Determine AdBlocker Type
  // Migration: If adBlockerType is missing, use adBlockerEnabled (bool) -> 'spice' or 'none'
  let adBlockerType = store ? store.get("adBlockerType") : undefined;
  if (!adBlockerType) {
    const enabled = store ? store.get("adBlockerEnabled", true) : true;
    adBlockerType = enabled ? "spice" : "none";
    // Persist migration
    if (store) store.set("adBlockerType", adBlockerType);
  }
  if (adBlockerType === "ublock_lite") {
    adBlockerType = "spice";
    if (store) {
      store.set("adBlockerType", adBlockerType);
      store.set("adBlockerEnabled", true);
    }
  }
  if (APP_NATIVE_MODE) {
    adBlockerType = "none";
  }

  console.log(`AdBlocker System: Mode is[${adBlockerType}]`);

  // 1. Spice (Internal Cliqz AdBlocker)
  if (adBlockerType === "spice") {
    try {
      console.log(
        "Initializing Spice AdBlocker (Strict Mode + uBlock Lists)...",
      );

      const enginePath = path.join(
        app.getPath("userData"),
        "adblock-engine.bin",
      );

      if (fs.existsSync(enginePath)) {
        console.log("Loading AdBlocker engine from cache...");
        try {
          const buffer = fs.readFileSync(enginePath);
          adBlocker = ElectronBlocker.deserialize(buffer);
          console.log("AdBlocker loaded from cache.");
        } catch (e) {
          console.error(
            "Failed to load cached engine, falling back to network fetch:",
            e,
          );
        }
      }

      if (!adBlocker) {
        console.log(
          "Fetching comprehensive blocklists (This may take a few seconds)...",
        );
        // uBlock Origin, EasyList, EasyPrivacy, AdGuard
        const lists = [
          "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
          "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
          "https://easylist.to/easylist/easylist.txt",
          "https://easylist.to/easylist/easyprivacy.txt",
          "https://filters.adtidy.org/extension/ublock/filters/2.txt", // AdGuard Base
        ];

        const fetchPromises = lists.map((url) =>
          fetch(url).then((r) => r.text()),
        );
        const listContents = await Promise.all(fetchPromises);

        console.log("Parsing blocklists...");
        adBlocker = ElectronBlocker.parse(listContents.join("\n"));

        // Save to cache
        console.log("Saving AdBlocker engine to cache...");
        const buffer = adBlocker.serialize();
        fs.writeFileSync(enginePath, buffer);
        console.log("AdBlocker engine saved.");
      }

      if (session.defaultSession) {
        adBlocker.enableBlockingInSession(session.defaultSession);
        console.log(
          "AdBlocker initialized and blocking enabled in default session.",
        );
      }
    } catch (err) {
      console.error("Failed to initialize AdBlocker:", err);
    }
  }
  // 2. uBlock Origin (Extension)
  else if (adBlockerType === "ublock") {
    try {
      const extPath = app.isPackaged
        ? path.join(
            process.resourcesPath,
            "extensions",
            "ublock0",
            "uBlock0.chromium",
          )
        : path.join(
            __dirname,
            "src",
            "extensions",
            "ublock0",
            "uBlock0.chromium",
          );
      console.log(`Loading uBlock Origin from: ${extPath} `);
      await session.defaultSession.loadExtension(extPath);
      console.log("uBlock Origin loaded successfully.");
    } catch (e) {
      console.error("Failed to load uBlock Origin extension:", e);
    }
  }
  // 3. Disabled
  else {
    console.log("AdBlocker is DISABLED.");
  }

  createWindow();

  // Initialize Auto Updater
  autoUpdater.channel = UPDATE_CHANNEL;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => {
    broadcastUpdateStatus({ status: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    broadcastUpdateStatus({ status: "available", info });
  });
  autoUpdater.on("update-not-available", (info) => {
    broadcastUpdateStatus({ status: "not-available", info });
  });
  autoUpdater.on("error", (err) => {
    broadcastUpdateStatus({ status: "error", error: err.message });
  });
  autoUpdater.on("download-progress", (progressObj) => {
    broadcastUpdateStatus({ status: "downloading", progress: progressObj });
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloadedUpdateInfo = info;
    skipDownloadedUpdateOnClose = false;
    broadcastUpdateStatus({ status: "downloaded", info });
    setTimeout(() => {
      promptForDownloadedUpdate(info).catch((error) => {
        console.error("Failed to prompt for downloaded update:", error);
      });
    }, 250);
  });
  autoUpdater.on("before-quit-for-update", () => {
    updateInstallInProgress = true;
    if (!updateInstallCleanupCompleted) {
      console.warn("Updater quit started before cleanup completed; running synchronous cleanup fallback.");
      stopTrackPolling();
      clearPlaybackSurfaces();
      if (discordRpc) {
        try {
          discordRpc.disconnect();
        } catch (_) {}
      }
    }
  });

  // Automatically check on startup
  try {
    if (app.isPackaged && AUTO_UPDATE_SUPPORTED) {
      autoUpdater.checkForUpdatesAndNotify();
    } else if (app.isPackaged) {
      console.log("Skipping in-app updater for package-managed Linux install; use the matching deb or RPM release package.");
    } else {
      console.log(`Skipping auto-updater in development mode on ${UPDATE_CHANNEL} channel.`);
    }
  } catch(e) {
    console.error("Auto-updater error on startup:", e);
  }

  // Initialize Discord RPC if enabled
  const discordEnabled = store ? store.get("discordRpcEnabled", true) : true;
  if (discordEnabled) {
    discordRpc.connect();
  }

  app.on("window-all-closed", () => {
    if (updateInstallInProgress) return;
    if (shouldQuitWhenLastWindowCloses(process.platform)) app.quit();
  });

  // IPC Handlers
  ipcMain.on("load-service", (event, service) => {
    console.log(`IPC: load - service received for ${service}`);
    loadService(service);
  });

  // Load a specific URL (only exact supported service origins are allowed).
  ipcMain.handle("load-url", (event, url) => loadSupportedUrl(url));

  ipcMain.handle("confirm-boost", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showMessageBox(parentWindow, {
      type: "warning",
      buttons: ["Cancel", "Enable Boost"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      title: "Volume Boost Warning",
      message: "Enable Volume Boost?",
      detail:
        "Boost can push audio above normal safe levels. Start low, raise the volume slowly, and stop immediately if audio feels painful or distorted.",
    });
    return result.response === 1;
  });

  ipcMain.on("navigate", (event, action) => {
    if (!["back", "forward", "reload", "home"].includes(action)) return;
    navigateActiveView(action).catch((error) => {
      console.error("[Navigation] Navigation failed:", error);
    });
  });

  ipcMain.on("spice-theme-changed", (event, theme) => {
    if (
      currentService !== "spice_crazy" ||
      !view ||
      view.webContents.isDestroyed() ||
      event.sender !== view.webContents
    ) {
      return;
    }
    updateShellTheme(theme);
  });

  // Auto Updater
  ipcMain.handle("check-for-updates", async () => {
    if (!app.isPackaged) {
      return { success: false, error: "Auto updates are only available in packaged builds." };
    }
    if (!AUTO_UPDATE_SUPPORTED) {
      return { success: false, error: "This Linux package is updated by installing the latest deb or RPM release." };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch(err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.on("install-update", async () => {
    if (!app.isPackaged || !AUTO_UPDATE_SUPPORTED) return;
    await installDownloadedUpdate();
  });

  ipcMain.handle("spice-runtime-status", async () => {
    if (!spiceRuntimeManager) return null;
    return spiceRuntimeManager.getStatus();
  });

  ipcMain.handle("spice-runtime-prepare", async () => {
    return ensureLocalRuntimeReady();
  });

  ipcMain.handle("spice-runtime-install", async () => {
    if (!spiceRuntimeManager) return null;
    return spiceRuntimeManager.installOrUpdate();
  });

  ipcMain.handle("spice-runtime-start", async () => {
    if (!spiceRuntimeManager) return null;
    return spiceRuntimeManager.start();
  });

  ipcMain.handle("spice-runtime-stop", async () => {
    if (!spiceRuntimeManager) return null;
    return spiceRuntimeManager.stop();
  });

  ipcMain.handle("native-app-status", async () => {
    return {
      ...nativeModeSettings(),
      onboarded: store ? store.get("nativeOnboarded", false) : false,
      account: getNativeAccountSummary(),
      runtime: spiceRuntimeManager ? await spiceRuntimeManager.getStatus() : null,
      updatesEnabled: app.isPackaged && AUTO_UPDATE_SUPPORTED,
      version: app.getVersion(),
    };
  });

  ipcMain.handle("native-runtime-prepare", async () => {
    if (!spiceRuntimeManager) return null;
    await ensureLocalRuntimeReady();
    return spiceRuntimeManager.getStatus();
  });

  ipcMain.handle("native-auth", async (event, payload) => {
    return nativeCloudAuth(payload);
  });

  ipcMain.handle("native-continue-offline", async () => {
    if (store) {
      store.set("nativeOnboarded", true);
    }
    await ensureLocalRuntimeReady();
    return {
      account: null,
      runtime: spiceRuntimeManager ? await spiceRuntimeManager.getStatus() : null,
    };
  });

  ipcMain.handle("native-sign-out", async () => {
    clearNativeAccount();
    if (view && !view.webContents.isDestroyed()) {
      view.webContents
        .executeJavaScript(`
          (() => {
            const profileId = localStorage.getItem('spice_cloud_profile_id');
            if (profileId) {
              try {
                const profiles = JSON.parse(localStorage.getItem('spice_profiles_list') || '[]');
                if (Array.isArray(profiles)) {
                  localStorage.setItem('spice_profiles_list', JSON.stringify(profiles.map((profile) => (
                    profile && profile.id === profileId
                      ? { ...profile, cloudToken: null, cloudUser: null, cloudUsername: null }
                      : profile
                  ))));
                }
              } catch (_) {}
            }
          })();
          localStorage.removeItem('spice_cloud_token');
          localStorage.removeItem('spice_token');
          localStorage.removeItem('spice_cloud_user');
          localStorage.removeItem('spice_cloud_profile_id');
        `)
        .catch(() => {});
    }
    return { account: null };
  });

  ipcMain.on("native-account-snapshot-sync", (event) => {
    event.returnValue = getNativeAccountSnapshot();
  });

  // Hide/Show BrowserView (for modals)
  ipcMain.on("hide-view", () => {
    console.log("IPC: hide-view received");
    viewHiddenForModal = true;
    if (view && mainWindow) {
      mainWindow.setBrowserView(null);
      console.log("BrowserView hidden for modal");
    }
  });

  ipcMain.on("show-view", () => {
    viewHiddenForModal = false;
    if (view && mainWindow) {
      mainWindow.setBrowserView(view);
      updateViewBounds();
      console.log("BrowserView shown after modal");
    }
  });

  // Queue Window Handler
  ipcMain.on("open-queue", () => {
    if (queueWindow) {
      queueWindow.focus();
      return;
    }

    queueWindow = new BrowserWindow({
      width: 400,
      height: 600,
      title: "Spice Queue",
      icon: path.join(__dirname, "icon.png"),
      frame: false,
      autoHideMenuBar: true,
      backgroundColor: "#121212",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    queueWindow.loadURL(`http://localhost:6969/queue`);

    queueWindow.on("closed", () => {
      queueWindow = null;
    });
  });

  ipcMain.on("play-queue-index", (event, index) => {
    if (view && view.webContents) {
      markSpiceNativePlaybackIntent("queue index");
      view.webContents
        .executeJavaScript(
          `
        (function() {
          const items = document.querySelectorAll('ytmusic-player-queue-item');
          if (items && items[${index}]) {
             const playBtn = items[${index}].querySelector('ytmusic-play-button-renderer') || items[${index}];
             playBtn.click();
          }
        })();
      `,
        )
        .catch((err) => console.error("Error clicking queue index:", err));
    }
  });

  // Lyrics Window Handler
  ipcMain.on("open-lyrics", () => {
    if (lyricsWindow) {
      lyricsWindow.focus();
      return;
    }

    lyricsWindow = new BrowserWindow({
      width: 400,
      height: 600,
      title: "Spice Lyrics",
      icon: path.join(__dirname, "icon.png"),
      frame: false, // Frameless to match main theme
      autoHideMenuBar: true,
      backgroundColor: "#121212",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true, // Must be true for contextBridge in preload.js to work
        preload: path.join(__dirname, "preload.js"),
      },
    });

    lyricsWindow.loadURL("http://localhost:6969/lyrics");

    lyricsWindow.once("ready-to-show", () => {
      lyricsWindow.show();
      // Send last known track if available
      if (lastTrack) {
        lyricsWindow.webContents.send("lyrics-track-update", lastTrack);
      }
    });

    lyricsWindow.on("closed", () => {
      lyricsWindow = null;
    });
  });

  // Get current track for lyrics window
  ipcMain.handle("get-now-playing", () => {
    return lastTrack || null;
  });

  ipcMain.on("open-mini-player", () => {
    createMiniPlayerWindow();
  });

  ipcMain.handle("fetch-lyrics", async (event, args) => {
    // args can be just {title, artist} (legacy) or {title, artist, provider}
    const { title, artist, album, provider = "lrclib" } = args;
    console.log(
      `[Main] Fetching lyrics from[${provider}]for: ${title} - ${artist} `,
    );

    try {
      if (provider === "genius") {
        return await fetchGeniusLyrics(title, artist);
      } else if (provider === "musixmatch") {
        return await fetchMusixMatchLyrics(title, artist);
      } else {
        // Default: LRCLIB
        return await fetchLrcLibLyrics(title, artist, album);
      }
    } catch (e) {
      console.error(`[Main] Error fetching from ${provider}: `, e);
      return null;
    }
  });

  // LRCLIB Implementation
  async function fetchLrcLibLyrics(title, artist, album) {
    const query = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      album_name: album || "",
    });
    const url = `https://lrclib.net/api/get?${query.toString()}`;

    let res = await fetch(url);
    if (!res.ok) {
      console.log("[Main] LRCLIB direct fetch failed, trying search...");
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(title + " " + artist)}`;
      res = await fetch(searchUrl);
      if (res.ok) {
        const searchData = await res.json();
        if (searchData && searchData.length > 0) return searchData[0];
      }
      return null;
    }
    return await res.json();
  }

  // GENIUS Implementation
  async function fetchGeniusLyrics(title, artist) {
    // 1. Search Genius API
    const searchUrl = `https://genius.com/api/search/multi?per_page=1&q=${encodeURIComponent(title + " " + artist)}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error("Genius search failed");

    const searchJson = await searchRes.json();
    const hit = searchJson?.response?.sections?.[0]?.hits?.[0]?.result;

    if (!hit || !hit.url) return null;
    console.log("[Main] Found Genius URL:", hit.url);

    // 2. Fetch Page HTML
    const pageRes = await fetch(hit.url);
    if (!pageRes.ok) throw new Error("Genius page fetch failed");
    const html = await pageRes.text();

    // 3. Parse HTML (Improved extraction)
    // Genius puts lyrics in multiple <div data-lyrics-container="true">...</div> elements
    // Use a more robust extraction that handles nested content
    let lyricsHtml = "";

    // Method 1: Try to find all lyrics containers
    const containerRegex =
      /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = containerRegex.exec(html)) !== null) {
      lyricsHtml += match[1] + "<br/>";
    }

    // Method 2: If that fails, try a broader search around "Lyrics__Container"
    if (!lyricsHtml) {
      const altRegex =
        /<div[^>]*class="[^"]*Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      while ((match = altRegex.exec(html)) !== null) {
        lyricsHtml += match[1] + "<br/>";
      }
    }

    if (!lyricsHtml) {
      console.log("[Main] Could not extract lyrics from Genius HTML");
      return null;
    }

    // Clean up HTML to Plain Text
    let plainText = lyricsHtml
      .replace(/<br\s*\/?>/gi, "\n") // br to newline
      .replace(/<[^>]+>/g, "") // remove other tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');

    return {
      plainLyrics: plainText.trim(),
      syncedLyrics: null, // Genius is text only
    };
  }

  // MUSIXMATCH Implementation (Experimental)
  async function fetchMusixMatchLyrics(title, artist) {
    // MusixMatch is very hard to scrape. We will try a search via google pattern or direct site search.
    // NOTE: This usually hits Captcha. This is a "Best Effort".

    const searchUrl = `https://www.musixmatch.com/search/${encodeURIComponent(title + " " + artist)}`;
    console.log("[Main] Searching MusixMatch:", searchUrl);

    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (res.status === 403 || res.status === 503) {
      return {
        plainLyrics:
          "MusixMatch blocked access (Captcha/Cloudflare). Please use Genius or LRCLIB.",
      };
    }

    const html = await res.text();

    // Find song link in search results
    // <a class="title" href="/lyrics/..."
    const linkRegex = /href="(\/lyrics\/[^"]+)"/;
    const linkMatch = linkRegex.exec(html);

    if (!linkMatch) return null;

    const trackUrl = `https://www.musixmatch.com${linkMatch[1]}`;
    console.log("[Main] Found MusixMatch Track URL:", trackUrl);

    const trackRes = await fetch(trackUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const trackHtml = await trackRes.text();

    // Extract lyrics: <span class="lyrics__content__ok">...</span> or similar class
    const lyricRegex = /<span class="lyrics__content__ok"[^>]*>(.*?)<\/span>/gs;
    let fullLyrics = "";
    let m;
    while ((m = lyricRegex.exec(trackHtml)) !== null) {
      fullLyrics += m[1] + "\n";
    }

    if (!fullLyrics) {
      // Fallback for restricted lyrics
      return {
        plainLyrics:
          "Could not extract full lyrics from MusixMatch (Restricted/Login Required).",
      };
    }

    return {
      plainLyrics: fullLyrics.replace(/<[^>]+>/g, "").trim(),
      syncedLyrics: null,
    };
  }

  // Main process receiving track info from Renderer (which got it from BrowserView)
  // scrobble-now-playing removed (duplicate)

  function createSettingsWindow() {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }

    settingsWindow = new BrowserWindow({
      width: 760,
      height: 720,
      minWidth: 620,
      minHeight: 520,
      backgroundColor: "#121212",
      frame: false, // Frameless for custom title bar
      titleBarStyle: "hidden",
      titleBarOverlay: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // We can reuse preload or create a specific one if needed.
        // For now reusing main preload for basic window functionality if we added it there,
        // or just simple load for now since no specific IPC logic requested yet inside settings.
      },
    });

    settingsWindow.loadURL("http://localhost:6969/settings");
    settingsWindow.webContents.on("did-finish-load", () => {
      applyCustomCssToWebContents(settingsWindow.webContents);
      sendShellTheme(settingsWindow.webContents);
    });

    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
  }

  function createToolbarSettingsWindow() {
    if (toolbarSettingsWindow) {
      toolbarSettingsWindow.focus();
      return;
    }

    toolbarSettingsWindow = new BrowserWindow({
      width: 460,
      height: 560,
      backgroundColor: "#121212",
      frame: false,
      titleBarStyle: "hidden",
      titleBarOverlay: false,
      parent: settingsWindow || mainWindow,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    toolbarSettingsWindow.loadURL("http://localhost:6969/toolbar-icons");
    toolbarSettingsWindow.webContents.on("did-finish-load", () => {
      applyCustomCssToWebContents(toolbarSettingsWindow.webContents);
      sendShellTheme(toolbarSettingsWindow.webContents);
    });

    toolbarSettingsWindow.on("closed", () => {
      toolbarSettingsWindow = null;
    });
  }

  async function openSpiceSettingsInMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: "The main Spice window is not available." };
    }

    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
    mainWindow.show();
    mainWindow.focus();

    if (currentService !== "spice_crazy" || !view || view.webContents.isDestroyed()) {
      await loadService("spice_crazy");
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (
        currentService === "spice_crazy" &&
        view &&
        !view.webContents.isDestroyed() &&
        await dispatchSpiceDesktopNavigation("settings")
      ) {
        return { success: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { success: false, error: "SPICE Music did not finish opening its settings page." };
  }

  ipcMain.on("open-settings", () => {
    if (!APP_NATIVE_MODE) {
      createSettingsWindow();
      return;
    }
    openSpiceSettingsInMainWindow().catch((error) => {
      console.error("Could not open Native in-app settings:", error);
    });
  });

  ipcMain.handle("open-spice-settings", () => openSpiceSettingsInMainWindow());

  ipcMain.on("open-toolbar-settings", () => {
    createToolbarSettingsWindow();
  });

  // Volume Logic
  const DEFAULT_VOL = 1.0;

  // Robust Volume Injection Script
  // This script runs on an interval in the webview to ensure volume is always applied
  // even if the video element changes (e.g. song switch, ad transition).
  const getVolumeScript = (gainValue) => {
    const stages = resolveWrapperVolumeStages(gainValue);
    return `
        (function() {
            window.spiceVolume = ${stages.totalGain};
            window.spiceMediaVolume = ${stages.mediaVolume};
            window.spiceBoostGain = ${stages.boostGain};

            // Helper to apply immediately
            function apply() {
                try {
                    const media = document.querySelector('video') || document.querySelector('audio');
                    if (!media) return;
                    if (media.volume !== window.spiceMediaVolume) {
                        media.volume = window.spiceMediaVolume;
                    }

                    if (!window.boostCtx) {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        window.boostCtx = new AudioContext();
                        window.boostGain = window.boostCtx.createGain();
                        window.boostGain.connect(window.boostCtx.destination);
                    }

                    if (window.boostCtx.state === 'suspended') {
                        window.boostCtx.resume();
                    }

                    if (media !== window.lastBoostedMedia) {
                        if (window.boostSource) {
                            try { window.boostSource.disconnect(); } catch(e) {}
                        }
                        window.boostSource = window.boostCtx.createMediaElementSource(media);
                        window.boostSource.connect(window.boostGain);
                        window.lastBoostedMedia = media;
                    }

                    if (window.boostGain.gain.value !== window.spiceBoostGain) {
                        window.boostGain.gain.value = window.spiceBoostGain;
                    }
                } catch(e) {
                    // console.error(e);
                }
            }

            // Apply immediately
            apply();

            if (window.spiceVolInterval) return;

            window.spiceVolInterval = setInterval(() => {
                apply();
            }, 1000);
        })();
      `;
  };

  const getSpiceAudioSyncScript = (gainValue, boostEnabled, revision) => `
        (function() {
            if (typeof window.__spiceDesktopSetAudioSettings !== 'function') return false;
            window.__spiceDesktopSetAudioSettings({
                volume: ${Math.round(Math.max(0, Math.min(10, Number(gainValue) || 0)) * 100)},
                boostEnabled: ${boostEnabled ? "true" : "false"},
                revision: ${revision}
            });
            return true;
        })();
    `;

  function applySpiceAudioControls(retries = 60, payload = null) {
    const targetView = getActiveBackendView();
    if (!targetView) return;
    const nextPayload = payload || {
      gainValue: currentVolume,
      boostEnabled: currentBoostEnabled,
      revision: ++spiceAudioControlRevision,
    };
    targetView.webContents
      .executeJavaScript(getSpiceAudioSyncScript(
        nextPayload.gainValue,
        nextPayload.boostEnabled,
        nextPayload.revision,
      ))
      .then((applied) => {
        if (!applied && retries > 0 && nextPayload.revision === spiceAudioControlRevision) {
          setTimeout(() => applySpiceAudioControls(retries - 1, nextPayload), 250);
        }
      })
      .catch(() => {
        if (retries > 0 && nextPayload.revision === spiceAudioControlRevision) {
          setTimeout(() => applySpiceAudioControls(retries - 1, nextPayload), 250);
        }
      });
  }

  // Apply volume to current view
  // Volume Logic
  function applyVolume(vol) {
    if (vol !== undefined) {
      const gain = Number(vol);
      if (Number.isFinite(gain)) currentVolume = Math.max(0, Math.min(10, gain));
    }
    const targetView = getActiveBackendView();
    if (!targetView) return;
    if (currentService === "spice_crazy") {
      applySpiceAudioControls();
      return;
    }
    targetView.webContents
      .executeJavaScript(getVolumeScript(currentVolume))
      .catch(() => {});
  }
  applyVolumeToActiveView = applyVolume;

  // Set Volume IPC
  ipcMain.on("set-volume", async (event, gainValue) => {
    applyVolume(gainValue);
    if (store) store.set("volume", currentVolume);
    sendAudioControlState();
  });

  ipcMain.on("set-boost-enabled", async (event, enabled) => {
    currentBoostEnabled = Boolean(enabled);
    if (store) store.set("boostEnabled", currentBoostEnabled);
    if (currentService === "spice_crazy") {
      applySpiceAudioControls();
    }
    sendAudioControlState();
  });

  ipcMain.on("spice-audio-state-changed", (event, state) => {
    if (currentService === "spice_crazy" && !(state && state.desktopReady)) {
      return;
    }
    const volume = Number(state && state.volume);
    if (Number.isFinite(volume)) {
      currentVolume = Math.max(0, Math.min(10, volume / 100));
      if (store) store.set("volume", currentVolume);
    }
    if (typeof (state && state.boostEnabled) === "boolean") {
      currentBoostEnabled = state.boostEnabled;
      if (store) store.set("boostEnabled", currentBoostEnabled);
    }
    if (currentService === "spice_crazy") {
      applySpiceAudioControls();
    }
    miniPlayerServer.updateState({ volume: currentVolume });
    sendAudioControlState();
  });

  // Toggle Volume (Legacy)
  ipcMain.on("toggle-volume", async () => {
    const target = currentVolume > 1.0 ? 1.0 : 10.0;
    currentVolume = target;
    applyVolume(target);
    if (store) store.set("volume", currentVolume);
    sendAudioControlState();
  });

  // Apply volume on navigation
  // We hook into the existing 'did-navigate' listeners via a helper or just add a new one?
  // Since 'view' is recreated in load-service, we need to ensure listeners are attached.
  // The load-service logic destroys 'view', so we need to call applyVolume() AFTER it's created.
  // We'll add it to the 'load-url' handler logic.

  // Settings IPC
  ipcMain.handle("get-settings", () => {
    const storedAdBlockerType = store
      ? store.get("adBlockerType", "spice")
      : "spice";
    const startOnBootSettings = getStartOnBootSettings();
    return {
      ...nativeModeSettings(),
      nativeAccount: getNativeAccountSummary(),
      nativeOnboarded: store ? store.get("nativeOnboarded", false) : false,
      adBlockerEnabled: store ? store.get("adBlockerEnabled", true) : true,
      // Return type explicitly so UI can show correct state
      adBlockerType:
        storedAdBlockerType === "ublock_lite"
          ? "spice"
          : storedAdBlockerType,
      defaultService: store
        ? store.get("defaultService", DEFAULT_STARTUP_SERVICE)
        : DEFAULT_STARTUP_SERVICE,
      toolbarButtons: getToolbarButtons(),
      boostEnabled: currentBoostEnabled,
      alwaysOnTop: getAlwaysOnTop(),
      startOnBootSupported: startOnBootSettings.supported,
      startOnBoot: startOnBootSettings.enabled,
      shellTheme: getShellTheme(),
      customCss: store ? store.get("customCss", "") : "",
      discordRpcEnabled: store ? store.get("discordRpcEnabled", true) : true,
      vkPlayerEnabled: store ? store.get("vkPlayerEnabled", false) : false,
      topBarSearchEnabled: store
        ? store.get("topBarSearchEnabled", false)
        : false,
    };
  });

  ipcMain.handle("get-topbar-search", () => {
    return store ? store.get("topBarSearchEnabled", false) : false;
  });

  ipcMain.on("set-topbar-search", (event, enabled) => {
    const next = enabled === true;
    if (store) store.set("topBarSearchEnabled", next);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("topbar-search-visibility", next);
    }
  });

  ipcMain.on("set-toolbar-buttons", (event, buttons) => {
    if (!store || !buttons || typeof buttons !== "object") return;
    const next = {};
    for (const key of Object.keys(DEFAULT_TOOLBAR_BUTTONS)) {
      next[key] = buttons[key] !== false;
    }
    store.set("toolbarButtons", next);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("toolbar-buttons-changed", getToolbarButtons());
    }
  });

  ipcMain.on("set-custom-css", (event, css) => {
    if (!store) return;
    store.set("customCss", typeof css === "string" ? css : "");
    applyCustomCssEverywhere();
  });

  ipcMain.on("execute-search", (event, query) => {
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
    if (view && currentService === "yt") {
      const code = `
        (function() {
          var a = document.createElement('a');
          a.href = '/search?q=${encodeURIComponent(query).replace(/'/g, "\\'")}';
          document.body.appendChild(a);
          a.click();
          a.remove();
        })();
      `;
      view.webContents.executeJavaScript(code).catch((e) => {
        console.error("SPA Search failed, falling back to direct URL load:", e);
        loadSupportedUrl(searchUrl).catch((error) => {
          console.error("Search URL fallback failed:", error);
        });
      });
    } else {
      loadSupportedUrl(searchUrl).catch((error) => {
        console.error("Search URL load failed:", error);
      });
    }
  });

  ipcMain.handle("get-always-on-top", () => getAlwaysOnTop());

  ipcMain.handle("set-always-on-top", (event, enabled) => {
    return setAlwaysOnTop(enabled);
  });

  ipcMain.handle("get-start-on-boot", () => getStartOnBootSettings());

  ipcMain.handle("set-start-on-boot", (event, enabled) => {
    return setStartOnBoot(enabled);
  });

  ipcMain.on("set-vk-player", (event, enabled) => {
    const next = enabled === true;
    if (store && store.get("vkPlayerEnabled", false) === next) return;
    if (store) store.set("vkPlayerEnabled", next);
    console.log(`VK Player on YT Music set to ${next}. Restarting...`);
    void restartDesktopApp();
  });

  ipcMain.on("set-adblocker", (event, value) => {
    // Value can be boolean (legacy) or string (new)
    let type = "spice"; // Default
    if (typeof value === "boolean") {
      type = value ? "spice" : "none";
    } else if (typeof value === "string" && DESKTOP_AD_BLOCKERS.has(value)) {
      type = value;
    }
    if (type === "ublock_lite") {
      type = "spice";
    }
    if (!DESKTOP_AD_BLOCKERS.has(type)) return;
    if (store && store.get("adBlockerType", "spice") === type) return;

    console.log(`IPC: Setting AdBlocker to [${type}]`);

    if (store) {
      store.set("adBlockerType", type);
      // Sync legacy boolean for other parts of the app that might read it
      store.set("adBlockerEnabled", type !== "none");
      console.log("IPC: Settings saved to store.");
    }

    // For any change, we force a restart to ensure clean state and correct extension loading
    console.log("IPC: Restarting app to apply AdBlocker settings...");
    void restartDesktopApp();
  });

  ipcMain.on("set-default-service", (event, service) => {
    if (APP_NATIVE_MODE) {
      console.log("Native mode ignores default service changes; SPICE Music is the only startup service.");
      return;
    }
    if (!DESKTOP_STARTUP_SERVICES.has(service)) return;
    if (store && store.get("defaultService", DEFAULT_STARTUP_SERVICE) === service) return;
    if (store) store.set("defaultService", service);
    console.log(`Default Service set to ${service}. Restarting...`);
    void restartDesktopApp();
  });

  ipcMain.on("set-discord-rpc", (event, enabled) => {
    const next = enabled === true;
    if (store) store.set("discordRpcEnabled", next);
    if (!discordRpc) return;
    if (next) {
      discordRpc.connect();
      console.log("Discord RPC: ENABLED");
    } else {
      discordRpc.clearPresence();
      discordRpc.disconnect();
      console.log("Discord RPC: DISABLED");
    }
  });

  // Renderer Logging Bridge
  ipcMain.on("renderer-log", (event, { level, args }) => {
    // formatting args for main console
    const msg = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
      .join(" ");
    console.log(`[View:${level}] ${msg}`);
  });

  // Scrobbler IPC Handlers
  ipcMain.handle("get-scrobble-settings", () => {
    if (!scrobbler) return null;
    return scrobbler.getSettings();
  });

  ipcMain.on("save-lastfm-credentials", (event, { apiKey, secret }) => {
    if (scrobbler) {
      scrobbler.saveLastFmCredentials(apiKey, secret);
      console.log("Last.fm credentials saved");
    }
  });

  ipcMain.on("save-listenbrainz-token", async (event, token) => {
    if (scrobbler) {
      const result = await scrobbler.saveListenBrainzToken(token);
      event.sender.send("listenbrainz-validation", result);
      console.log("ListenBrainz token saved, valid:", result.valid);
    }
  });

  ipcMain.on("toggle-lastfm", (event, enabled) => {
    if (scrobbler) {
      scrobbler.setLastFmEnabled(enabled);
      console.log("Last.fm enabled:", enabled);
    }
  });

  ipcMain.on("toggle-listenbrainz", (event, enabled) => {
    if (scrobbler) {
      scrobbler.setListenBrainzEnabled(enabled);
      console.log("ListenBrainz enabled:", enabled);
    }
  });

  ipcMain.handle("lastfm-authenticate", async (event) => {
    if (!scrobbler) return { error: "Scrobbler not initialized" };

    try {
      const authUrl = await scrobbler.startLastFmAuth();

      // Create auth window
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        backgroundColor: "#121212",
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.setMenuBarVisibility(false);
      authWindow.loadURL(authUrl);

      return new Promise((resolve) => {
        let authCompleted = false;

        // Monitor URL changes - Last.fm redirects after auth
        const checkAuth = async () => {
          if (authCompleted) return;

          try {
            const currentUrl = authWindow.webContents.getURL();

            // After authorization, Last.fm shows a page saying "you can close this window"
            // or redirects to a confirmation page. We detect this and complete auth.
            if (
              currentUrl.includes("last.fm") &&
              (currentUrl.includes("token=") ||
                currentUrl.includes("/api/auth") ||
                !currentUrl.includes("/api/auth/?api_key"))
            ) {
              // Try to complete the auth
              try {
                const session = await scrobbler.completeLastFmAuth();
                authCompleted = true;
                authWindow.close();
                resolve({ success: true, username: session.username });
              } catch (e) {
                // Not ready yet, keep waiting
              }
            }
          } catch (e) {
            // Window might be closing
          }
        };

        // Check periodically and on navigation
        authWindow.webContents.on("did-navigate", checkAuth);
        authWindow.webContents.on("did-navigate-in-page", checkAuth);
        const checkInterval = setInterval(checkAuth, 1000);

        // Handle window close
        authWindow.on("closed", async () => {
          clearInterval(checkInterval);

          if (!authCompleted) {
            // User closed window - try to complete auth one more time
            // (they may have authorized but we didn't catch the redirect)
            try {
              const session = await scrobbler.completeLastFmAuth();
              resolve({ success: true, username: session.username });
            } catch (e) {
              resolve({ error: "Authentication cancelled or failed" });
            }
          }
        });
      });
    } catch (err) {
      return { error: err.message };
    }
  });

  // Keep for backwards compatibility, but primary flow is now automatic
  ipcMain.handle("lastfm-complete-auth", async () => {
    if (!scrobbler) return { error: "Scrobbler not initialized" };
    try {
      const session = await scrobbler.completeLastFmAuth();
      return { success: true, username: session.username };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Get Volume IPC
  ipcMain.handle("get-volume", () => {
    return store ? store.get("volume", DEFAULT_VOL) : DEFAULT_VOL;
  });

  // Last.fm API Wizard - Automates API credential setup
  ipcMain.handle("lastfm-api-wizard", async () => {
    return new Promise((resolve) => {
      const wizardWindow = new BrowserWindow({
        width: 900,
        height: 700,
        backgroundColor: "#1a1a1a",
        parent: mainWindow,
        modal: false,
        title: "Last.fm API Setup",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      wizardWindow.setMenuBarVisibility(false);
      wizardWindow.loadURL("https://www.last.fm/api/account/create");

      let credentialsFound = false;

      // Function to check for credentials on the current page
      const checkForCredentials = async () => {
        if (credentialsFound) return;

        try {
          const url = wizardWindow.webContents.getURL();
          console.log("[API Wizard] Current URL:", url);

          // After form submission, Last.fm shows the API account page with credentials
          // The URL pattern is typically /api/account or shows the created app
          if (url.includes("last.fm/api/account") && !url.includes("/create")) {
            // Try to extract credentials from the page
            const result = await wizardWindow.webContents.executeJavaScript(`
                        (function() {
                            try {
                                // Look for the API Key and Secret in the page
                                // Last.fm typically shows these in a definition list or similar structure
                                const pageText = document.body.innerText;

                                // Try multiple extraction methods
                                let apiKey = null;
                                let secret = null;

                                // Method 1: Look for labeled elements
                                const allElements = document.querySelectorAll('*');
                                for (const el of allElements) {
                                    const text = el.innerText || '';

                                    // Check for API Key pattern (32 hex characters)
                                    if (!apiKey) {
                                        const keyMatch = text.match(/API\\s*[Kk]ey[:\\s]*([a-f0-9]{32})/i);
                                        if (keyMatch) apiKey = keyMatch[1];
                                    }

                                    // Check for Shared Secret pattern
                                    if (!secret) {
                                        const secretMatch = text.match(/[Ss]hared\\s*[Ss]ecret[:\\s]*([a-f0-9]{32})/i);
                                        if (secretMatch) secret = secretMatch[1];
                                    }
                                }

                                // Method 2: Look for code/pre elements with 32-char hex strings
                                if (!apiKey || !secret) {
                                    const codeElements = document.querySelectorAll('code, pre, input[type="text"], .api-key, .secret');
                                    const hexStrings = [];

                                    for (const el of codeElements) {
                                        const val = el.value || el.textContent || '';
                                        const match = val.match(/[a-f0-9]{32}/gi);
                                        if (match) hexStrings.push(...match);
                                    }

                                    // Also scan for any 32-char hex in the page
                                    const allHex = pageText.match(/[a-f0-9]{32}/gi) || [];
                                    hexStrings.push(...allHex);

                                    // Dedupe and take first two unique as key and secret
                                    const unique = [...new Set(hexStrings)];
                                    if (unique.length >= 2) {
                                        if (!apiKey) apiKey = unique[0];
                                        if (!secret) secret = unique[1];
                                    } else if (unique.length === 1 && !apiKey) {
                                        apiKey = unique[0];
                                    }
                                }

                                // Method 3: Look for specific Last.fm page structure
                                const dtElements = document.querySelectorAll('dt');
                                for (const dt of dtElements) {
                                    const label = dt.textContent.toLowerCase();
                                    const dd = dt.nextElementSibling;
                                    if (dd && dd.tagName === 'DD') {
                                        const value = dd.textContent.trim();
                                        if (label.includes('api key') && /^[a-f0-9]{32}$/i.test(value)) {
                                            apiKey = value;
                                        }
                                        if (label.includes('secret') && /^[a-f0-9]{32}$/i.test(value)) {
                                            secret = value;
                                        }
                                    }
                                }

                                if (apiKey && secret) {
                                    return { success: true, apiKey, secret };
                                }

                                return { success: false, found: { apiKey: !!apiKey, secret: !!secret } };
                            } catch (e) {
                                return { success: false, error: e.message };
                            }
                        })();
                    `);

            console.log("[API Wizard] Extraction result:", result);

            if (result.success && result.apiKey && result.secret) {
              credentialsFound = true;

              // Save credentials via scrobbler
              if (scrobbler) {
                scrobbler.saveLastFmCredentials(result.apiKey, result.secret);
                console.log("[API Wizard] Credentials saved!");
              }

              wizardWindow.close();
              resolve({
                success: true,
                apiKey: result.apiKey,
                secret: result.secret,
              });
            }
          }
        } catch (e) {
          console.error("[API Wizard] Check error:", e);
        }
      };

      // Monitor navigation
      wizardWindow.webContents.on("did-navigate", () => {
        setTimeout(checkForCredentials, 1000);
      });

      wizardWindow.webContents.on("did-navigate-in-page", () => {
        setTimeout(checkForCredentials, 1000);
      });

      // Also check periodically in case of SPA-style updates
      const checkInterval = setInterval(() => {
        if (!wizardWindow.isDestroyed()) {
          checkForCredentials();
        } else {
          clearInterval(checkInterval);
        }
      }, 2000);

      // Handle window close
      wizardWindow.on("closed", () => {
        clearInterval(checkInterval);
        if (!credentialsFound) {
          resolve({ cancelled: true });
        }
      });
    });
  });

  ipcMain.on("disconnect-lastfm", () => {
    if (scrobbler) {
      scrobbler.disconnectLastFm();
      console.log("Last.fm disconnected");
    }
  });

  ipcMain.on("disconnect-listenbrainz", () => {
    if (scrobbler) {
      scrobbler.disconnectListenBrainz();
      console.log("ListenBrainz disconnected");
    }
  });

  ipcMain.on("scrobble-now-playing", (event, track) => {
    console.log("========================================");
    console.log("[Main] IPC RECEIVED: scrobble-now-playing");
    console.log("[Main] Track data:", JSON.stringify(track));
    console.log("========================================");

    // Normalize track object (fix mismatch where injection uses 'track' but we expect 'title')
    if (track && track.track && !track.title) {
      track.title = track.track;
    }

    // Check if valid track
    if (!track || !track.title) {
      console.log("[Main] Invalid track, ignoring.");
      return;
    }

    lastTrack = track; // Save immediately
    console.log(`[Main] lastTrack UPDATED: ${lastTrack.title}`);

    // Enhance track object
    if (currentService === "yt") {
      // Album art fix for YT Music (high res)
      if (track.artwork && track.artwork.includes("ggpht.com")) {
        track.artwork = track.artwork.replace(/w\d+-h\d+/, "w1200-h1200");
        // Update lastTrack with enhanced artwork too
        lastTrack.artwork = track.artwork;
      }
    }

    // Scrobble (Last.fm / ListenBrainz)
    if (scrobbler) {
      scrobbler.updateNowPlaying(track);
    }

    // Update Mini Player State
    miniPlayerServer.updateState({
      track: {
        title: track.track,
        artist: track.artist,
        art: track.artwork || track.albumArt, // Use artwork (enhanced) or albumArt
        duration: track.duration,
      },
      paused: false,
      volume: currentVolume,
    });

    // Update Discord RPC if enabled
    const discordEnabled = store ? store.get("discordRpcEnabled", true) : true;
    if (discordEnabled) {
      discordRpc.updatePresence({ ...track, service: currentService });
    }

    // Update Lyrics Window if open
    if (lyricsWindow) {
      lyricsWindow.webContents.send("lyrics-track-update", track);
    }
  });

  // Track last RPC update time to avoid rate limiting
  let lastRpcUpdate = 0;
  let lastExpectedTime = 0;
  let lastUpdateTime = 0;

  ipcMain.on("scrobble-track-progress", (event, progress) => {
    // Forward to lyrics window if open
    if (lyricsWindow) {
      lyricsWindow.webContents.send("lyrics-progress-update", progress);
    }

    // Sync Discord RPC on Pause/Seek
    if (discordRpc && lastTrack) {
      const now = Date.now();
      const isPaused = progress.paused;
      const currentTime = progress.currentTime;

      // Initialize state if needed
      if (lastTrack.paused === undefined) lastTrack.paused = !isPaused; // Force update on first run

      let shouldUpdate = false;

      // Check 1: Pause State Changed
      if (lastTrack.paused !== isPaused) {
        console.log(
          `[Main] Pause state changed: ${lastTrack.paused} -> ${isPaused}`,
        );
        lastTrack.paused = isPaused;
        shouldUpdate = true;
      }

      // Check 2: Seek/Time Drift (only if playing)
      if (!isPaused) {
        // Expected time since last update
        const timePassed = (now - lastUpdateTime) / 1000;
        const expectedCurrentTime = lastExpectedTime + timePassed;

        // If actual time differs from expected by > 2 seconds (seek happened)
        if (Math.abs(currentTime - expectedCurrentTime) > 3) {
          // 3s tolerance
          console.log(
            `[Main] Seek detected: Expected ${expectedCurrentTime.toFixed(1)}, Got ${currentTime.toFixed(1)}`,
          );
          shouldUpdate = true;
        }
      }

      // Update Reference Time
      lastExpectedTime = currentTime;
      lastUpdateTime = now;

      // Update global track state immediately
      lastTrack.currentTime = currentTime;
      lastTrack.duration = progress.duration || lastTrack.duration;

      if (shouldUpdate) {
        // Rate limit updates logic with trailing edge
        const timeSinceLast = now - lastRpcUpdate;
        const limit = isPaused ? 500 : 2000; // Faster updates for pause, 2s for seeks

        if (timeSinceLast > limit) {
          // Can update immediately
          if (discordRpc.pendingUpdate) {
            clearTimeout(discordRpc.pendingUpdate);
            discordRpc.pendingUpdate = null;
          }
          discordRpc.updatePresence(lastTrack);
          lastRpcUpdate = now;
        } else {
          // Rate limited - schedule trailing update
          if (!discordRpc.pendingUpdate) {
            console.log(
              `[Main] RPC rate limited, scheduling update in ${limit - timeSinceLast}ms`,
            );
            discordRpc.pendingUpdate = setTimeout(
              () => {
                discordRpc.pendingUpdate = null;
                console.log("[Main] Sending buffered RPC update");
                discordRpc.updatePresence(lastTrack);
                lastRpcUpdate = Date.now();
              },
              limit - timeSinceLast + 100,
            );
          }
        }
      }
      // Feed progress to Scrobbler (for progress-based scrobbling)
      if (scrobbler) {
        scrobbler.updateProgress(currentTime, progress.duration);
      }

      // Update Mini Player / Web Interface
      miniPlayerServer.updateState({
        currentTime: currentTime,
        paused: isPaused,
        shuffle: progress.shuffle,
        repeat: progress.repeat,
        volume: currentVolume,
      });
    }
  });

  ipcMain.on("scrobble-track-end", (event, details = {}) => {
    if (scrobbler) {
      scrobbler.onTrackEnd();
    }
  });

  // injectTrackDetection moved to global scope

  // Enhanced Native AdBlocker
  const AD_DOMAINS = [
    "doubleclick.net",
    "googleadservices.com",
    "googlesyndication.com",
    "moatads.com",
    "g.doubleclick.net",
  ];

  function setupAdBlocker(enable) {
    if (enable) {
      if (adBlocker) {
        adBlocker.enableBlockingInSession(session.defaultSession);
        console.log("Library AdBlocker: ENABLED");
      } else {
        ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
          adBlocker = blocker;
          adBlocker.enableBlockingInSession(session.defaultSession);
          console.log("Library AdBlocker: ENABLED (Lazy Init)");
        });
      }
    } else {
      if (adBlocker) {
        adBlocker.disableBlockingInSession(session.defaultSession);
        console.log("Library AdBlocker: DISABLED");
      }
    }
  }
});
