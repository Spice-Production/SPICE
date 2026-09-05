const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");
const miniServer = fs.readFileSync(path.join(repoRoot, "src", "server.js"), "utf8");

test("redundant service loads cannot stack dom-ready listeners", () => {
  const earlyReturn = main.indexOf("if (currentUrl && currentUrl.startsWith(serviceUrl))");
  const domReady = main.indexOf('view.webContents.once("dom-ready"');
  assert.notEqual(earlyReturn, -1, "same-URL early return is missing");
  assert.notEqual(domReady, -1, "vk-player-config dom-ready hook is missing");
  assert.ok(
    earlyReturn < domReady,
    "the early return must precede the once() registration or every redundant call leaks a listener",
  );
});

test("play-queue-index is validated before page interpolation", () => {
  assert.match(main, /const queueIndex = Number\(index\);/);
  assert.match(main, /if \(!Number\.isInteger\(queueIndex\) \|\| queueIndex < 0\) return;/);
  assert.doesNotMatch(main, /items\[\$\{index\}\]/, "raw IPC value must not reach page JS");
});

test("track detection survives re-injection without duplicating timers", () => {
  const hits = main.match(/__spiceTrackDetectionInstalled/g) || [];
  assert.ok(hits.length >= 4, `yt + sc branches each need check + set (found ${hits.length})`);
});

test("last.fm wizard scrapes never overlap", () => {
  assert.match(main, /let credentialsCheckInFlight = false;/);
  assert.match(main, /credentialsFound \|\| credentialsCheckInFlight/);
});

test("async failures are logged, not silent and not modal", () => {
  assert.match(main, /process\.on\("unhandledRejection"/);
  assert.match(main, /UNHANDLED REJECTION/);
});

test("mini-player server binds loopback only", () => {
  assert.match(miniServer, /server\.listen\(PORT, "127\.0\.0\.1"/);
});

test("mini-player control rejects foreign origins", () => {
  assert.match(miniServer, /req\.headers\.origin/);
  assert.match(miniServer, /originHost !== "localhost" && originHost !== "127\.0\.0\.1"/);
});
