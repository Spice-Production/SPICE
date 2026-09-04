const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");

test("track and queue polls carry in-flight guards", () => {
  assert.match(main, /let isTrackPollInFlight = false/);
  assert.match(main, /let isQueuePollInFlight = false/);
  assert.match(main, /if \(isTrackPollInFlight\) return;/);
  assert.match(main, /if \(isQueuePollInFlight\) return;/);
});

test("polls skip destroyed views instead of serializing a dead page", () => {
  assert.ok(
    main.includes("activeView.webContents.isDestroyed()"),
    "poll ticks must bail out once the view is destroyed",
  );
});

test("poll failures are throttled instead of logging every 350ms tick", () => {
  assert.match(main, /let trackPollErrorCount = 0/);
  assert.match(main, /trackPollErrorCount % 20 === 1/);
});

test("stopping polling resets the in-flight guards", () => {
  const marker = "function stopTrackPolling";
  const index = main.indexOf(marker);
  assert.notEqual(index, -1, "stopTrackPolling is missing");
  const body = main.slice(index, index + 800);
  assert.match(body, /isTrackPollInFlight = false/);
  assert.match(body, /isQueuePollInFlight = false/);
  assert.match(body, /trackPollErrorCount = 0/);
});
