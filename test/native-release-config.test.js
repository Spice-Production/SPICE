const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const packageConfig = require("../package.json");
const { build: wrapperConfig } = packageConfig;
const nativeConfig = require("../electron-builder.native.cjs");

const expectedRuntimeFiles = [
  "main.js",
  "preload.js",
  "preload-view.js",
  "discord-rpc.js",
  "scrobbler.js",
  "spice-local-runtime-manager.js",
  "runtime-archive.js",
  "desktop-helpers.js",
  "index.html",
  "settings.html",
  "queue.html",
  "lyrics.html",
  "lyrics.js",
  "lyrics-core.js",
  "toolbar-icons.html",
  "styles.css",
  "icon.png",
  "src/server.js",
  "src/mini-player/**/*",
  "src/obs/**/*",
  "package.json",
];

const uBlockResource = {
  from: "src/extensions/ublock0/uBlock0.chromium",
  to: "extensions/ublock0/uBlock0.chromium",
  filter: ["**/*"],
};

test("wrapper packages only the explicit desktop runtime", () => {
  assert.deepEqual(wrapperConfig.files, expectedRuntimeFiles);
  assert.ok(!wrapperConfig.files.includes("**/*"));
});

test("wrapper packages every relative CommonJS dependency", () => {
  const root = path.join(__dirname, "..");
  const recursiveSuffix = "/**/*";
  const isPackaged = (relativePath) => wrapperConfig.files.some((pattern) => {
    if (pattern === relativePath) return true;
    if (!pattern.endsWith(recursiveSuffix)) return false;
    const directory = pattern.slice(0, -recursiveSuffix.length);
    return relativePath === directory || relativePath.startsWith(`${directory}/`);
  });
  const missing = [];

  for (const entry of wrapperConfig.files) {
    if (!entry.endsWith(".js") || entry.includes("*")) continue;
    const entryPath = path.join(root, ...entry.split("/"));
    const source = fs.readFileSync(entryPath, "utf8");

    for (const match of source.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const request = match[1];
      const basePath = path.resolve(path.dirname(entryPath), request);
      const resolvedPath = [basePath, `${basePath}.js`, path.join(basePath, "index.js")]
        .find((candidate) => fs.existsSync(candidate));

      assert.ok(resolvedPath, `${entry} requires unresolved local module ${request}`);
      const relativePath = path.relative(root, resolvedPath).split(path.sep).join("/");
      if (!isPackaged(relativePath)) missing.push(`${entry} -> ${relativePath}`);
    }
  }

  assert.deepEqual(missing, []);
});

test("desktop packages use the dark-purple single-note icon", () => {
  const root = path.join(__dirname, "..");
  const iconSource = fs.readFileSync(path.join(root, "desktop-icon.svg"), "utf8");
  const iconPng = fs.readFileSync(path.join(root, "icon.png"));

  assert.equal(wrapperConfig.win.icon, "icon.png");
  assert.equal(wrapperConfig.mac.icon, "icon.png");
  assert.equal(wrapperConfig.linux.icon, "icon.png");
  assert.match(iconSource, /<path d="M252 118v210[^>]+fill="url\(#note\)"/);
  assert.match(iconSource, /stop-color="#6d28d9"/i);
  assert.match(iconSource, /stop-color="#4c1d95"/i);
  assert.equal(iconPng.toString("ascii", 1, 4), "PNG");
  assert.equal(iconPng.readUInt32BE(16), 512);
  assert.equal(iconPng.readUInt32BE(20), 512);
});

test("Windows installers use deterministic SPICE-branded wizard artwork", () => {
  const root = path.join(__dirname, "..");
  const sidebarPath = path.join(root, wrapperConfig.nsis.installerSidebar);
  const headerPath = path.join(root, wrapperConfig.nsis.installerHeader);
  const readBmpSize = (filePath) => {
    const image = fs.readFileSync(filePath);
    assert.equal(image.toString("ascii", 0, 2), "BM");
    assert.equal(image.readUInt16LE(28), 24);
    return {
      width: image.readInt32LE(18),
      height: image.readInt32LE(22),
    };
  };

  assert.equal(packageConfig.scripts["installer:assets"], "node scripts/generate-installer-assets.js");
  const installerAssetSource = fs.readFileSync(
    path.join(root, "scripts", "generate-installer-assets.js"),
    "utf8",
  );
  assert.match(installerAssetSource, /const appIconPath = path\.join\(projectRoot, "icon\.png"\)/);
  assert.match(installerAssetSource, /sharp\(appIconPath\)/);
  assert.match(installerAssetSource, /drawAppIcon\(canvas, icon/);
  assert.equal(wrapperConfig.nsis.oneClick, false);
  assert.equal(wrapperConfig.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(wrapperConfig.nsis.shortcutName, "Spice");
  assert.equal(wrapperConfig.nsis.uninstallDisplayName, "Spice");
  assert.equal(wrapperConfig.nsis.uninstallerSidebar, wrapperConfig.nsis.installerSidebar);
  assert.deepEqual(readBmpSize(sidebarPath), { width: 164, height: 314 });
  assert.deepEqual(readBmpSize(headerPath), { width: 150, height: 57 });
  assert.equal(nativeConfig.nsis.installerSidebar, wrapperConfig.nsis.installerSidebar);
  assert.equal(nativeConfig.nsis.installerHeader, wrapperConfig.nsis.installerHeader);
});

test("wrapper and Native releases externalize the complete uBlock extension", () => {
  assert.deepEqual(wrapperConfig.extraResources, [uBlockResource]);
  assert.deepEqual(nativeConfig.extraResources[0], uBlockResource);
  assert.deepEqual(nativeConfig.extraResources.at(-1), {
    from: "native-runtime",
    to: "native-runtime",
    filter: ["**/*"],
  });
});

test("legacy uBlock Lite is retired and migrated to the built-in blocker", () => {
  const root = path.join(__dirname, "..");
  const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const settingsSource = fs.readFileSync(path.join(root, "settings.html"), "utf8");

  assert.equal(
    fs.existsSync(path.join(root, "src", "extensions", "ublock_lite.zip")),
    false,
  );
  assert.doesNotMatch(settingsSource, /<option value="ublock_lite"/);
  assert.match(mainSource, /adBlockerType === "ublock_lite"/);
  assert.match(mainSource, /adBlockerType = "spice"/);
  assert.match(mainSource, /app\.isPackaged[\s\S]*process\.resourcesPath/);
});

test("desktop package metadata and backend workspace wrappers stay aligned", () => {
  assert.equal(packageConfig.main, "main.js");
  assert.equal(packageConfig.type, "commonjs");
  assert.equal(packageConfig.license, "MIT");
  // The registry may grow (e.g. apps/cli), but the backend workspace must
  // stay registered — packaged builds install dependencies through it.
  // Drift between this list and the lockfile is covered separately by
  // test/workspace-alignment.test.js.
  assert.ok(
    Array.isArray(packageConfig.workspaces) &&
      packageConfig.workspaces.includes("apps/backend"),
    `the apps/backend workspace must stay registered in workspaces (got ${JSON.stringify(packageConfig.workspaces)})`,
  );
  assert.equal(packageConfig.engines.node, ">=24");
  assert.equal(packageConfig.packageManager, undefined);

  const expectedBackendScripts = {
    "backend:install": "npm install --workspace @spice/backend",
    "backend:dev": "npm --workspace @spice/backend run dev",
    "backend:build": "npm --workspace @spice/backend run build",
    "backend:build:local": "npm --workspace @spice/backend run build:local",
    "backend:build:vercel": "npm --workspace @spice/backend run build:vercel",
    "backend:lint": "npm --workspace @spice/backend run lint",
    "backend:typecheck": "npm --workspace @spice/backend run typecheck",
    "backend:test": "npm --workspace @spice/backend run test",
    "backend:package:local:windows":
      "npm --workspace @spice/backend run package:local:windows",
    "backend:package:local:windows:full":
      "npm --workspace @spice/backend run package:local:windows:full",
    "backend:package:local:linux":
      "npm --workspace @spice/backend run package:local:linux",
    "backend:package:local:linux:full":
      "npm --workspace @spice/backend run package:local:linux:full",
    "backend:package:local:macos":
      "npm --workspace @spice/backend run package:local:macos",
    "backend:package:local:macos:full":
      "npm --workspace @spice/backend run package:local:macos:full",
  };

  for (const [name, command] of Object.entries(expectedBackendScripts)) {
    assert.equal(packageConfig.scripts[name], command);
  }
});

test("wrapper Linux releases include a Fedora RPM distinct from Native", () => {
  assert.deepEqual(wrapperConfig.linux.target, ["AppImage", "flatpak", "deb", "rpm", "tar.gz"]);
  assert.equal(wrapperConfig.rpm.packageName, "spice");
  assert.equal(nativeConfig.rpm.packageName, "spice-native");
});

test("classic macOS releases are universal and package-checked on pull requests", () => {
  const root = path.join(__dirname, "..");
  const releaseWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "release.yml"),
    "utf8",
  );
  const buildChecksWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "release-build-checks.yml"),
    "utf8",
  );

  assert.equal(packageConfig.scripts["dist:mac"], "electron-builder --mac --universal");
  assert.deepEqual(wrapperConfig.mac.target, ["dmg", "zip"]);
  assert.match(
    releaseWorkflow,
    /Build & Publish Release \(macOS\)[\s\S]*npm run dist:mac -- --publish always/,
  );
  assert.match(buildChecksWorkflow, /wrapper-macos:[\s\S]*runs-on: macos-latest/);
  assert.match(buildChecksWorkflow, /wrapper-macos:[\s\S]*run: npm test/);
  assert.match(
    buildChecksWorkflow,
    /wrapper-macos:[\s\S]*npm run dist:mac -- --dir --publish never/,
  );
  assert.match(
    buildChecksWorkflow,
    /wrapper-macos:[\s\S]*lipo -archs[\s\S]*x86_64[\s\S]*arm64/,
  );
});

test("native releases use an isolated update channel and cache", () => {
  const publishers = Array.isArray(nativeConfig.publish)
    ? nativeConfig.publish
    : [nativeConfig.publish];

  assert.ok(publishers.length > 0);
  for (const publisher of publishers) {
    assert.equal(publisher.channel, "native");
    assert.equal(publisher.updaterCacheDirName, "spice-native-updater");
  }
  assert.equal(nativeConfig.detectUpdateChannel, false);
  assert.equal(nativeConfig.generateUpdatesFilesForAllChannels, false);
});

test("native macOS releases bundle a universal local runtime", () => {
  const root = path.join(__dirname, "..");
  const nativeWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "release-native.yml"),
    "utf8",
  );
  const ciWorkflow = fs.readFileSync(
    path.join(root, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  const macPackageSource = fs.readFileSync(
    path.join(root, "apps", "backend", "scripts", "package-local-macos.mjs"),
    "utf8",
  );

  assert.match(packageConfig.scripts["dist:native:mac"], /--mac --universal/);
  assert.equal(
    nativeConfig.mac.x64ArchFiles,
    "Contents/Resources/native-runtime/**/*",
  );
  assert.match(macPackageSource, /darwin-arm64/);
  assert.match(macPackageSource, /darwin-x64/);
  assert.match(macPackageSource, /--os=darwin/);
  assert.match(macPackageSource, /`--cpu=\$\{architecture\}`/);
  assert.match(macPackageSource, /--ignore-scripts/);
  assert.match(macPackageSource, /--force/);
  assert.match(macPackageSource, /manifest\.architectures = \['arm64', 'x64'\]/);
  assert.match(nativeWorkflow, /build-native-macos:[\s\S]*runs-on: macos-latest/);
  assert.match(nativeWorkflow, /npm run dist:native:mac -- --publish always/);
  assert.match(ciWorkflow, /local-macos-package:[\s\S]*ffmpeg:macos-universal/);
  assert.match(ciWorkflow, /local-macos-package:[\s\S]*lipo -archs[\s\S]*x86_64[\s\S]*arm64/);
});

test("native installer identity remains separate from the wrapper", () => {
  assert.equal(nativeConfig.appId, "com.spice.native");
  assert.equal(nativeConfig.productName, "Spice Native");
  assert.equal(nativeConfig.executableName, "Spice Native");
  assert.equal(
    nativeConfig.nsis.artifactName,
    "Spice-Native-Setup-${version}-${arch}.${ext}",
  );
  assert.deepEqual(nativeConfig.linux.target, ["AppImage", "deb", "rpm", "tar.gz"]);
  assert.equal(nativeConfig.linux.executableName, "spice-native");
  assert.equal(nativeConfig.linux.synopsis, "SPICE Music with a bundled local runtime");
  assert.match(nativeConfig.linux.description, /media runtime on the user's computer/);
  assert.equal(nativeConfig.deb.packageName, "spice-native");
  assert.equal(nativeConfig.rpm.packageName, "spice-native");
});

test("native runtime preparation avoids spawning the Windows npm command shim", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "prepare-native-runtime.js"),
    "utf8",
  );

  assert.match(source, /process\.env\.npm_execpath/);
  assert.match(source, /npmCli \? process\.execPath : "npm"/);
  assert.doesNotMatch(source, /["']npm\.cmd["']/);
});

test("native runtime launches MP3 conversion with its packaged FFmpeg binary", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "spice-local-runtime-manager.js"),
    "utf8",
  );

  assert.match(source, /SPICE_FFMPEG_PATH/);
  assert.match(source, /path\.join\(\s*this\.runtimeDir,\s*"node_modules",\s*"ffmpeg-static"/);
});

test("runtime release publishing detects an existing tag before creating it", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.match(workflow, /gh release list[^\n]+--json tagName/);
  assert.match(workflow, /\$existingTags -contains \$tag/);
  assert.doesNotMatch(workflow, /if \(gh release view/);
});

test("tag release workflows tolerate concurrent release creation", () => {
  for (const name of ["release.yml", "release-native.yml"]) {
    const workflow = fs.readFileSync(
      path.join(__dirname, "..", ".github", "workflows", name),
      "utf8",
    );

    assert.match(workflow, /if gh release view "\$VERSION"/);
    assert.match(workflow, /if gh release create "\$VERSION"/);
    assert.match(workflow, /Release creation raced with another workflow/);
    assert.match(workflow, /gh release view "\$VERSION" >\/dev\/null/);
  }
});
