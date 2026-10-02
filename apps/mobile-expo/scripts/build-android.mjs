// Generates the native Android project (Continuous Native Generation) and runs
// a Gradle task: `debug` / `release` APKs or the native engine's JVM tests.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'debug';
const tasks = {
  debug: ['assembleDebug'],
  release: ['assembleRelease'],
  'engine-test': [':spice-engine:testDebugUnitTest'],
};
if (!tasks[mode]) {
  console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(tasks).join(', ')}`);
  process.exit(1);
}

const env = { ...process.env };
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const candidates = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);
  const sdk = candidates.find((candidate) => existsSync(candidate));
  if (sdk) env.ANDROID_HOME = sdk;
}

// A published release must carry the stable SPICE key; a debug-signed APK
// could never install over the existing app.
if (mode === 'release' && env.SPICE_ANDROID_REQUIRE_RELEASE_SIGNING === '1') {
  const missing = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']
    .map((name) => `SPICE_ANDROID_SIGNING_${name}`)
    .filter((name) => !env[name]);
  if (missing.length > 0 || !existsSync(env.SPICE_ANDROID_SIGNING_STORE_FILE)) {
    console.error(`Android release signing is incomplete: ${missing.join(', ') || 'the keystore file is missing'}.`);
    process.exit(1);
  }
}

// Debug builds only need a phone (arm64) and an emulator (x86_64) ABI.
const abis = env.SPICE_ANDROID_ABIS ?? (mode === 'debug' ? 'arm64-v8a,x86_64' : '');
const gradleArgs = [...tasks[mode], '--no-daemon', ...(abis ? [`-PreactNativeArchitectures=${abis}`] : [])];

function run(command, args, cwd) {
  // Windows runs .cmd/.bat launchers through the shell, which takes one command line.
  const result =
    process.platform === 'win32'
      ? spawnSync([command, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true })
      : spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  return result.status ?? 1;
}

// Windows: React Native's CMake builds produce object paths past 260
// characters. Long paths need LongPathsEnabled plus ninja 1.12+, which ships
// with SDK CMake 3.30+ (the Android Gradle Plugin defaults to CMake 3.22).
function newestSdkCMake() {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  const dir = sdk && path.join(sdk, 'cmake');
  if (!dir || !existsSync(dir)) return null;
  const version = (name) => name.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const newer = (a, b) => {
    const [left, right] = [version(a), version(b)];
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const diff = (left[index] ?? 0) - (right[index] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  const best = readdirSync(dir)
    .filter((name) => /^\d+\.\d+/.test(name) && newer(name, '3.30') >= 0)
    .sort(newer)
    .pop();
  return best ? path.join(dir, best) : null;
}

function configureCMake(android) {
  if (process.platform !== 'win32') return;
  const cmake = newestSdkCMake();
  if (!cmake) {
    console.warn('Warning: install CMake 3.30+ (sdkmanager "cmake;3.31.6") if native builds fail on long paths.');
    return;
  }
  const file = path.join(android, 'local.properties');
  const kept = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('cmake.dir=')) : [];
  kept.push(`cmake.dir=${cmake.split(path.sep).join('/')}`);
  writeFileSync(file, `${kept.join('\n')}\n`);
}

const android = path.join(root, 'android');
// Prebuild recreates android/ by default. Release builds keep that for a
// reproducible project; debug and test builds reuse it so Gradle stays incremental.
const incremental = mode !== 'release' && existsSync(path.join(android, 'gradlew'));
let status = run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', ...(incremental ? ['--no-clean'] : [])], root);
if (status === 0) {
  configureCMake(android);
  // An explicit path: cmd.exe may be configured not to search the current directory.
  // `sh gradlew` also works when the generated wrapper lacks its executable bit.
  status =
    process.platform === 'win32'
      ? run(`"${path.join(android, 'gradlew.bat')}"`, gradleArgs, android)
      : run('sh', [path.join(android, 'gradlew'), ...gradleArgs], android);
}
if (status !== 0) process.exit(status);

if (mode !== 'engine-test') {
  const variant = mode === 'release' ? 'release' : 'debug';
  console.log(`\nAPK: ${path.join(root, 'android', 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`)}`);
}
