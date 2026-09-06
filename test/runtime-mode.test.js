const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");
const preload = fs.readFileSync(path.join(repoRoot, "preload.js"), "utf8");
const startNative = fs.readFileSync(path.join(repoRoot, "scripts", "start-native.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in main.js`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function extractConst(source, name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  assert.ok(match, `${name} should exist in main.js`);
  return match[0];
}

function loadRuntimeHelpers() {
  const context = vm.createContext({ URL });
  for (const name of [
    "DEFAULT_REMOTE_RUNTIME_URL",
    "RUNTIME_MODE_STORAGE_KEY",
    "RUNTIME_REMOTE_URL_STORAGE_KEY",
    "RUNTIME_DEVICE_STORAGE_KEY",
    "RUNTIME_TOKEN_STORAGE_KEY",
  ]) {
    vm.runInContext(extractConst(main, name), context);
  }
  for (const name of [
    "normalizeRuntimeMode",
    "normalizeRemoteRuntimeUrl",
    "getRuntimeModeState",
    "resolveEffectiveRuntimeMode",
    "buildRemoteRuntimeUrl",
    "buildRuntimeAuthorizationHeader",
    "shouldSkipLocalRuntimeLifecycle",
  ]) {
    vm.runInContext(extractFunction(main, name), context);
  }
  return context;
}

function handlerBody(source, channel, length = 600) {
  const marker = `ipcMain.handle("${channel}"`;
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `${channel} handler should exist in main.js`);
  return source.slice(index, index + length);
}

function fakeStore(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    get(key, fallback) {
      return data.has(key) ? data.get(key) : fallback;
    },
    set(key, value) {
      data.set(key, value);
    },
    delete(key) {
      data.delete(key);
    },
  };
}

function evalIn(context, expression) {
  return vm.runInContext(expression, context);
}

// --- Behavioral contract (pure helpers evaluated from main.js) ---

test("runtime mode defaults to local", () => {
  const context = loadRuntimeHelpers();
  const state = evalIn(context, "getRuntimeModeState({ get: (key, fallback) => fallback })");
  assert.equal(state.mode, "local");
  assert.equal(evalIn(context, `resolveEffectiveRuntimeMode(${JSON.stringify(state)})`), "local");
  assert.equal(evalIn(context, "shouldSkipLocalRuntimeLifecycle('local')"), false);
});

test("remote mode keeps a valid https remote URL", () => {
  const context = loadRuntimeHelpers();
  const store = fakeStore({ "runtime.mode": "remote", "runtime.remoteUrl": "https://music.spice-app.xyz" });
  context.store = store;
  const state = evalIn(context, "getRuntimeModeState(store)");
  assert.equal(state.mode, "remote");
  assert.equal(state.remoteUrl, "https://music.spice-app.xyz/");
  assert.equal(evalIn(context, `resolveEffectiveRuntimeMode(${JSON.stringify(state)})`), "remote");
  assert.equal(evalIn(context, "shouldSkipLocalRuntimeLifecycle('remote')"), true);
});

test("remote mode without a URL falls back to local", () => {
  const context = loadRuntimeHelpers();
  for (const remoteUrl of ["", "   ", "not a url", null]) {
    const store = fakeStore({ "runtime.mode": "remote", "runtime.remoteUrl": remoteUrl });
    context.store = store;
    const state = evalIn(context, "getRuntimeModeState(store)");
    assert.equal(
      evalIn(context, `resolveEffectiveRuntimeMode(${JSON.stringify(state)})`),
      "local",
      `remoteUrl ${JSON.stringify(remoteUrl)} must fall back to local`,
    );
  }
});

test("non-https remote URLs are rejected", () => {
  const context = loadRuntimeHelpers();
  for (const candidate of [
    "http://music.spice-app.xyz/",
    "ftp://music.spice-app.xyz/",
    "//music.spice-app.xyz/",
    "music.spice-app.xyz",
    "",
  ]) {
    assert.equal(
      evalIn(context, `normalizeRemoteRuntimeUrl(${JSON.stringify(candidate)})`),
      null,
      `${candidate} must be rejected`,
    );
  }
  assert.equal(
    evalIn(context, `normalizeRemoteRuntimeUrl("https://music.spice-app.xyz")`),
    "https://music.spice-app.xyz/",
  );
});

test("authorization header is present only in remote mode with a token", () => {
  const context = loadRuntimeHelpers();
  assert.equal(evalIn(context, `buildRuntimeAuthorizationHeader("remote", "device-token")`), "Bearer device-token");
  assert.equal(evalIn(context, `buildRuntimeAuthorizationHeader("local", "device-token")`), null);
  assert.equal(evalIn(context, `buildRuntimeAuthorizationHeader("remote", null)`), null);
  assert.equal(evalIn(context, `buildRuntimeAuthorizationHeader("remote", "")`), null);
});

test("remote runtime URLs join API paths and reject non-https bases", () => {
  const context = loadRuntimeHelpers();
  assert.equal(
    evalIn(context, `buildRemoteRuntimeUrl("https://music.spice-app.xyz/", "/api/runtime")`),
    "https://music.spice-app.xyz/api/runtime",
  );
  assert.throws(() => evalIn(context, `buildRemoteRuntimeUrl("http://music.spice-app.xyz/", "/api/runtime")`));
});

// --- Wiring contract (source patterns) ---

test("main process registers the runtime IPC channels", () => {
  for (const channel of [
    "spice:runtime:get",
    "spice:runtime:set",
    "spice:runtime:register",
    "spice:runtime:test-connection",
    "spice:runtime:unlink",
  ]) {
    assert.ok(main.includes(channel), `main.js must handle ${channel}`);
  }
});

test("preload exposes runtime IPC and nothing else new", () => {
  for (const channel of [
    "spice:runtime:get",
    "spice:runtime:set",
    "spice:runtime:register",
    "spice:runtime:test-connection",
    "spice:runtime:unlink",
  ]) {
    assert.ok(preload.includes(channel), `preload.js must expose ${channel}`);
  }
  assert.match(preload, /testConnection:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("spice:runtime:test-connection"\)/);
});

test("renderer sees only a hasToken boolean, never the plaintext token", () => {
  assert.match(main, /safeStorage/);
  assert.match(main, /decryptString/);
  assert.match(main, /encryptString/);
  assert.match(main, /saveRemoteRuntimeToken/);
  const publicState = extractFunction(main, "getRuntimeModePublicState");
  assert.match(publicState, /hasToken/);
  assert.doesNotMatch(publicState, /[^A-Za-z]token\s*:/);
  assert.doesNotMatch(publicState, /token:\s*getRemoteRuntimeToken/);
});

test("device registration requires SPICE-account login, then posts the hostname with the session token", () => {
  const register = extractFunction(main, "registerRemoteRuntimeDevice");
  assert.match(register, /getNativeAccountSnapshot/);
  assert.match(register, /Sign in to your SPICE account first/);
  assert.match(register, /\/api\/account\/devices/);
  assert.match(register, /hostname/);
  assert.match(register, /Authorization/);
});

test("resolveServiceUrl prefers the cloud origin in remote mode and stays identical in local mode", () => {
  const resolver = extractFunction(main, "resolveServiceUrl");
  assert.match(resolver, /resolveEffectiveRuntimeMode/);
  assert.match(resolver, /isRemoteSpiceRuntimeReachable/);
  assert.match(resolver, /falling back to the local runtime/);
  assert.match(main, /async function isRemoteSpiceRuntimeReachable/);
  assert.match(main, /\/api\/runtime/);
  // Local path markers relied on by existing parity tests stay intact.
  assert.match(resolver, /if \(await isLocalSpiceRuntimeReady\(\)\) return SPICE_LOCAL_RUNTIME_URL;/);
  assert.match(resolver, /spiceRuntimeManager\.start\(\)/);
});

test("remote mode skips all local-runtime lifecycle in the main process", () => {
  const ensure = extractFunction(main, "ensureLocalRuntimeReady");
  assert.match(ensure, /shouldSkipLocalRuntimeLifecycle/);
  const guard = extractFunction(main, "isRemoteRuntimeModeActive");
  assert.match(guard, /shouldSkipLocalRuntimeLifecycle/);
  for (const channel of [
    "spice-runtime-status",
    "spice-runtime-install",
    "spice-runtime-start",
    "spice-runtime-stop",
  ]) {
    assert.match(
      handlerBody(main, channel),
      /isRemoteRuntimeModeActive\(\)/,
      `${channel} must short-circuit in remote mode`,
    );
    assert.match(handlerBody(main, channel), /skipped/);
  }
  // spice-runtime-prepare keeps its exact shape and skips via the
  // ensureLocalRuntimeReady choke point, which early-returns in remote mode.
  assert.match(
    handlerBody(main, "spice-runtime-prepare"),
    /return ensureLocalRuntimeReady\(\);/,
  );
  assert.match(handlerBody(main, "native-runtime-prepare", 400), /isRemoteRuntimeModeActive\(\)/);
  assert.match(main, /isRemoteRuntimeModeActive\(\)[\s\S]{0,120}spiceRuntimeManager\.stop/);
  assert.match(main, /spiceRuntimeManager && !isRemoteRuntimeModeActive\(\)/);
});

test("runtime-bound fetches send a bearer token in remote mode and nothing extra in local mode", () => {
  assert.match(main, /applyRemoteRuntimeAuthHeaders/);
  const auth = extractFunction(main, "applyRemoteRuntimeAuthHeaders");
  assert.match(auth, /Authorization/);
  assert.match(auth, /resolveEffectiveRuntimeMode/);
  const cloudAuth = extractFunction(main, "nativeCloudAuth");
  assert.match(cloudAuth, /resolveRuntimeBaseUrl/);
  assert.match(cloudAuth, /applyRemoteRuntimeAuthHeaders/);
});

test("start-native launches the shared main process and duplicates no runtime lifecycle", () => {
  assert.match(startNative, /SPICE_NATIVE_APP/);
  assert.doesNotMatch(startNative, /spiceRuntimeManager/);
  assert.doesNotMatch(startNative, /installOrUpdate/);
  assert.doesNotMatch(startNative, /ensureBundledRuntimeInstalled/);
});
