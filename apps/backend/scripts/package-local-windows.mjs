import { chmod, cp, mkdir, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { collectSymlinks, materializeStandaloneTracedLinks } from './lib/traced-symlinks.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = path.join(appRoot, '.next', 'standalone');
const staticDir = path.join(appRoot, '.next', 'static');
const publicDir = path.join(appRoot, 'public');
const distRoot = path.join(appRoot, 'dist');
const supportedPackagePlatforms = new Set(['windows', 'linux', 'macos']);
const requestedPackagePlatform = process.env.SPICE_LOCAL_PACKAGE_PLATFORM || 'windows';
if (!supportedPackagePlatforms.has(requestedPackagePlatform)) {
  throw new Error(`Unsupported SPICE local package platform: ${requestedPackagePlatform}`);
}
const packagePlatform = requestedPackagePlatform;
const unixPackage = packagePlatform === 'linux' || packagePlatform === 'macos';
const packageName = `spice-local-${packagePlatform}`;
const ffmpegBinaryName = unixPackage ? 'ffmpeg' : 'ffmpeg.exe';
const ffmpegSourceDir = path.resolve(appRoot, '..', '..', 'node_modules', 'ffmpeg-static');
const defaultUpdateManifestUrl = `https://music.spice-app.xyz/api/updates/local-${packagePlatform}`;
const packageDir = path.join(distRoot, packageName);
const packagedBackendDir = path.join(packageDir, 'apps', 'backend');
const cloudApiPrefixes = [
  '/api/account',
  '/api/admin',
  '/api/auth',
  '/api/changelog',
  '/api/downloads',
  '/api/feedback',
  '/api/lastfm',
  '/api/listen-together',
  '/api/listeners',
  '/api/notifications',
  '/api/playlists',
  '/api/profile',
  '/api/remote',
  '/api/sync',
  '/api/updates',
  '/api/users',
  '/api/version',
];
const forbiddenDbMarkers = [
  /postgres(?:ql)?:\/\//i,
  /@neondatabase/i,
  /drizzle-orm/i,
  /DATABASE_URL/,
  /neon\.tech/i,
];
const localRuntimeVersion = await readLocalRuntimeVersion();

await assertExists(standaloneDir, 'Run npm run build:local --workspace @spice/backend before packaging.');
await assertExists(staticDir, 'The local Next build did not produce .next/static.');

// Next's dependency tracer emits placeholder entries named "<pkg>-<hash>"
// under the standalone tree, implemented as symlinks/junctions back into the
// monorepo's hoisted node_modules whenever a packaged route pulls in a
// dependency not installed under apps/backend. Materialize them into real
// directories in place — before anything is copied into package staging — so
// no outbound links (or their absolute host paths) can reach an artifact.
const repoRoot = path.resolve(appRoot, '..', '..');
await materializeStandaloneTracedLinks({ root: standaloneDir, repoRoot });

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });
await cp(standaloneDir, packageDir, { recursive: true });
await copyFfmpegRuntime(packageDir);

if (existsSync(publicDir)) {
  await cp(publicDir, path.join(packagedBackendDir, 'public'), { recursive: true });
}
await mkdir(path.join(packagedBackendDir, '.next'), { recursive: true });
await cp(staticDir, path.join(packagedBackendDir, '.next', 'static'), { recursive: true });

await materializePackageSymlinks(packageDir);
await flattenStandaloneNodeModules(packageDir);
await pruneLocalPackage(packageDir);
await sanitizeNextManifests(packageDir);
await pruneUnreferencedForbiddenChunks(packageDir);
await sanitizeStandaloneMetadata(packageDir);
await writeLaunchers(packageDir);
await assertPackagedAssets(packageDir);
await scanForForbiddenLocalPayload(packageDir);

console.log(`Packaged SPICE local runtime at ${packageDir}`);

async function copyFfmpegRuntime(root) {
  const destinationDir = path.join(root, 'node_modules', 'ffmpeg-static');
  const runtimeFiles = [
    ffmpegBinaryName,
    `${ffmpegBinaryName}.LICENSE`,
    `${ffmpegBinaryName}.README`,
    'LICENSE',
    'README.md',
    'package.json',
  ];

  await rm(destinationDir, { recursive: true, force: true });
  await mkdir(destinationDir, { recursive: true });
  for (const file of runtimeFiles) {
    const source = path.join(ffmpegSourceDir, file);
    await assertExists(
      source,
      `The installed ffmpeg-static package is missing ${file} for ${packagePlatform} packaging.`,
    );
    await cp(source, path.join(destinationDir, file));
  }

  if (unixPackage) {
    await chmod(path.join(destinationDir, ffmpegBinaryName), 0o755);
  }
}

async function assertExists(target, message) {
  if (!existsSync(target)) {
    throw new Error(message);
  }
}

async function assertPackagedAssets(root) {
  const backendRoot = path.join(root, 'apps', 'backend');
  const staticRoot = path.join(backendRoot, '.next', 'static');
  const staticFiles = [];

  await assertExists(staticRoot, 'The local runtime package is missing apps/backend/.next/static.');
  await walk(staticRoot, async (file) => {
    if (staticFiles.length < 1) staticFiles.push(file);
  });

  if (staticFiles.length === 0) {
    throw new Error('The local runtime package copied apps/backend/.next/static, but it is empty.');
  }

  if (existsSync(publicDir)) {
    await assertExists(
      path.join(backendRoot, 'public'),
      'The local runtime package is missing apps/backend/public.',
    );
  }

  const ffmpegBinary = [
    path.join(root, 'node_modules', 'ffmpeg-static', ffmpegBinaryName),
    path.join(backendRoot, 'node_modules', 'ffmpeg-static', ffmpegBinaryName),
  ].find((candidate) => existsSync(candidate));
  if (!ffmpegBinary) {
    throw new Error(`The local runtime package is missing the ${packagePlatform} FFmpeg binary required for MP3 downloads.`);
  }

  await assertExists(
    `${ffmpegBinary}.LICENSE`,
    'The packaged FFmpeg binary is missing its license text.',
  );
  await assertExists(
    `${ffmpegBinary}.README`,
    'The packaged FFmpeg binary is missing its source and build notice.',
  );
  if (unixPackage) await chmod(ffmpegBinary, 0o755);
}

async function pruneLocalPackage(root) {
  const deleteTargets = [
    'apps/backend/.next/server/app/api/account',
    'apps/backend/.next/server/app/api/admin',
    'apps/backend/.next/server/app/api/auth',
    'apps/backend/.next/server/app/api/changelog',
    'apps/backend/.next/server/app/api/downloads',
    'apps/backend/.next/server/app/api/feedback',
    'apps/backend/.next/server/app/api/lastfm',
    'apps/backend/.next/server/app/api/listen-together',
    'apps/backend/.next/server/app/api/listeners',
    'apps/backend/.next/server/app/api/notifications',
    'apps/backend/.next/server/app/api/playlists',
    'apps/backend/.next/server/app/api/profile',
    'apps/backend/.next/server/app/api/remote',
    'apps/backend/.next/server/app/api/sync',
    'apps/backend/.next/server/app/api/updates',
    'apps/backend/.next/server/app/api/users',
    'apps/backend/.next/server/app/api/version',
    'apps/backend/public/WALKTHROUGH.md',
    'apps/backend/db',
    'node_modules/@neondatabase',
    'node_modules/drizzle-orm',
    // Self-host-only Postgres driver (db/index.ts picks it for non-Neon
    // URLs). The offline runtime must not ship database clients at all.
    'node_modules/pg',
    'node_modules/pg-cloudflare',
    'node_modules/pg-connection-string',
    'node_modules/pg-int8',
    'node_modules/pg-numeric',
    'node_modules/pg-pool',
    'node_modules/pg-protocol',
    'node_modules/pg-types',
    'node_modules/pgpass',
    'node_modules/postgres-array',
    'node_modules/postgres-bytea',
    'node_modules/postgres-date',
    'node_modules/postgres-interval',
    'node_modules/postgres-range',
  ];

  for (const target of deleteTargets) {
    await rm(path.join(root, target), { recursive: true, force: true });
  }
}

async function materializePackageSymlinks(root) {
  for (let pass = 0; pass < 5; pass++) {
    const links = [];
    await collectSymlinks(root, links);

    if (links.length === 0) return;

    for (const link of links) {
      const target = path.resolve(path.dirname(link), await readlink(link));
      if (!isPathInside(target, root) && !isPathInside(target, standaloneDir)) {
        throw new Error(`Refusing to copy local package symlink target outside the standalone build: ${link} -> ${target}`);
      }

      if (!existsSync(target)) {
        await rm(link, { recursive: true, force: true });
        continue;
      }

      await rm(link, { recursive: true, force: true });
      await cp(target, link, { recursive: true, dereference: true });
    }
  }

  const remainingLinks = [];
  await collectSymlinks(root, remainingLinks);
  if (remainingLinks.length > 0) {
    throw new Error(`Local package still contains symlinks:\n${remainingLinks.join('\n')}`);
  }
}


function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function flattenStandaloneNodeModules(root) {
  const pnpmRoot = path.join(root, 'node_modules', '.pnpm');
  const backendNodeModules = path.join(root, 'apps', 'backend', 'node_modules');
  if (!existsSync(pnpmRoot)) return;

  const packageEntries = await readdir(pnpmRoot, { withFileTypes: true });
  for (const entry of packageEntries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    await copyNodeModuleEntries(path.join(pnpmRoot, entry.name, 'node_modules'), backendNodeModules);
  }

  await copyNodeModuleEntries(path.join(pnpmRoot, 'node_modules'), backendNodeModules);
}

async function copyNodeModuleEntries(sourceDir, destinationDir) {
  if (!existsSync(sourceDir)) return;

  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.bin') continue;

    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      await copyNodeModuleEntries(source, destination);
      continue;
    }

    if (existsSync(destination)) continue;
    await cp(source, destination, { recursive: true, dereference: true });
  }
}

async function sanitizeStandaloneMetadata(root) {
  const backendRoot = path.join(root, 'apps', 'backend');
  const removeTargets = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
  ];

  for (const target of removeTargets) {
    await rm(path.join(backendRoot, target), { force: true });
  }

  const packageJson = {
    name: '@spice/backend-local-runtime',
    private: true,
    type: 'module',
    scripts: {
      start: 'node server.js',
    },
    spice: {
      runtimeTarget: 'local',
      platform: packagePlatform,
      version: process.env.SPICE_LOCAL_RUNTIME_VERSION
        || process.env[`SPICE_LOCAL_${packagePlatform.toUpperCase()}_VERSION`]
        || localRuntimeVersion,
      localApiPrefix: '/api/local',
      cloudApiPrefix: '/api/cloud',
      cloudApiOrigin: 'https://music.spice-app.xyz',
      updateManifestUrl: process.env.SPICE_LOCAL_UPDATE_MANIFEST_URL || defaultUpdateManifestUrl,
    },
  };

  await writeFile(path.join(backendRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  const serverFile = path.join(backendRoot, 'server.js');
  const serverText = await readFile(serverFile, 'utf8').catch(() => '');
  if (serverText) {
    const sanitized = serverText.replace(
      /"resolveAlias":\{[^{}]*"@neondatabase\/serverless"[^{}]*\},/g,
      '"resolveAlias":{},',
    );
    await writeFile(serverFile, sanitized);
  }
}

async function sanitizeNextManifests(root) {
  const backendNextRoot = path.join(root, 'apps', 'backend', '.next');
  await sanitizeJsonFile(path.join(backendNextRoot, 'app-path-routes-manifest.json'), (manifest) => {
    if (!isRecord(manifest)) return manifest;
    for (const key of Object.keys(manifest)) {
      const value = manifest[key];
      if (isCloudRoute(key) || (typeof value === 'string' && isCloudRoute(value))) {
        delete manifest[key];
      }
    }
    return manifest;
  });

  await sanitizeJsonFile(path.join(backendNextRoot, 'routes-manifest.json'), (manifest) => {
    if (!isRecord(manifest)) return manifest;
    for (const key of ['staticRoutes', 'dynamicRoutes']) {
      if (Array.isArray(manifest[key])) {
        manifest[key] = manifest[key].filter((entry) => !isRecord(entry) || !isCloudRoute(String(entry.page ?? '')));
      }
    }
    return manifest;
  });

  await sanitizeRequiredServerFilesJs(path.join(backendNextRoot, 'required-server-files.js'));

  await sanitizeJsonFile(path.join(backendNextRoot, 'required-server-files.json'), (manifest) => {
    if (!isRecord(manifest)) return manifest;
    if (Array.isArray(manifest.files)) {
      manifest.files = manifest.files.filter((file) => !isCloudBuildFile(String(file)));
    }
    const resolveAlias = manifest.config?.turbopack?.resolveAlias;
    if (isRecord(resolveAlias)) {
      delete resolveAlias['@neondatabase/serverless'];
      delete resolveAlias['drizzle-orm'];
      delete resolveAlias['drizzle-orm/neon-http'];
    }
    return manifest;
  });

  await sanitizeJsonFile(path.join(backendNextRoot, 'server', 'app-paths-manifest.json'), (manifest) => {
    if (!isRecord(manifest)) return manifest;
    for (const key of Object.keys(manifest)) {
      const value = manifest[key];
      if (isCloudRoute(key) || (typeof value === 'string' && isCloudBuildFile(value))) {
        delete manifest[key];
      }
    }
    return manifest;
  });

  await sanitizeJsonFile(path.join(backendNextRoot, 'server', 'functions-config-manifest.json'), (manifest) => {
    if (!isRecord(manifest?.functions)) return manifest;
    for (const key of Object.keys(manifest.functions)) {
      if (isCloudRoute(key)) {
        delete manifest.functions[key];
      }
    }
    return manifest;
  });
}


async function sanitizeRequiredServerFilesJs(file) {
  let text = await readFile(file, 'utf8').catch(() => '');
  if (!text) return;

  text = text
    .replace(/^\s*"@neondatabase\/serverless":\s*"[^\n]+\n/gm, '')
    .replace(/^\s*"drizzle-orm":\s*"[^\n]+\n/gm, '')
    .replace(/^\s*"drizzle-orm\/neon-http":\s*"[^\n]+\n/gm, '');

  await writeFile(file, text);
}

async function pruneUnreferencedForbiddenChunks(root) {
  const backendNextRoot = path.join(root, 'apps', 'backend', '.next');
  const chunksRoot = path.join(backendNextRoot, 'server', 'chunks');
  const referencedChunks = await collectReferencedChunks(path.join(backendNextRoot, 'server', 'app'));
  const blocking = [];

  if (!existsSync(chunksRoot)) return;

  await walk(chunksRoot, async (file) => {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text || !hasForbiddenDbMarker(text)) return;
    const chunkRef = path.relative(backendNextRoot, file).replaceAll(path.sep, '/');
    if (referencedChunks.has(chunkRef)) {
      blocking.push(chunkRef);
      return;
    }
    await rm(file, { force: true });
  });

  if (blocking.length > 0) {
    throw new Error(`Local runtime still references DB-bearing server chunks:\n${blocking.join('\n')}`);
  }
}

async function collectReferencedChunks(root) {
  const references = new Set();
  if (!existsSync(root)) return references;

  await walk(root, async (file) => {
    if (!file.endsWith('.js')) return;
    const text = await readFile(file, 'utf8').catch(() => '');
    for (const match of text.matchAll(/R\.c\("([^"]+)"\)/g)) {
      references.add(match[1]);
    }
  });

  return references;
}

async function sanitizeJsonFile(file, sanitizer) {
  const text = await readFile(file, 'utf8').catch(() => '');
  if (!text) return;
  const json = JSON.parse(text);
  await writeFile(file, `${JSON.stringify(sanitizer(json), null, 2)}\n`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCloudRoute(route) {
  return cloudApiPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

function isCloudBuildFile(file) {
  return cloudApiPrefixes.some((prefix) => {
    const buildPath = prefix.slice(1).replaceAll('/', '/');
    return file.includes(`${buildPath}/`) || file.includes(`${buildPath}\\`);
  });
}

function hasForbiddenDbMarker(text) {
  return forbiddenDbMarkers.some((pattern) => pattern.test(text));
}

async function writeLaunchers(root) {
  const manifestUrl = process.env.SPICE_LOCAL_UPDATE_MANIFEST_URL || defaultUpdateManifestUrl;
  const version = process.env.SPICE_LOCAL_RUNTIME_VERSION
    || process.env[`SPICE_LOCAL_${packagePlatform.toUpperCase()}_VERSION`]
    || localRuntimeVersion;
  const envExample = [
    'SPICE_RUNTIME_TARGET=local',
    'HOSTNAME=127.0.0.1',
    'PORT=3939',
    'SPICE_CLOUD_API_ORIGIN=https://music.spice-app.xyz',
    `SPICE_LOCAL_UPDATE_MANIFEST_URL=${manifestUrl}`,
    'SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS=12',
    'SPICE_STREAM_HMAC_SECRET=replace-with-a-random-local-secret',
    '',
  ].join(unixPackage ? '\n' : '\r\n');

  const manifest = {
    name: `SPICE Local ${
      packagePlatform === 'windows' ? 'Windows' : packagePlatform === 'macos' ? 'macOS' : 'Linux'
    } Runtime`,
    runtimeTarget: 'local',
    platform: packagePlatform,
    version,
    host: '127.0.0.1',
    port: 3939,
    localApiPrefix: '/api/local',
    cloudApiPrefix: '/api/cloud',
    cloudApiOrigin: 'https://music.spice-app.xyz',
    updateManifestUrl: manifestUrl,
    startScript: unixPackage ? 'start-spice-local.sh' : 'start-spice-local.ps1',
    updateCheckScript: packagePlatform === 'windows' ? 'check-spice-local-update.ps1' : null,
  };

  await writeFile(path.join(root, '.env.local.example'), envExample);
  await writeFile(path.join(root, 'spice-local-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (unixPackage) {
    const sh = [
      '#!/usr/bin/env sh',
      'set -eu',
      'SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
      'export SPICE_RUNTIME_TARGET=local',
      `export SPICE_FFMPEG_PATH="\${SPICE_FFMPEG_PATH:-$SCRIPT_DIR/node_modules/ffmpeg-static/${ffmpegBinaryName}}"`,
      'export HOSTNAME="${SPICE_LOCAL_HOSTNAME:-127.0.0.1}"',
      'export PORT="${SPICE_LOCAL_PORT:-3939}"',
      'export SPICE_CLOUD_API_ORIGIN="${SPICE_CLOUD_API_ORIGIN:-https://music.spice-app.xyz}"',
      `export SPICE_LOCAL_UPDATE_MANIFEST_URL="\${SPICE_LOCAL_UPDATE_MANIFEST_URL:-${manifestUrl}}"`,
      'exec "${SPICE_NODE_BINARY:-node}" "$SCRIPT_DIR/apps/backend/server.js"',
      '',
    ].join('\n');

    const launcherPath = path.join(root, 'start-spice-local.sh');
    await writeFile(launcherPath, sh);
    await chmod(launcherPath, 0o755);
    return;
  }

  const cmd = [
    '@echo off',
    'set SPICE_RUNTIME_TARGET=local',
    `if "%SPICE_FFMPEG_PATH%"=="" set "SPICE_FFMPEG_PATH=%~dp0node_modules\\ffmpeg-static\\${ffmpegBinaryName}"`,
    'if "%HOSTNAME%"=="" set HOSTNAME=127.0.0.1',
    'if "%PORT%"=="" set PORT=3939',
    'if "%SPICE_CLOUD_API_ORIGIN%"=="" set SPICE_CLOUD_API_ORIGIN=https://music.spice-app.xyz',
    `if "%SPICE_LOCAL_UPDATE_MANIFEST_URL%"=="" set SPICE_LOCAL_UPDATE_MANIFEST_URL=${manifestUrl}`,
    'if "%SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS%"=="" set SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS=12',
    'if exist "%~dp0check-spice-local-update.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-spice-local-update.ps1" -Quiet',
    'node "%~dp0apps\\backend\\server.js"',
    '',
  ].join('\r\n');

  const ps1 = [
    '$env:SPICE_RUNTIME_TARGET = "local"',
    `if (-not $env:SPICE_FFMPEG_PATH) { $env:SPICE_FFMPEG_PATH = Join-Path $PSScriptRoot "node_modules\\ffmpeg-static\\${ffmpegBinaryName}" }`,
    'if (-not $env:HOSTNAME) { $env:HOSTNAME = "127.0.0.1" }',
    'if (-not $env:PORT) { $env:PORT = "3939" }',
    'if (-not $env:SPICE_CLOUD_API_ORIGIN) { $env:SPICE_CLOUD_API_ORIGIN = "https://music.spice-app.xyz" }',
    `if (-not $env:SPICE_LOCAL_UPDATE_MANIFEST_URL) { $env:SPICE_LOCAL_UPDATE_MANIFEST_URL = "${manifestUrl}" }`,
    'if (-not $env:SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS) { $env:SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS = "12" }',
    '$updateCheck = Join-Path $PSScriptRoot "check-spice-local-update.ps1"',
    'if (Test-Path -LiteralPath $updateCheck) { & $updateCheck -Quiet }',
    '$server = Join-Path $PSScriptRoot "apps\\backend\\server.js"',
    'node $server',
    '',
  ].join('\r\n');

  await writeFile(path.join(root, 'start-spice-local.cmd'), cmd);
  await writeFile(path.join(root, 'start-spice-local.ps1'), ps1);
  await writeFile(path.join(root, 'check-spice-local-update.ps1'), updateCheckScript());
}

async function readLocalRuntimeVersion() {
  const releaseFile = path.join(appRoot, 'lib', 'release-notifications.ts');
  const text = await readFile(releaseFile, 'utf8').catch(() => '');
  return text.match(/SPICE_MEDIA_CORE_VERSION\s*=\s*'([^']+)'/)?.[1] || '0.0.0';
}

function updateCheckScript() {
  return [
    'param(',
    '  [switch]$Download,',
    '  [switch]$Quiet',
    ')',
    '',
    '$ErrorActionPreference = "Stop"',
    '$manifestPath = Join-Path $PSScriptRoot "spice-local-manifest.json"',
    'if (-not (Test-Path -LiteralPath $manifestPath)) {',
    '  if (-not $Quiet) { Write-Warning "SPICE local manifest not found." }',
    '  exit 0',
    '}',
    '',
    '$localManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json',
    '$currentVersion = [string]$localManifest.version',
    '$manifestUrl = $env:SPICE_LOCAL_UPDATE_MANIFEST_URL',
    'if ([string]::IsNullOrWhiteSpace($manifestUrl)) { $manifestUrl = [string]$localManifest.updateManifestUrl }',
    'if ([string]::IsNullOrWhiteSpace($manifestUrl)) {',
    '  if (-not $Quiet) { Write-Warning "SPICE update manifest URL is not configured." }',
    '  exit 0',
    '}',
    '',
    'if (-not $Download) {',
    '  $minHours = 12.0',
    '  if (-not [string]::IsNullOrWhiteSpace($env:SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS)) {',
    '    $parsedMinHours = 0.0',
    '    if ([double]::TryParse($env:SPICE_LOCAL_UPDATE_CHECK_MIN_HOURS, [ref]$parsedMinHours) -and $parsedMinHours -ge 1) {',
    '      $minHours = $parsedMinHours',
    '    }',
    '  }',
    '',
    '  $statePath = Join-Path $PSScriptRoot ".spice-update-check.json"',
    '  if (Test-Path -LiteralPath $statePath) {',
    '    try {',
    '      $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json',
    '      $lastCheckedAt = [datetime]$state.lastCheckedAt',
    '      if (((Get-Date).ToUniversalTime() - $lastCheckedAt.ToUniversalTime()).TotalHours -lt $minHours) {',
    '        exit 0',
    '      }',
    '    } catch {}',
    '  }',
    '}',
    '',
    'function Get-SpiceVersionParts([string]$Version) {',
    '  $parts = @($Version -replace "^[^0-9]*", "" -split "[^0-9]+" | Where-Object { $_ })',
    '  while ($parts.Count -lt 3) { $parts += "0" }',
    '  return $parts | Select-Object -First 4 | ForEach-Object { [int]$_ }',
    '}',
    '',
    'function Compare-SpiceVersion([string]$Left, [string]$Right) {',
    '  $leftParts = @(Get-SpiceVersionParts $Left)',
    '  $rightParts = @(Get-SpiceVersionParts $Right)',
    '  $count = [Math]::Max($leftParts.Count, $rightParts.Count)',
    '  for ($index = 0; $index -lt $count; $index++) {',
    '    $leftValue = if ($index -lt $leftParts.Count) { $leftParts[$index] } else { 0 }',
    '    $rightValue = if ($index -lt $rightParts.Count) { $rightParts[$index] } else { 0 }',
    '    if ($leftValue -gt $rightValue) { return 1 }',
    '    if ($leftValue -lt $rightValue) { return -1 }',
    '  }',
    '  return 0',
    '}',
    '',
    'try {',
    '  $remoteManifest = Invoke-RestMethod -Uri $manifestUrl -Headers @{ Accept = "application/json" }',
    '  if (-not $Download) {',
    '    $statePath = Join-Path $PSScriptRoot ".spice-update-check.json"',
    '    @{ lastCheckedAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $statePath',
    '  }',
    '} catch {',
    '  if (-not $Quiet) { Write-Warning "Unable to check SPICE updates: $($_.Exception.Message)" }',
    '  exit 0',
    '}',
    '',
    '$latestVersion = [string]$remoteManifest.version',
    'if ([string]::IsNullOrWhiteSpace($latestVersion)) { exit 0 }',
    '$comparison = Compare-SpiceVersion $latestVersion $currentVersion',
    'if ($comparison -le 0) {',
    '  if (-not $Quiet) { Write-Host "SPICE local runtime is up to date ($currentVersion)." }',
    '  exit 0',
    '}',
    '',
    '$downloadUrl = [string]$remoteManifest.download.url',
    'Write-Host "SPICE local runtime update available: $currentVersion -> $latestVersion"',
    'if (-not $Download) {',
    '  if (-not [string]::IsNullOrWhiteSpace($downloadUrl)) {',
    '    Write-Host "Run .\\check-spice-local-update.ps1 -Download to download the update ZIP."',
    '  } else {',
    '    Write-Host "No update download URL is published yet. Check the release notes: $($remoteManifest.releaseNotesUrl)"',
    '  }',
    '  exit 0',
    '}',
    '',
    'if ([string]::IsNullOrWhiteSpace($downloadUrl)) {',
    '  Write-Error "The update manifest does not include a download URL."',
    '}',
    '',
    '$updatesDir = Join-Path $PSScriptRoot "updates"',
    'New-Item -ItemType Directory -Force -Path $updatesDir | Out-Null',
    '$zipPath = Join-Path $updatesDir "spice-local-windows-$latestVersion.zip"',
    'Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath',
    '',
    '$expectedHash = [string]$remoteManifest.download.sha256',
    'if (-not [string]::IsNullOrWhiteSpace($expectedHash)) {',
    '  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()',
    '  if ($actualHash -ne $expectedHash.ToLowerInvariant()) {',
    '    Remove-Item -LiteralPath $zipPath -Force',
    '    Write-Error "Downloaded update hash mismatch. Expected $expectedHash but got $actualHash."',
    '  }',
    '}',
    '',
    'Write-Host "Downloaded SPICE local update to $zipPath"',
    '',
  ].join('\r\n');
}

async function scanForForbiddenLocalPayload(root) {
  const offenders = [];

  await walk(root, async (file) => {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    if (/\.(png|jpg|jpeg|gif|ico|webp|woff2?)$/i.test(file)) return;
    if (/node_modules\/ffmpeg-static\/ffmpeg(?:\.exe)?$/i.test(relative)) return;
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text) return;
    if (hasForbiddenDbMarker(text)) {
      offenders.push(relative);
    }
  });

  if (offenders.length > 0) {
    throw new Error(`Local package contains forbidden DB markers:\n${offenders.join('\n')}`);
  }
}

async function walk(dir, visitor) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, visitor);
    } else if (entry.isFile()) {
      await visitor(fullPath);
    }
  }
}
