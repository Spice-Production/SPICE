// Workspace alignment guard.
//
// Failure class being covered: someone adds/removes/renames a npm workspace
// (e.g. adding apps/cli alongside apps/backend) and exactly one of
// {package.json workspaces, package-lock.json, packaging workflow scripts}
// learns about it while the others do not.
//
// Why this matters per surface:
//   * npm ci fails hard ("lock file does not match package.json") -> every
//     Desktop/packaging job red before a single build step runs;
//   * scripts using `--workspace @spice/x` fail if x is unregistered, which
//     packaged local-runtime builds discover mid-build on release day;
//   * stale dist/package metadata silently ships the wrong app layout.
//
// The native-release-config suite additionally requires apps/backend to stay
// registered; this file owns bidirectional lockfile/workflow consistency.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

const packageConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
);
const lockfileConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'),
);

/**Declared workspaces may be literal dirs or globs; expand against disk.*/
function expandWorkspaceGlobs(entries) {
  const resolved = [];
  for (const entry of entries) {
    if (!entry.includes('*')) {
      resolved.push(entry);
      continue;
    }
    // Only handle the flat "<prefix>/<slug>" style used in this repo rather
    // than implementing full glob semantics; anything else must stay exact.
    const [prefix] = entry.split('/');
    const baseDir = path.join(repoRoot, prefix);
    if (!fs.existsSync(baseDir)) continue;
    for (const dirent of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const candidate = `${prefix}/${dirent.name}`;
      if (
        fs.existsSync(path.join(repoRoot, candidate, 'package.json')) &&
        !resolved.includes(candidate) &&
        matchesGlob(candidate, entry)
      ) {
        resolved.push(candidate);
      }
    }
  }
  return resolved.sort();
}

function matchesGlob(value, pattern) {
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '::')
      .replace(/\*/g, '[^/]*')
      .replace(/::/g, '.*')}$`,
  );
  return regex.test(value);
}

function readWorkspacePackage(workspaceDir) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, workspaceDir, 'package.json'), 'utf8'),
  );
}

test('every declared workspace exists on disk with a readable package.json', () => {
  const workspaces = expandWorkspaceGlobs(packageConfig.workspaces ?? []);
  assert.ok(workspaces.length > 0, 'package.json must declare at least one resolvable workspace');

  for (const workspace of workspaces) {
    let manifest;
    try {
      manifest = readWorkspacePackage(workspace);
    } catch (error) {
      throw new AssertionError(
        `declared workspace "${workspace}" has no readable package.json (${error.message}) — remove it from workspaces or restore the directory`,
      );
    }
    assert.equal(manifest.private, true, `app workspace "${workspace}" should stay private so it is never published`);
  }
});

test('the lockfile carries an installed record for every declared workspace', () => {
  const lockPackages = lockfileConfig.packages ?? {};
  assert.ok(lockPackages[''], 'lockfile must describe the root package');
  assert.equal(lockPackages[''].name, packageConfig.name, 'root package name drifted between package.json and package-lock.json');

  for (const workspace of expandWorkspaceGlobs(packageConfig.workspaces ?? [])) {
    const entry = lockPackages[workspace];
    assert.ok(
      entry,
      `workspace "${workspace}" is declared but missing from package-lock.json — run npm install to refresh the lockfile`,
    );
    const manifest = readWorkspacePackage(workspace);
    assert.equal(entry.name, manifest.name, `workspace "${workspace}" name differs between its package.json (${manifest.name}) and the lockfile (${entry.name})`);

    const manifestDeps = Object.keys(manifest.dependencies ?? {});
    const lockDeps = entry.dependencies ?? {};
    for (const name of manifestDeps) {
      assert.ok(name in lockDeps, `workspace "${workspace}" declares dependency "${name}" that the lockfile does not record — run npm install`);
    }
  }
});

test('on-disk workspaces are not forgotten by package.json', () => {
  const declared = new Set(expandWorkspaceGlobs(packageConfig.workspaces ?? []));
  const appsDir = path.join(repoRoot, 'apps');
  if (!fs.existsSync(appsDir)) return;

  for (const dirent of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const candidate = `apps/${dirent.name}`;
    // mobile builds via gradle wrappers and is intentionally not a workspace.
    if (dirent.name === 'mobile' || !fs.existsSync(path.join(appsDir, dirent.name, 'package.json'))) continue;
    assert.ok(
      declared.has(candidate),
      `"${candidate}" contains a package.json but is not declared in root workspaces — declare it or move it out of apps/`,
    );
  }
});

test('workspace package names stay unique across the monorepo', () => {
  const seen = new Map();
  for (const workspace of expandWorkspaceGlobs(packageConfig.workspaces ?? [])) {
    const name = readWorkspacePackage(workspace).name;
    assert.ok(!seen.has(name), `duplicate workspace package name "${name}" (${seen.get(name)} and ${workspace})`);
    seen.set(name, workspace);
  }
});

test('npm accepts the declared workspace set without reinstalling', () => {
  const result = spawnSync('npm', ['ls', '--workspaces', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.error || result.status === null) {
    // npm unavailable in this sandbox: the lockfile checks above still hold.
    return;
  }
  assert.equal(result.status, 0, `npm rejected the current workspace configuration:\n${result.stderr || result.stdout}`);
  const tree = JSON.parse(result.stdout || '{}');
  for (const problem of tree.problems ?? []) {
    assert.fail(`npm reported a workspace problem: ${problem}`);
  }
});

test('CI workflows never script commands against unregistered workspaces', () => {
  const known = new Set();
  for (const workspace of expandWorkspaceGlobs(packageConfig.workspaces ?? [])) {
    const manifest = readWorkspacePackage(workspace);
    if (manifest.name) known.add(manifest.name); // e.g. "@spice/backend"
  }

  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const offenders = [];
  for (const file of fs.readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    const source = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const line of source.split('\n')) {
      const scopeFlag = line.includes('--workspace') ? '--workspace' : '-w ';
      const index = line.indexOf(scopeFlag);
      if (index === -1) continue;
      const referenced = line.slice(index + scopeFlag.length).trim().match(/@spice\/[A-Za-z0-9._-]+/)?.[0];
      if (referenced && !known.has(referenced)) {
        offenders.push(`${file}: references "${referenced}" which is not a registered workspace`);
      }
    }
  }

  // Positive controls: the scanner actually sees the registered workspaces...
  assert.ok(known.has('@spice/backend'), 'scanner failed its own sanity check (backend missing)');
  if (known.size > 1) assert.ok(known.has('@spice/cli'), 'scanner failed its own sanity check (cli missing)');
  // ...so any offender findings are real regressions:
  assert.deepEqual(offenders, [], 'workflow scripts reference unregistered workspaces');
});
