const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
} = require("../desktop-helpers");

test("normalizes supported shell themes and rejects unknown values", () => {
  assert.deepEqual(normalizeShellTheme({ accent: "green", surface: "glass" }), {
    accent: "green",
    surface: "glass",
  });
  assert.deepEqual(normalizeShellTheme({ accent: "blue", surface: "daylight" }), {
    accent: "blue",
    surface: "daylight",
  });
  assert.deepEqual(
    normalizeShellTheme({ accent: "javascript:bad", surface: "unknown" }),
    DEFAULT_SHELL_THEME,
  );
});

test("normalizes safe custom shell palettes and rejects injected colors", () => {
  const custom = {
    primary: "#a855f7",
    secondary: "#7c3aed",
    highlight: "#c084fc",
    background: "#050507",
    surface: "#111018",
    glass: "rgba(11, 8, 18, 0.82)",
    border: "rgba(168, 85, 247, 0.24)",
  };
  assert.deepEqual(normalizeShellTheme({ accent: "blue", surface: "glass", custom }).custom, {
    ...custom,
    primaryRgb: "168, 85, 247",
  });
  assert.equal(normalizeShellTheme({ custom: { ...custom, primary: "red; background:url(x)" } }).custom, undefined);
});

test("accepts exact supported service URLs with safe protocols", () => {
  assert.equal(
    parseSupportedServiceUrl("https://music.youtube.com/watch?v=abc").serviceKey,
    "yt",
  );
  assert.equal(
    parseSupportedServiceUrl("https://m.soundcloud.com/artist/track").serviceKey,
    "sc",
  );
  assert.equal(
    parseSupportedServiceUrl("http://127.0.0.1:3939/search").serviceKey,
    "spice_crazy",
  );
  assert.equal(
    parseSupportedServiceUrl("https://music.spice-app.xyz/playlist").serviceKey,
    "spice_crazy",
  );
  assert.equal(
    parseSupportedServiceUrl("https://www.spice-app.xyz/library").serviceKey,
    "spice_crazy",
  );
});

test("rejects hostile suffixes, credentials, and unsafe protocols", () => {
  assert.equal(
    parseSupportedServiceUrl("https://music.youtube.com.attacker.test/"),
    null,
  );
  assert.equal(parseSupportedServiceUrl("http://music.youtube.com/"), null);
  assert.equal(
    parseSupportedServiceUrl("https://user:pass@music.youtube.com/"),
    null,
  );
  assert.equal(parseSupportedServiceUrl("https://localhost:3939/"), null);
});

test("native mode only accepts SPICE URLs", () => {
  assert.equal(
    parseSupportedServiceUrl("https://music.youtube.com/", { nativeMode: true }),
    null,
  );
  assert.equal(
    parseSupportedServiceUrl("http://localhost:3939/", { nativeMode: true })
      .serviceKey,
    "spice_crazy",
  );
});

test("Native launch skips the login gate after account or local-only onboarding", () => {
  assert.equal(
    shouldOpenNativePlayerOnLaunch({
      nativeMode: true,
      onboarded: true,
      account: null,
    }),
    true,
  );
  assert.equal(
    shouldOpenNativePlayerOnLaunch({
      nativeMode: true,
      onboarded: false,
      account: { user: { email: "native@example.com" } },
    }),
    true,
  );
  assert.equal(
    shouldOpenNativePlayerOnLaunch({
      nativeMode: true,
      onboarded: false,
      account: null,
    }),
    false,
  );
  assert.equal(
    shouldOpenNativePlayerOnLaunch({
      nativeMode: false,
      onboarded: true,
      account: { user: { email: "native@example.com" } },
    }),
    false,
  );
});

test("uses Electron navigationHistory and only navigates when available", () => {
  let backCalls = 0;
  const history = {
    canGoBack: () => true,
    goBack: () => {
      backCalls += 1;
    },
  };
  const webContents = { navigationHistory: history };

  assert.equal(getNavigationHistory(webContents), history);
  assert.equal(navigateHistory(history, "back"), true);
  assert.equal(backCalls, 1);
  assert.equal(
    navigateHistory({ canGoForward: () => false, goForward: () => {} }, "forward"),
    false,
  );
});

test("native startup playback yields immediately to an explicit user action", () => {
  assert.equal(
    shouldBlockNativeStartupPlayback({
      waitingForAudioSettings: true,
      guardActive: true,
      userPlaybackIntent: false,
    }),
    true,
  );
  assert.equal(
    shouldBlockNativeStartupPlayback({
      waitingForAudioSettings: true,
      guardActive: true,
      userPlaybackIntent: true,
    }),
    false,
  );
  assert.equal(
    shouldBlockNativeStartupPlayback({
      waitingForAudioSettings: false,
      guardActive: false,
      userPlaybackIntent: false,
    }),
    false,
  );
});

test("wrapper volume uses one attenuation stage below 100 percent", () => {
  assert.deepEqual(resolveWrapperVolumeStages(0.5), {
    totalGain: 0.5,
    mediaVolume: 0.5,
    boostGain: 1,
  });
  assert.deepEqual(resolveWrapperVolumeStages(0), {
    totalGain: 0,
    mediaVolume: 0,
    boostGain: 1,
  });
});

test("wrapper volume reserves Web Audio gain for boosted output", () => {
  assert.deepEqual(resolveWrapperVolumeStages(2), {
    totalGain: 2,
    mediaVolume: 1,
    boostGain: 2,
  });
  assert.deepEqual(resolveWrapperVolumeStages(20), {
    totalGain: 10,
    mediaVolume: 1,
    boostGain: 10,
  });
  assert.deepEqual(resolveWrapperVolumeStages("not-a-volume"), {
    totalGain: 1,
    mediaVolume: 1,
    boostGain: 1,
  });
});

test("audio output device list keeps only unique outputs with default first", () => {
  const devices = normalizeAudioOutputDevices([
    { kind: "audioinput", deviceId: "mic-1", label: "Mic" },
    { kind: "audiooutput", deviceId: "default", label: "System default" },
    { kind: "audiooutput", deviceId: "speakers", label: "Speakers (Realtek)" },
    { kind: "audiooutput", deviceId: "speakers", label: "Duplicate entry" },
    { kind: "audiooutput", deviceId: "", label: "No id" },
    { kind: "audiooutput", deviceId: "hdmi" },
    null,
  ]);

  assert.deepEqual(devices, [
    { deviceId: "default", label: "System default" },
    { deviceId: "speakers", label: "Speakers (Realtek)" },
    { deviceId: "hdmi", label: "Output device 3" },
  ]);
  assert.deepEqual(normalizeAudioOutputDevices(undefined), []);
  assert.deepEqual(normalizeAudioOutputDevices("nope"), []);
});

test("audio output selection falls back to the system default", () => {
  assert.equal(normalizeAudioOutputDeviceSelection("speakers-1"), "speakers-1");
  assert.equal(normalizeAudioOutputDeviceSelection("  default  "), "default");
  assert.equal(normalizeAudioOutputDeviceSelection(""), "default");
  assert.equal(normalizeAudioOutputDeviceSelection("   "), "default");
  assert.equal(normalizeAudioOutputDeviceSelection(null), "default");
  assert.equal(normalizeAudioOutputDeviceSelection(42), "default");
});

test("maps supported desktop platforms to managed local runtimes", () => {
  assert.equal(resolveLocalRuntimePlatform("win32"), "windows");
  assert.equal(resolveLocalRuntimePlatform("linux"), "linux");
  assert.equal(resolveLocalRuntimePlatform("darwin"), "macos");
  assert.equal(resolveLocalRuntimePlatform("freebsd"), null);
});

test("keeps the macOS process alive after the last window closes", () => {
  assert.equal(shouldQuitWhenLastWindowCloses("darwin"), false);
  assert.equal(shouldQuitWhenLastWindowCloses("win32"), true);
  assert.equal(shouldQuitWhenLastWindowCloses("linux"), true);
});

test("configures start on boot only on supported desktop platforms", () => {
  assert.equal(supportsStartOnBoot("win32"), true);
  assert.equal(supportsStartOnBoot("darwin"), true);
  assert.equal(supportsStartOnBoot("linux"), false);
  assert.deepEqual(createLoginItemSettings(false, "win32", "C:\\Spice\\Spice.exe"), {
    openAtLogin: false,
    path: "C:\\Spice\\Spice.exe",
  });
  assert.deepEqual(createLoginItemSettings(true, "darwin", "/Applications/Spice.app"), {
    openAtLogin: true,
  });
});

test("offline library scans keep healthy files when another file disappears mid-scan", async () => {
  const snapshot = await collectOfflineLibraryFiles(
    ["available.mp3", "moved.mp3"],
    async (fileName) => {
      if (fileName === "moved.mp3") {
        const error = new Error("File was moved");
        error.code = "ENOENT";
        throw error;
      }
      return {
        size: 4_096,
        mtime: new Date("2026-07-26T12:00:00.000Z"),
      };
    },
    {
      "available.mp3": { title: "Available" },
      "moved.mp3": { title: "Moved" },
      "deleted.mp3": { title: "Deleted" },
    },
  );

  assert.deepEqual(snapshot.files, [{
    fileName: "available.mp3",
    bytes: 4_096,
    updatedAt: "2026-07-26T12:00:00.000Z",
  }]);
  assert.deepEqual(snapshot.metadata, {
    "available.mp3": { title: "Available" },
  });
  assert.equal(snapshot.metadataChanged, true);
  assert.deepEqual(snapshot.missingFileNames, ["moved.mp3"]);
});

test("audio output device list tolerates hostile and malformed entries", () => {
  const devices = normalizeAudioOutputDevices([
    { kind: "audiooutput", deviceId: "  spaced  ", label: "   " },
    { kind: "audiooutput", deviceId: "default" },
    { kind: "audiooutput", deviceId: "default", label: "Second default entry" },
    { kind: "audiooutput" },
    "not-an-object",
    42,
    null,
    { kind: "audiooutput", deviceId: 12, label: "Numeric id" },
  ]);

  assert.deepEqual(devices, [
    { deviceId: "default", label: "System default output" },
    { deviceId: "spaced", label: "Output device 2" },
  ]);
});

test("wrapper volume stages reject non-finite gains", () => {
  assert.deepEqual(resolveWrapperVolumeStages(Number.NaN), {
    totalGain: 1,
    mediaVolume: 1,
    boostGain: 1,
  });
  assert.deepEqual(resolveWrapperVolumeStages(-5), {
    totalGain: 0,
    mediaVolume: 0,
    boostGain: 1,
  });
  assert.deepEqual(resolveWrapperVolumeStages(Number.POSITIVE_INFINITY), {
    totalGain: 1,
    mediaVolume: 1,
    boostGain: 1,
  }, "non-finite input falls back to the unity default");
});
