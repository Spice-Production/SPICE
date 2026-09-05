const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough, Readable } = require("node:stream");

const {
  SpiceLocalRuntimeManager,
  clearMacRuntimeQuarantine,
  compareVersions,
  readRuntimeArchitectures,
  resolveRuntimeDownloadUrl,
  runtimePlatformConfig,
  shouldInstallRuntimeUpdate,
} = require("../spice-local-runtime-manager");

test("compareVersions orders numeric runtime versions", () => {
  assert.equal(compareVersions("1.0.10", "1.0.9") > 0, true);
  assert.equal(compareVersions("1.0.0", "1.0") === 0, true);
  assert.equal(compareVersions("1.1.0-beta.1", "1.0.99") > 0, true);
});

test("shouldInstallRuntimeUpdate only updates when the manifest is newer or local state is missing", () => {
  assert.equal(shouldInstallRuntimeUpdate(null, "1.0.0"), true);
  assert.equal(shouldInstallRuntimeUpdate("unknown", "1.0.0"), true);
  assert.equal(shouldInstallRuntimeUpdate("1.0.0", "1.0.1"), true);
  assert.equal(shouldInstallRuntimeUpdate("1.0.1", "1.0.1"), false);
  assert.equal(shouldInstallRuntimeUpdate("1.0.2", "1.0.1"), false);
  assert.equal(shouldInstallRuntimeUpdate("1.0.2", null), false);
});

test("resolveRuntimeDownloadUrl keeps runtime downloads on http origins", () => {
  assert.equal(
    resolveRuntimeDownloadUrl(
      "/downloads/spice-local-windows.zip",
      "https://music.spice-app.xyz/api/updates/local-windows",
    ),
    "https://music.spice-app.xyz/downloads/spice-local-windows.zip",
  );
});

test("runtimePlatformConfig selects platform-correct update artifacts", () => {
  assert.deepEqual(runtimePlatformConfig("win32"), {
    id: "windows",
    archiveName: "spice-local-windows.zip",
    manifestUrl: "https://music.spice-app.xyz/api/updates/local-windows",
    downloadUrl: "https://github.com/Anti-Depressants-Dev-Team/spice/releases/download/spice-local-runtime/spice-local-windows.zip",
  });
  assert.deepEqual(runtimePlatformConfig("linux"), {
    id: "linux",
    archiveName: "spice-local-linux.zip",
    manifestUrl: "https://music.spice-app.xyz/api/updates/local-linux",
    downloadUrl: "https://github.com/Anti-Depressants-Dev-Team/spice/releases/download/spice-local-runtime/spice-local-linux.zip",
  });
  assert.deepEqual(runtimePlatformConfig("darwin"), {
    id: "macos",
    archiveName: "spice-local-macos.zip",
    manifestUrl: "https://music.spice-app.xyz/api/updates/local-macos",
    downloadUrl: "https://github.com/Anti-Depressants-Dev-Team/spice/releases/download/spice-local-runtime/spice-local-macos.zip",
  });
});

test("macOS clears downloaded runtime quarantine metadata before launch", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "spice-runtime-quarantine-"));
  const calls = [];
  try {
    const cleared = await clearMacRuntimeQuarantine(
      runtimeDir,
      "darwin",
      (executable, args, options) => {
        calls.push({ executable, args, options });
        const child = new EventEmitter();
        child.stderr = new PassThrough();
        process.nextTick(() => child.emit("exit", 0, null));
        return child;
      },
    );
    assert.equal(cleared, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].executable, "/usr/bin/xattr");
    assert.deepEqual(calls[0].args, ["-cr", runtimeDir]);
    assert.equal(calls[0].options.stdio[2], "pipe");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("macOS runtime preparation failures explain the recovery path", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "spice-runtime-quarantine-"));
  try {
    await assert.rejects(
      clearMacRuntimeQuarantine(
        runtimeDir,
        "darwin",
        () => {
          const child = new EventEmitter();
          child.stderr = new PassThrough();
          process.nextTick(() => {
            child.stderr.write("Operation not permitted");
            child.emit("exit", 1, null);
          });
          return child;
        },
      ),
      /System Settings → Privacy & Security[\s\S]*Operation not permitted/,
    );
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("runtime status reports packaged Apple Silicon and Intel support", () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "spice-runtime-architectures-"));
  try {
    fs.writeFileSync(
      path.join(runtimeDir, "spice-local-manifest.json"),
      JSON.stringify({ version: "1.0.154", architectures: ["arm64", "x64", "unknown"] }),
    );
    assert.deepEqual(readRuntimeArchitectures(runtimeDir), ["arm64", "x64"]);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

function makeStartTestRig({ answerAfterSpawn = false, onSpawn } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spice-runtime-start-"));
  fs.mkdirSync(path.join(rootDir, "runtime", "apps", "backend"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "runtime", "apps", "backend", "server.js"), "// stub");

  const flap = { running: false };
  const spawnCalls = [];
  const manager = new SpiceLocalRuntimeManager({
    app: { getPath: () => rootDir },
    platform: "linux",
    execPath: process.execPath,
    rootDir,
    fetch: async () => ({ ok: flap.running }),
    onStatus: () => {},
    startTimeoutMs: 400,
    spawnImpl: (...args) => {
      spawnCalls.push(args);
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.pid = 2147483647;
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        child.emit("exit", 0, null);
      };
      // Model reality: the health endpoint answers only once spawned.
      if (answerAfterSpawn) flap.running = true;
      if (onSpawn) onSpawn(child, flap);
      return child;
    },
  });
  return { rootDir, manager, spawnCalls };
}

test("concurrent starts share one spawn instead of racing for the port", async () => {
  const { rootDir, manager, spawnCalls } = makeStartTestRig();
  try {
    const first = manager.start();
    const second = manager.start();
    await assert.rejects(first, /did not answer/);
    await assert.rejects(second, /did not answer/);
    assert.equal(spawnCalls.length, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("a runtime that crashes on boot surfaces its last log line", async () => {
  const { rootDir, manager } = makeStartTestRig({
    onSpawn: (child) => {
      child.stderr.write("boom failure line");
      setImmediate(() => child.emit("exit", 1, null));
    },
  });
  try {
    await assert.rejects(manager.start(), /boom failure line/);
    const status = await manager.getStatus();
    assert.match(status.message, /stopped unexpectedly/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("a runtime that dies after starting is reported, not silent", async () => {
  const { rootDir, manager, spawnCalls } = makeStartTestRig({ answerAfterSpawn: true });
  try {
    const started = manager.start();
    await started;
    manager.child.emit("exit", 1, null);
    const status = await manager.getStatus();
    assert.match(status.message, /stopped unexpectedly/);
    assert.match(status.message, /code 1/);
    assert.equal(spawnCalls.length, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("an intentional stop stays quiet about crashes", async () => {
  const { rootDir, manager } = makeStartTestRig({ answerAfterSpawn: true });
  try {
    await manager.start();
    const status = await manager.stop();
    assert.doesNotMatch(status.message, /unexpectedly/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

function makeLifecycleRig(fetchImpl) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spice-runtime-lifecycle-"));
  const manager = new SpiceLocalRuntimeManager({
    app: { getPath: () => rootDir },
    platform: "linux",
    execPath: process.execPath,
    rootDir,
    fetch: fetchImpl,
    onStatus: () => {},
  });
  return { rootDir, manager };
}

test("committing a staged runtime swaps atomically with no leftovers", () => {
  const { rootDir, manager } = makeLifecycleRig(async () => ({ ok: false }));
  try {
    fs.mkdirSync(path.join(rootDir, "runtime"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "runtime", "live.txt"), "live");
    const staging = path.join(rootDir, "staging");
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, "new.txt"), "new");
    manager.commitStagedRuntime(staging);
    assert.equal(fs.existsSync(path.join(rootDir, "runtime", "new.txt")), true);
    assert.equal(fs.existsSync(path.join(rootDir, "runtime", "live.txt")), false);
    assert.deepEqual(
      fs.readdirSync(rootDir).filter((name) => name.includes(".bak-")),
      [],
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("a failed swap rolls back to the live runtime", () => {
  const { rootDir, manager } = makeLifecycleRig(async () => ({ ok: false }));
  try {
    fs.mkdirSync(path.join(rootDir, "runtime"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "runtime", "live.txt"), "live");
    assert.throws(
      () => manager.commitStagedRuntime(path.join(rootDir, "no-such-staging")),
      /ENOENT/,
    );
    assert.equal(fs.readFileSync(path.join(rootDir, "runtime", "live.txt"), "utf8"), "live");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("install failures name their cause instead of freezing progress text", async () => {
  const { rootDir, manager } = makeLifecycleRig(async () => {
    throw new Error("offline");
  });
  try {
    await assert.rejects(manager.installFromManifest(null), /offline/);
    const status = await manager.getStatus();
    assert.match(status.message, /install failed:.*offline/);
    assert.equal(status.busy, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("update-check failures name their cause", async () => {
  const { rootDir, manager } = makeLifecycleRig(async () => {
    throw new Error("offline");
  });
  try {
    // The original error still propagates to callers; the diagnosis lands
    // on the status message instead.
    await assert.rejects(manager.installLatestIfAvailable(), /offline/);
    const status = await manager.getStatus();
    assert.match(status.message, /update check failed:.*offline/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("downloads map network and disk failures to recovery guidance", async () => {
  const offline = makeLifecycleRig(async () => {
    throw new Error("socket hang up");
  });
  try {
    await assert.rejects(
      offline.manager.downloadFile("https://example.com/runtime.zip", path.join(offline.rootDir, "rt.zip")),
      /Check your connection and retry/,
    );
  } finally {
    fs.rmSync(offline.rootDir, { recursive: true, force: true });
  }

  const fullDisk = makeLifecycleRig(async () => ({
    ok: true,
    body: (() => {
      const stream = new Readable({ read() {} });
      process.nextTick(() =>
        stream.destroy(Object.assign(new Error("no space left on device"), { code: "ENOSPC" })),
      );
      return stream;
    })(),
  }));
  try {
    await assert.rejects(
      fullDisk.manager.downloadFile("https://example.com/runtime.zip", path.join(fullDisk.rootDir, "rt.zip")),
      /disk is full\. Free space and retry/,
    );
  } finally {
    fs.rmSync(fullDisk.rootDir, { recursive: true, force: true });
  }
});
