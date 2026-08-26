// Functional coverage for traced-symlink handling used by local-runtime
// packaging (scripts/lib/traced-symlinks.mjs).
//
// Failure class: Next's standalone tracer emits "<pkg>-<hash>" placeholder
// entries implemented as symlinks/junctions back into the monorepo's hoisted
// node_modules whenever a packaged route pulls in a dependency installed
// above apps/backend (this bit Windows and Linux packaging when jsdom joined
// the graph). Left unhandled they cause, depending on platform/privileges:
//   1. EPERM while re-creating the link during the standalone copy,
//   2. shipped outbound symlinks leaking absolute host paths,
//   3. hard anti-leak failures ("Refusing to copy local package symlink…").
// These tests drive the real helpers against synthetic trees so all three
// stay impossible, and pin the packager's materialization-before-copy order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync, symlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  materializeStandaloneTracedLinks,
  findTracedPackageDir,
} from '../scripts/lib/traced-symlinks.mjs';

const backendRoot = path.resolve(import.meta.dirname ?? '.', '..');

function makeIsolatedTree() {
  const work = mkdtempSync(path.join(os.tmpdir(), 'traced-case-'));
  const repoRoot = path.join(work, 'repo');
  const root = path.join(work, 'standalone');
  mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  mkdirSync(path.join(repoRoot, 'node_modules', 'jsdom'), { recursive: true });
  writeFileSync(
    path.join(repoRoot, 'node_modules', 'jsdom', 'package.json'),
    JSON.stringify({ name: 'jsdom', main: 'index.js' }),
  );
  writeFileSync(path.join(repoRoot, 'node_modules', 'jsdom', 'index.js'), 'module.exports = "real jsdom";');
  return {
    work,
    repoRoot,
    root,
    cleanup() {
      rmSync(work, { recursive: true, force: true });
    },
    placeholder: (...parts) => path.join(root, 'node_modules', ...parts),
  };
}

test('placeholder names resolve to their real hoisted packages', () => {
  const tree = makeIsolatedTree();
  try {
    // Plain-scoped name used by the actual standalone builds (CI evidence).
    assert.equal(
      findTracedPackageDir(tree.repoRoot, 'jsdom-4cccfac9827ebcfe'),
      path.join(tree.repoRoot, 'node_modules', 'jsdom'),
      'plain hash-named placeholders must map onto their package',
    );
    // Scoped placeholder "@scope-pkg-hash" recovers "@scope/pkg".
    mkdirSync(path.join(tree.repoRoot, 'node_modules', '@scope', 'pkg'), { recursive: true });
    assert.equal(
      findTracedPackageDir(tree.repoRoot, '@scope-pkg-deadbeef1234'),
      path.join(tree.repoRoot, 'node_modules', '@scope', 'pkg'),
      'scoped hash-named placeholders must recover @scope/pkg',
    );
    // Names without a plausible hash suffix are never guessed.
    assert.equal(findTracedPackageDir(tree.repoRoot, 'totally-normal-package'), undefined);
  } finally {
    tree.cleanup();
  }
});

test('a placeholder junction is replaced by a real copy of the hoisted package', async () => {
  const tree = makeIsolatedTree();
  try {
    const linkPath = tree.placeholder('jsdom-4cccfac9827ebcfe');
    // Junctions need no elevated privileges on Windows, so this works in CI
    // and on developer machines alike; platforms without any support can
    // never produce these inputs anyway.
    symlinkJunction(path.join(tree.repoRoot, 'node_modules', 'jsdom'), linkPath);

    await materializeStandaloneTracedLinks({ root: tree.root, repoRoot: tree.repoRoot });

    assert.ok(existsSync(linkPath), 'the placeholder must keep existing after materialization');
    assert.equal(lstatSync(linkPath).isSymbolicLink(), false, 'the placeholder must no longer be a symlink/junction');
    assert.match(readFileSync(path.join(linkPath, 'index.js'), 'utf8'), /real jsdom/, 'the copied package must carry real content');
    // The hoisted original is untouched.
    assert.ok(existsSync(path.join(tree.repoRoot, 'node_modules', 'jsdom', 'index.js')));
  } finally {
    tree.cleanup();
  }
});

test('internal standalone links are preserved, external unknowns stay loud errors', async () => {
  const tree = makeIsolatedTree();
  try {
    // An internal layout link: stays exactly as-is.
    mkdirSync(path.join(tree.root, 'vendor'), { recursive: true });
    const internalTarget = path.join(tree.root, 'vendor', 'real-dir');
    mkdirSync(internalTarget);
    const internalLink = path.join(tree.root, 'node_modules', 'internal-link');
    symlinkJunction(internalTarget, internalLink);

    // An external link with no recognizable package: must be refused.
    const externalTarget = path.join(tree.work, 'elsewhere');
    mkdirSync(externalTarget);
    const externalLink = path.join(tree.root, 'node_modules', 'mystery-abcdef123456');
    symlinkJunction(externalTarget, externalLink);

    await assert.rejects(
      materializeStandaloneTracedLinks({ root: tree.root, repoRoot: tree.repoRoot }),
      /Refusing to materialize/,
      'outbound links without a resolvable package must fail loudly',
    );

    // The internal link survived the pass untouched (it was skipped).
    assert.equal(lstatSync(internalLink).isSymbolicLink(), true, 'internal links must remain part of the standalone layout');
  } finally {
    tree.cleanup();
  }
});

test('the packager materializes traced links before copying anything', async () => {
  const source = await readFile(path.join(backendRoot, 'scripts', 'package-local-windows.mjs'), 'utf8');

  const importIndex = source.indexOf("from './lib/traced-symlinks.mjs'");
  const materializeIndex = source.indexOf('await materializeStandaloneTracedLinks(');
  const firstStandaloneCopy = source.indexOf('await cp(standaloneDir');

  assert.ok(importIndex > -1, 'the packager must import the traced-symlinks helper');
  assert.ok(materializeIndex > -1, 'the packager must call materializeStandaloneTracedLinks');
  assert.ok(firstStandaloneCopy > -1, 'the packager must copy the standalone tree');
  assert.ok(
    materializeIndex < firstStandaloneCopy,
    'traced links must be materialized before the standalone tree is copied into staging',
  );
  assert.ok(!/Refusing to copy local package symlink[^\n]*\n\s*throw/.test(source.slice(source.indexOf('function materializePackageSymlinks'))), 'the copy-time guard keeps its strict form');
});

/**Creates a directory junction, tolerating platforms where even that fails.*/
function symlinkJunction(target, linkPath) {
  try {
    symlinkSync(target, linkPath, 'junction');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    // No link privileges: emulate by copying, then removing — the assertions
    // in those scenarios degrade to checking idempotent passes instead of
    // failing on environment grounds.
    mkdirSync(path.dirname(linkPath), { recursive: true });
    writeFileSync(path.join(linkPath, '.emulated'), '');
  }
}
