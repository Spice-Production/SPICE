const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const preloadSource = fs.readFileSync(
  path.join(repoRoot, "preload-view.js"),
  "utf8",
);
const mainSource = fs.readFileSync(path.join(repoRoot, "main.js"), "utf8");

function extractFunction(source, name) {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist`);

  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Could not extract ${name}`);
}

const context = vm.createContext({});
const muteConfirmMatch = preloadSource.match(/AD_MUTE_CONFIRM_MS = (\d+)/);
const unmuteConfirmMatch = preloadSource.match(/AD_UNMUTE_CONFIRM_MS = (\d+)/);
assert.ok(muteConfirmMatch && unmuteConfirmMatch, "hysteresis windows must be declared");
vm.runInContext(
  [
    `const AD_MUTE_CONFIRM_MS = ${muteConfirmMatch[1]};`,
    `const AD_UNMUTE_CONFIRM_MS = ${unmuteConfirmMatch[1]};`,
    extractFunction(preloadSource, "shouldMuteAdVideo"),
    extractFunction(preloadSource, "shouldRestoreAdAudio"),
  ].join("\n"),
  context,
);

test("ad mute waits for the signal to persist before muting", () => {
  const firstSeen = 1_000;
  assert.equal(context.shouldMuteAdVideo(firstSeen, firstSeen), false, "no instant mute on first sighting");
  assert.equal(context.shouldMuteAdVideo(firstSeen, firstSeen + 349), false, "still inside the confirm window");
  assert.equal(context.shouldMuteAdVideo(firstSeen, firstSeen + 350), true, "mutes once the signal held");
  assert.equal(context.shouldMuteAdVideo(0, firstSeen + 999_999), false, "never mutes without a sighting");
});

test("ad audio restore only touches our own mute and requires a clear window", () => {
  const mutedVideo = { muted: true, dataset: { spiceAdMuted: "1" } };
  const userMutedVideo = { muted: true, dataset: {} };
  const loudVideo = { muted: false, dataset: {} };
  const lastSeen = 5_000;

  assert.equal(
    context.shouldRestoreAdAudio(mutedVideo, lastSeen, lastSeen + 699),
    false,
    "stays muted inside the clear window (flicker protection)",
  );
  assert.equal(
    context.shouldRestoreAdAudio(mutedVideo, lastSeen, lastSeen + 700),
    true,
    "restores once the clear state held",
  );
  assert.equal(
    context.shouldRestoreAdAudio(userMutedVideo, lastSeen, lastSeen + 9_999),
    false,
    "never unmutes a mute the user chose",
  );
  assert.equal(
    context.shouldRestoreAdAudio(loudVideo, lastSeen, lastSeen + 9_999),
    false,
    "ignores already-loud videos",
  );
  assert.equal(
    context.shouldRestoreAdAudio(mutedVideo, 0, lastSeen + 9_999),
    false,
    "never restores when no ad was ever seen",
  );
});

test("the injected ad-blocker interval uses the same hysteresis discipline", () => {
  assert.match(
    mainSource,
    /adSignalTicks \+= 1[\s\S]*?clearSignalTicks \+= 1[\s\S]*?adSignalTicks >= 2/,
    "main-process ad script must require two sustained ad ticks before muting",
  );
  assert.match(
    mainSource,
    /clearSignalTicks >= 2 && video\.muted/,
    "main-process ad script must require two sustained clear ticks before restoring",
  );
  assert.match(
    mainSource,
    /video\.dataset\.spiceAdMuted === '1'/,
    "restore must be limited to mutes SPICE applied",
  );
  assert.match(
    preloadSource,
    /AD_MUTE_CONFIRM_MS = 350/,
  );
  assert.match(
    preloadSource,
    /AD_UNMUTE_CONFIRM_MS = 700/,
  );
});

test("the wrapper volume script only builds the Web Audio boost graph when boosting", () => {
  assert.match(
    mainSource,
    /const wantsWebAudio = window\.spiceOwnsMediaVolume\s*\n\s*\? window\.spiceBoostGain !== 1\s*\n\s*: window\.spiceBoostGain > 1;/,
    "AudioContext creation must be gated on an active boost",
  );
  assert.match(
    mainSource,
    /const boostActive = wantsWebAudio \|\| !!window\.boostSource;/,
    "the boost graph gate must include previously rerouted elements",
  );
  assert.match(
    mainSource,
    /if \(!boostActive\) return;/,
    "normal volumes must skip the boost graph entirely",
  );
  assert.match(
    mainSource,
    /window\.boostCtx\.onstatechange = function\(\) \{/,
    "an active boost context must self-resume on suspension",
  );
  assert.match(
    preloadSource,
    /userVolumeDragActive/,
    "the audio bridge must track active drags",
  );
  assert.match(
    preloadSource,
    /desktopAudioPayloadApplied && userVolumeDragActive/,
    "payload pushes must be skipped while the user is dragging a slider",
  );
});

test("only YouTube Music runs the wrapper slider independently of the site volume", () => {
  // Ownership is granted exclusively to the YouTube Music service.
  assert.match(
    mainSource,
    /ownsMediaVolume: currentService === "yt"/,
    "independent-slider mode must be limited to YouTube Music",
  );

  // In that mode the page keeps owning media.volume, so the injected script
  // never writes it; every other service still gets the legacy behavior.
  assert.match(
    mainSource,
    /if \(window\.spiceOwnsMediaVolume\) \{[\s\S]*?\} else if \(media\.volume !== window\.spiceMediaVolume\) \{\s*\n\s*media\.volume = window\.spiceMediaVolume;/,
    "media.volume writes must be skipped only in independent-slider mode",
  );

  // The whole desktop multiplier rides the Web Audio gain there (including
  // values below 100%), so both sliders stay fully independent.
  assert.match(
    mainSource,
    /window\.spiceBoostGain = \$\{options\.ownsMediaVolume \? stages\.totalGain : stages\.boostGain\};/,
  );
});
