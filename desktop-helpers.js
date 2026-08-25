const ACCENT_THEMES = new Set([
  "pink",
  "blue",
  "orange",
  "green",
  "gold",
  "crimson",
  "deeppurple",
]);

const SURFACE_THEMES = new Set(["midnight", "glass", "solid", "aurora", "daylight"]);

const DEFAULT_SHELL_THEME = Object.freeze({
  accent: "deeppurple",
  surface: "midnight",
});

const CUSTOM_THEME_COLOR_KEYS = [
  "primary",
  "secondary",
  "highlight",
  "background",
  "surface",
  "glass",
  "border",
];

function normalizeLiteralColor(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  const hex = candidate.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) return `#${hex[1]}`;
  const rgb = candidate.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  const isRgba = candidate.startsWith("rgba(");
  if (isRgba !== (rgb[4] !== undefined)) return null;
  if (!isRgba) return `rgb(${channels.join(", ")})`;
  const alpha = Number(rgb[4]);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function colorRgbChannels(color) {
  if (color.startsWith("#")) {
    return [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]
      .map((channel) => Number.parseInt(channel, 16));
  }
  const match = color.match(/^rgba?\((\d+), (\d+), (\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function normalizeCustomShellTheme(value) {
  if (!value || typeof value !== "object") return null;
  const colors = {};
  for (const key of CUSTOM_THEME_COLOR_KEYS) {
    const color = normalizeLiteralColor(value[key]);
    if (!color) return null;
    colors[key] = color;
  }
  const channels = colorRgbChannels(colors.primary);
  if (!channels) return null;
  return { ...colors, primaryRgb: channels.join(", ") };
}

function normalizeShellTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  const theme = {
    accent: ACCENT_THEMES.has(source.accent)
      ? source.accent
      : DEFAULT_SHELL_THEME.accent,
    surface: SURFACE_THEMES.has(source.surface)
      ? source.surface
      : DEFAULT_SHELL_THEME.surface,
  };
  const custom = normalizeCustomShellTheme(source.custom);
  return custom ? { ...theme, custom } : theme;
}

function parseSupportedServiceUrl(value, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  const isLocalRuntime =
    parsed.protocol === "http:" &&
    (host === "127.0.0.1" || host === "localhost") &&
    parsed.port === "3939";
  const isYtMusic =
    parsed.protocol === "https:" &&
    (host === "music.youtube.com" || host === "www.music.youtube.com");
  const isSoundCloud =
    parsed.protocol === "https:" &&
    (host === "soundcloud.com" ||
      host === "www.soundcloud.com" ||
      host === "m.soundcloud.com");
  const isRemoteSpice =
    parsed.protocol === "https:" &&
    (
      host === "music.spice-app.xyz"
      || host === "spice-app.xyz"
      || host === "www.spice-app.xyz"
      || host === "install.spice-app.xyz"
    );

  const serviceKey = isYtMusic
    ? "yt"
    : isSoundCloud
      ? "sc"
      : isLocalRuntime || isRemoteSpice
        ? "spice_crazy"
        : null;

  if (!serviceKey || (options.nativeMode && serviceKey !== "spice_crazy")) {
    return null;
  }

  return {
    url: parsed.toString(),
    serviceKey,
    isLocalRuntime,
  };
}

function getNavigationHistory(webContents) {
  if (!webContents) return null;
  return webContents.navigationHistory || webContents;
}

function canNavigate(history, direction) {
  if (!history) return false;
  const method = direction === "forward" ? "canGoForward" : "canGoBack";
  return typeof history[method] === "function" && history[method]();
}

function navigateHistory(history, direction) {
  if (!canNavigate(history, direction)) return false;
  const method = direction === "forward" ? "goForward" : "goBack";
  if (typeof history[method] !== "function") return false;
  history[method]();
  return true;
}

function shouldBlockNativeStartupPlayback({
  waitingForAudioSettings = false,
  guardActive = false,
  userPlaybackIntent = false,
} = {}) {
  return !userPlaybackIntent && (waitingForAudioSettings || guardActive);
}

function resolveWrapperVolumeStages(value) {
  const requestedGain = Number(value);
  const totalGain = Number.isFinite(requestedGain)
    ? Math.max(0, Math.min(10, requestedGain))
    : 1;
  return {
    totalGain,
    mediaVolume: Math.min(1, totalGain),
    boostGain: totalGain > 1 ? totalGain : 1,
  };
}

function normalizeAudioOutputDevices(devices) {
  const list = Array.isArray(devices) ? devices : [];
  const seen = new Set();
  const defaults = [];
  const rest = [];
  for (const device of list) {
    if (!device || device.kind !== "audiooutput") continue;
    const deviceId = typeof device.deviceId === "string" ? device.deviceId.trim() : "";
    if (!deviceId || seen.has(deviceId)) continue;
    seen.add(deviceId);
    const label = typeof device.label === "string" && device.label.trim()
      ? device.label.trim()
      : "";
    const entry = { deviceId, label };
    if (deviceId === "default") defaults.push(entry);
    else rest.push(entry);
  }
  const ordered = [...defaults, ...rest];
  return ordered.map((entry, index) => ({
    deviceId: entry.deviceId,
    label: entry.label
      || (entry.deviceId === "default" ? "System default output" : `Output device ${index + 1}`),
  }));
}

function normalizeAudioOutputDeviceSelection(value) {
  if (typeof value !== "string") return "default";
  const trimmed = value.trim();
  return trimmed || "default";
}

function resolveLocalRuntimePlatform(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "macos";
  return null;
}

function shouldQuitWhenLastWindowCloses(platform = process.platform) {
  return platform !== "darwin";
}

function supportsStartOnBoot(platform = process.platform) {
  return platform === "win32" || platform === "darwin";
}

function createLoginItemSettings(
  enabled,
  platform = process.platform,
  executablePath = process.execPath,
) {
  const settings = { openAtLogin: enabled === true };
  if (platform === "win32" && typeof executablePath === "string" && executablePath) {
    settings.path = executablePath;
  }
  return settings;
}

function shouldOpenNativePlayerOnLaunch({ nativeMode, onboarded, account } = {}) {
  return Boolean(nativeMode && (onboarded === true || account));
}

async function collectOfflineLibraryFiles(fileNames, statFile, metadata = {}) {
  const safeNames = Array.isArray(fileNames)
    ? fileNames.filter((fileName) => typeof fileName === "string" && fileName)
    : [];
  const results = await Promise.all(safeNames.map(async (fileName) => {
    try {
      const stat = await statFile(fileName);
      if (!stat || typeof stat.size !== "number" || !stat.mtime) return null;
      return {
        fileName,
        bytes: Math.max(0, stat.size),
        updatedAt: new Date(stat.mtime).toISOString(),
      };
    } catch (_) {
      // Files can be moved or deleted between readdir and stat. One missing
      // song must not make the entire Downloads library disappear.
      return null;
    }
  }));
  const files = results.filter(Boolean);
  const existingNames = new Set(files.map((entry) => entry.fileName));
  const nextMetadata = {};
  for (const [fileName, value] of Object.entries(
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
  )) {
    if (existingNames.has(fileName) && value && typeof value === "object" && !Array.isArray(value)) {
      nextMetadata[fileName] = value;
    }
  }
  return {
    files,
    metadata: nextMetadata,
    metadataChanged: Object.keys(nextMetadata).length !== Object.keys(metadata || {}).length,
    missingFileNames: safeNames.filter((fileName) => !existingNames.has(fileName)),
  };
}

module.exports = {
  DEFAULT_SHELL_THEME,
  normalizeShellTheme,
  parseSupportedServiceUrl,
  getNavigationHistory,
  navigateHistory,
  shouldBlockNativeStartupPlayback,
  resolveWrapperVolumeStages,
  normalizeAudioOutputDevices,
  normalizeAudioOutputDeviceSelection,
  resolveLocalRuntimePlatform,
  shouldQuitWhenLastWindowCloses,
  supportsStartOnBoot,
  createLoginItemSettings,
  shouldOpenNativePlayerOnLaunch,
  collectOfflineLibraryFiles,
};
