const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const { extractRuntimeArchive } = require("./runtime-archive");

const DEFAULT_LOCAL_URL = "http://127.0.0.1:3939/";
const RUNTIME_PLATFORMS = {
  win32: {
    id: "windows",
    archiveName: "spice-local-windows.zip",
  },
  linux: {
    id: "linux",
    archiveName: "spice-local-linux.zip",
  },
  darwin: {
    id: "macos",
    archiveName: "spice-local-macos.zip",
  },
};

function runtimePlatformConfig(platform = process.platform) {
  const base = RUNTIME_PLATFORMS[platform];
  if (!base) return null;
  return {
    ...base,
    manifestUrl: `https://music.spice-app.xyz/api/updates/local-${base.id}`,
    downloadUrl: `https://github.com/Anti-Depressants-Dev-Team/spice/releases/download/spice-local-runtime/${base.archiveName}`,
  };
}

class SpiceLocalRuntimeManager {
  constructor(options) {
    this.app = options.app;
    this.platform = options.platform || process.platform;
    this.execPath = options.execPath || process.execPath;
    this.platformConfig = runtimePlatformConfig(this.platform);
    this.fetch = options.fetch || global.fetch;
    this.localUrl = normalizeServiceUrl(options.localUrl || DEFAULT_LOCAL_URL);
    this.manifestUrl = options.manifestUrl || this.platformConfig?.manifestUrl || "";
    this.rootDir = options.rootDir || path.join(this.app.getPath("userData"), "spice-local-runtime");
    this.runtimeDir = path.join(this.rootDir, "runtime");
    this.tempDir = path.join(this.rootDir, "tmp");
    this.bundledRuntimeDir = options.bundledRuntimeDir || null;
    this.child = null;
    this.childOutput = "";
    this.busy = false;
    this.message = "Ready";
    this.runState = "idle";
    this.startPromise = null;
    this.spawnImpl = options.spawnImpl || null;
    this.startTimeoutMs = options.startTimeoutMs || 15000;
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  }

  get supported() {
    return Boolean(this.platformConfig);
  }

  async getStatus() {
    const installedVersion = this.getInstalledVersion();
    const bundledVersion = this.getBundledVersion();
    const running = await this.isRunning();

    return {
      supported: this.supported,
      platform: this.platformConfig?.id || this.platform,
      installed: Boolean(installedVersion),
      installedVersion,
      bundled: Boolean(bundledVersion),
      bundledVersion,
      running,
      busy: this.busy,
      message: this.message,
      installDir: this.runtimeDir,
      bundledDir: this.bundledRuntimeDir,
      localUrl: this.localUrl,
      manifestUrl: this.manifestUrl,
      runtimeLog: this.childOutput,
      architectures: readRuntimeArchitectures(this.runtimeDir),
    };
  }

  async ensureBundledRuntimeInstalled() {
    if (!this.supported) {
      throw new Error("The managed SPICE local runtime installer is not supported on this platform.");
    }
    if (!this.hasBundledRuntime()) {
      return this.getStatus();
    }

    const installedVersion = this.getInstalledVersion();
    const bundledVersion = this.getBundledVersion();
    if (installedVersion && bundledVersion && compareVersions(installedVersion, bundledVersion) >= 0) {
      return this.getStatus();
    }

    if ((await this.isRunning()) && !this.child) {
      throw new Error("SPICE local runtime is already running. Close the external runtime before replacing it with the bundled runtime.");
    }

    if (this.busy) {
      throw new Error("SPICE local runtime is already busy.");
    }

    this.busy = true;
    this.message = `Installing bundled SPICE local runtime ${bundledVersion || "included"}...`;
    this.emitStatus();

    const scratchDir = path.join(this.tempDir, `bundled-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
    const stagingDir = path.join(scratchDir, "runtime");

    try {
      fs.mkdirSync(stagingDir, { recursive: true });
      copyDirectory(this.bundledRuntimeDir, stagingDir);

      await this.stop();
      this.commitStagedRuntime(stagingDir);
      await clearMacRuntimeQuarantine(this.runtimeDir, this.platform);

      this.message = `Bundled SPICE local runtime ${bundledVersion || "included"} installed.`;
      this.emitStatus();
      return this.getStatus();
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
      this.busy = false;
      this.emitStatus();
    }
  }

  async fetchManifest() {
    if (!this.fetch) {
      throw new Error("No fetch implementation is available for runtime updates.");
    }

    const response = await this.fetch(this.manifestUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`SPICE runtime manifest request failed with status ${response.status}.`);
    }

    return response.json();
  }

  async installOrUpdate() {
    return this.installFromManifest(null);
  }

  async installLatestIfAvailable() {
    if (!this.supported) {
      throw new Error("The managed SPICE local runtime installer is not supported on this platform.");
    }
    if (this.busy) {
      throw new Error("SPICE local runtime is already busy.");
    }

    if (await this.isRunning()) {
      this.message = "SPICE local runtime is already running. Update check deferred until the next start.";
      this.emitStatus();
      return this.getStatus();
    }

    this.message = "Checking for SPICE local runtime updates...";
    this.emitStatus();

    const manifest = await this.fetchManifest().catch((error) => {
      this.message = `SPICE local runtime update check failed: ${error && error.message ? error.message : "unknown error"}`;
      this.emitStatus();
      throw error;
    });
    const latestVersion = typeof manifest?.version === "string" ? manifest.version : null;
    const installedVersion = this.getInstalledVersion();

    if (!shouldInstallRuntimeUpdate(installedVersion, latestVersion)) {
      this.message = `SPICE local runtime ${installedVersion || "latest"} is up to date.`;
      this.emitStatus();
      return this.getStatus();
    }

    return this.installFromManifest(manifest);
  }

  commitStagedRuntime(stagingDir) {
    // Atomic-ish swap: the old code deleted the live runtime BEFORE the
    // replacement rename, so a failed commit (disk-full, AV lock,
    // permissions) left the user with NO runtime at all. Park the live tree
    // aside and roll back to it when the commit fails.
    fs.mkdirSync(this.rootDir, { recursive: true });
    const backupDir = `${this.runtimeDir}.bak-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const hadLive = fs.existsSync(this.runtimeDir);
    try {
      if (hadLive) fs.renameSync(this.runtimeDir, backupDir);
      fs.renameSync(stagingDir, this.runtimeDir);
    } catch (error) {
      try {
        if (hadLive && fs.existsSync(backupDir) && !fs.existsSync(this.runtimeDir)) {
          fs.renameSync(backupDir, this.runtimeDir);
        }
      } catch {}
      throw error;
    }
    if (hadLive) fs.rmSync(backupDir, { recursive: true, force: true });
  }

  async installFromManifest(manifestOverride) {
    if (!this.supported) {
      throw new Error("The managed SPICE local runtime installer is not supported on this platform.");
    }
    if (this.busy) {
      throw new Error("SPICE local runtime is already busy.");
    }

    this.busy = true;
    this.message = manifestOverride ? "Preparing runtime update..." : "Fetching runtime manifest...";
    this.emitStatus();

    const scratchDir = path.join(this.tempDir, `install-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
    const zipPath = path.join(scratchDir, this.platformConfig.archiveName);
    const stagingDir = path.join(scratchDir, "runtime");

    try {
      if ((await this.isRunning()) && !this.child) {
        throw new Error("SPICE local runtime is already running. Close the external runtime before updating it.");
      }

      fs.mkdirSync(stagingDir, { recursive: true });
      const manifest = manifestOverride || await this.fetchManifest();
      const download = manifest && manifest.download ? manifest.download : null;
      const downloadUrl = resolveRuntimeDownloadUrl(
        download && download.url,
        this.manifestUrl,
        this.platformConfig.downloadUrl,
      );
      if (!downloadUrl) {
        throw new Error("The SPICE local runtime manifest does not include a download URL.");
      }

      this.message = `Downloading SPICE local runtime ${manifest.version || "latest"}...`;
      this.emitStatus();
      await this.downloadFile(downloadUrl, zipPath);

      if (download && download.sha256) {
        this.message = "Verifying SPICE local runtime package...";
        this.emitStatus();
        const actual = await sha256File(zipPath);
        if (actual.toLowerCase() !== String(download.sha256).toLowerCase()) {
          throw new Error(`Downloaded runtime hash mismatch. Expected ${download.sha256}, got ${actual}.`);
        }
      }

      this.message = "Extracting SPICE local runtime...";
      this.emitStatus();
      await extractRuntimeArchive(zipPath, stagingDir);

      await this.stop();
      this.commitStagedRuntime(stagingDir);
      await clearMacRuntimeQuarantine(this.runtimeDir, this.platform);

      this.message = `SPICE local runtime ${manifest.version || "latest"} installed.`;
      this.emitStatus();
      return this.getStatus();
    } catch (error) {
      // Name the failure: without this the status message froze at the last
      // progress string ("Downloading…/Verifying…/Extracting…") with
      // busy=false, so users could not tell the install failed or why.
      this.message = `SPICE local runtime install failed: ${error && error.message ? error.message : "unknown error"}`;
      this.emitStatus();
      throw error;
    } finally {
      fs.rmSync(scratchDir, { recursive: true, force: true });
      this.busy = false;
      this.emitStatus();
    }
  }

  async start() {
    // Concurrency guard: resolveServiceUrl can be re-entered (service
    // switches, retries) while a start is still awaiting its health check.
    // Without this, two spawns race for port 3939 and the loser crashes.
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._startInner().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async _startInner() {
    if (!this.supported) {
      throw new Error("The managed SPICE local runtime starter is not supported on this platform.");
    }

    if (await this.isRunning()) {
      this.message = "SPICE local runtime is already running.";
      this.emitStatus();
      return this.getStatus();
    }

    let serverFile = runtimeServerFile(this.runtimeDir);
    if (!fs.existsSync(serverFile)) {
      if (this.hasBundledRuntime()) {
        await this.ensureBundledRuntimeInstalled();
        serverFile = runtimeServerFile(this.runtimeDir);
      } else {
        throw new Error("SPICE local runtime is not installed yet.");
      }
    }

    prepareRuntimeExecutables(this.runtimeDir, this.platform);
    await clearMacRuntimeQuarantine(this.runtimeDir, this.platform);
    this.childOutput = "";
    this.runState = "starting";
    this.child = (this.spawnImpl || spawn)(
      this.execPath,
      [serverFile],
      {
        cwd: this.runtimeDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          SPICE_RUNTIME_TARGET: "local",
          SPICE_FFMPEG_PATH: process.env.SPICE_FFMPEG_PATH || path.join(
            this.runtimeDir,
            "node_modules",
            "ffmpeg-static",
            this.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
          ),
          HOSTNAME: process.env.SPICE_LOCAL_HOSTNAME || "127.0.0.1",
          PORT: process.env.SPICE_LOCAL_PORT || "3939",
          SPICE_CLOUD_API_ORIGIN: process.env.SPICE_CLOUD_API_ORIGIN || "https://music.spice-app.xyz",
          SPICE_LOCAL_UPDATE_MANIFEST_URL: this.manifestUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    this.child.stdout?.on("data", (chunk) => this.captureChildOutput(chunk));
    this.child.stderr?.on("data", (chunk) => this.captureChildOutput(chunk));
    this.child.once("error", (error) => {
      this.captureChildOutput(error && error.message ? error.message : String(error));
    });
    this.child.once("exit", (code, signal) => {
      const unexpected = this.runState === "starting" || this.runState === "running";
      if (!this.childOutput.trim()) {
        this.captureChildOutput(`Runtime exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}.`);
      }
      this.child = null;
      if (unexpected) {
        // A post-start exit used to go silent (status kept implying the
        // runtime was fine while every media request failed). Record the
        // crash with its last log line so the UI and debug.log name it.
        this.runState = "idle";
        const detail = lastRuntimeLogLine(this.childOutput);
        this.message =
          `SPICE local runtime stopped unexpectedly (code ${code ?? "unknown"}` +
          `${signal ? `, signal ${signal}` : ""}).` +
          `${detail ? ` Last log: ${detail}` : " Restart SPICE to launch it again."}`;
      }
      this.emitStatus();
    });

    this.message = "Starting SPICE local runtime...";
    this.emitStatus();
    try {
      await this.waitUntilRunning(this.startTimeoutMs);
    } catch (error) {
      this.runState = "idle";
      await this.stop().catch(() => {});
      throw error;
    }
    this.runState = "running";
    this.message = "SPICE local runtime is running.";
    this.emitStatus();
    return this.getStatus();
  }

  async stop() {
    // Mark intentional first: the child's exit event fires after the kill,
    // and the handler must stay quiet for deliberate stops while still
    // reporting real crashes.
    this.runState = "idle";
    if (!this.child) {
      // Keep a crash/timeout diagnosis: overwriting it here hid the real
      // cause behind "Only a runtime..." after boot failures.
      if (!/stopped unexpectedly|did not answer/.test(this.message || "")) {
        this.message = "Only a runtime started by this desktop app can be stopped here.";
      }
      this.emitStatus();
      return this.getStatus();
    }

    if (this.child && !this.child.killed) {
      await killProcessTree(this.child.pid, this.platform).catch(() => {
        this.child.kill();
      });
      this.child = null;
    }
    return this.getStatus();
  }

  async waitUntilRunning(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isRunning()) return true;
      if (!this.child) break;
      await delay(500);
    }
    const diagnostic = lastRuntimeLogLine(this.childOutput);
    throw new Error(
      `SPICE local runtime did not answer before the startup timeout.${diagnostic ? ` ${diagnostic}` : ""}`,
    );
  }

  async isRunning() {
    if (!this.fetch) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await this.fetch(new URL("/api/runtime", this.localUrl).toString(), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      return Boolean(response && response.ok);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  getInstalledVersion() {
    return readRuntimeVersion(this.runtimeDir);
  }

  getBundledVersion() {
    return readRuntimeVersion(this.bundledRuntimeDir);
  }

  hasBundledRuntime() {
    return Boolean(this.bundledRuntimeDir && fs.existsSync(runtimeServerFile(this.bundledRuntimeDir)));
  }

  async downloadFile(url, targetPath) {
    if (!this.fetch) {
      throw new Error("No fetch implementation is available for runtime downloads.");
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    let response;
    try {
      response = await this.fetch(url);
    } catch (error) {
      throw new Error(
        `SPICE runtime download failed: ${error && error.message ? error.message : "network error"}. Check your connection and retry.`,
      );
    }
    if (!response.ok) {
      throw new Error(`SPICE runtime download failed with status ${response.status}.`);
    }

    try {
      await pipeline(response.body, fs.createWriteStream(targetPath));
    } catch (error) {
      // A truncated stream or full disk otherwise surfaces later as an
      // opaque extract error behind a stale "Extracting…" message.
      if (error && error.code === "ENOSPC") {
        throw new Error("SPICE runtime download failed: disk is full. Free space and retry.");
      }
      if (error && (error.code === "EACCES" || error.code === "EPERM")) {
        throw new Error(`SPICE runtime download failed: cannot write to ${targetPath}. Check folder permissions and retry.`);
      }
      throw error;
    }
  }

  emitStatus() {
    this.getStatus()
      .then((status) => this.onStatus(status))
      .catch(() => {});
  }

  captureChildOutput(chunk) {
    const text = String(chunk || "").replace(/\u0000/g, "");
    if (!text) return;
    this.childOutput = `${this.childOutput}${text}`.slice(-12000);
  }
}

function normalizeServiceUrl(url) {
  const value = String(url || "").trim();
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveRuntimeDownloadUrl(value, manifestUrl, fallbackUrl = runtimePlatformConfig()?.downloadUrl || null) {
  if (!value || !String(value).trim()) return fallbackUrl;

  try {
    const parsed = new URL(String(value).trim(), manifestUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {}

  return fallbackUrl;
}

function runtimeServerFile(runtimeDir) {
  return path.join(runtimeDir, "apps", "backend", "server.js");
}

function prepareRuntimeExecutables(runtimeDir, platform = process.platform) {
  if (!runtimeDir || platform === "win32") return;
  const candidates = [
    path.join(runtimeDir, "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(runtimeDir, "apps", "backend", "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(runtimeDir, "start-spice-local.sh"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.chmodSync(candidate, 0o755);
    } catch (error) {
      throw new Error(
        `SPICE could not make the local runtime executable at ${candidate}. `
        + `Check the folder permissions and retry. ${error && error.message ? error.message : ""}`.trim(),
      );
    }
  }
}

function clearMacRuntimeQuarantine(
  runtimeDir,
  platform = process.platform,
  spawnProcess = spawn,
) {
  if (platform !== "darwin" || !runtimeDir || !fs.existsSync(runtimeDir)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    let stderr = "";
    let child;
    try {
      // The runtime is downloaded independently of the signed Electron app.
      // Clear quarantine metadata recursively before Node or FFmpeg is
      // launched so Gatekeeper does not fail later with an opaque EACCES.
      child = spawnProcess("/usr/bin/xattr", ["-cr", runtimeDir], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      reject(macRuntimePreparationError(runtimeDir, error));
      return;
    }
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk || "")}`.slice(-2000);
    });
    child.once("error", (error) => reject(macRuntimePreparationError(runtimeDir, error)));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      reject(macRuntimePreparationError(
        runtimeDir,
        new Error(
          stderr.trim()
          || `xattr exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}.`,
        ),
      ));
    });
  });
}

function macRuntimePreparationError(runtimeDir, cause) {
  return new Error(
    `macOS could not prepare the downloaded SPICE runtime at ${runtimeDir}. `
    + `Check that SPICE can write to this folder, then retry. If macOS still blocks it, `
    + `open System Settings → Privacy & Security and allow SPICE. `
    + `${cause && cause.message ? cause.message : ""}`.trim(),
  );
}

function lastRuntimeLogLine(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1)?.slice(0, 500) || "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRuntimeVersion(runtimeDir) {
  if (!runtimeDir) return null;
  const manifestPath = path.join(runtimeDir, "spice-local-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

function readRuntimeArchitectures(runtimeDir) {
  if (!runtimeDir) return [];
  const manifestPath = path.join(runtimeDir, "spice-local-manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Array.isArray(manifest.architectures)
      ? manifest.architectures.filter((value) => value === "arm64" || value === "x64")
      : [];
  } catch {
    return [];
  }
}

function compareVersions(left, right) {
  const leftParts = String(left || "").split(".").map(parseVersionPart);
  const rightParts = String(right || "").split(".").map(parseVersionPart);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseVersionPart(part) {
  const match = String(part || "").match(/^\d+/);
  return match ? Number(match[0]) : 0;
}

function shouldInstallRuntimeUpdate(installedVersion, latestVersion) {
  if (!installedVersion) return true;
  if (installedVersion === "unknown") return true;
  if (!latestVersion) return false;
  return compareVersions(installedVersion, latestVersion) < 0;
}

function copyDirectory(sourceDir, destinationDir) {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error("Bundled SPICE local runtime is missing.");
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function killProcessTree(pid, platform = process.platform) {
  if (platform !== "win32") {
    return new Promise((resolve, reject) => {
      try {
        process.kill(pid, "SIGTERM");
        setTimeout(resolve, 250);
      } catch (error) {
        reject(error);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`taskkill exited with code ${code}.`));
    });
  });
}

module.exports = {
  SpiceLocalRuntimeManager,
  compareVersions,
  resolveRuntimeDownloadUrl,
  runtimePlatformConfig,
  shouldInstallRuntimeUpdate,
  clearMacRuntimeQuarantine,
  prepareRuntimeExecutables,
  readRuntimeArchitectures,
};
