const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");

function wrapperInstalledBranch() {
  const marker = "if (status.supported && status.installed)";
  const index = main.indexOf(marker);
  assert.notEqual(index, -1, "wrapper installed runtime branch is missing");
  return main.slice(index, index + 4000);
}

test("wrapper upgrades the bundled runtime before spawning it", () => {
  const branch = wrapperInstalledBranch();
  assert.match(branch, /ensureBundledRuntimeInstalled/);
  assert.match(branch, /spiceRuntimeManager\.start\(\)/);
  assert.ok(
    branch.indexOf("ensureBundledRuntimeInstalled") < branch.indexOf("spiceRuntimeManager.start()"),
    "bundled upgrade must run before start, or the wrapper keeps playing through a stale runtime while native runs the fix",
  );
});

test("wrapper names a stale externally-started runtime instead of failing silently", () => {
  assert.match(main, /stale SPICE local runtime/);
  assert.match(main, /installed \$\{status\.installedVersion\}, bundled \$\{status\.bundledVersion\}/);
});

test("native path upgrades the bundled runtime before starting", () => {
  const marker = "async function ensureLocalRuntimeReady";
  const index = main.indexOf(marker);
  assert.notEqual(index, -1, "ensureLocalRuntimeReady is missing");
  const body = main.slice(index, index + 1200);
  assert.match(body, /ensureBundledRuntimeInstalled/);
  assert.match(body, /spiceRuntimeManager\.start\(\)/);
  assert.ok(
    body.indexOf("ensureBundledRuntimeInstalled") < body.indexOf("spiceRuntimeManager.start()"),
    "native must upgrade before start so both shells converge on the same runtime",
  );
});
