// Helpers shared by the local-runtime packagers for dealing with Next.js
// dependency-tracer placeholder links.
//
// Failure class being covered: when a packaged route pulls in a dependency
// that npm hoisted above apps/backend (e.g. jsdom), Next's standalone tracer
// emits placeholder entries named "<pkg>-<hash>" under the standalone tree,
// implemented as directory symlinks/junctions pointing back into the
// monorepo's node_modules. Left in place they either fail to copy (EPERM
// without symlink privileges), leak absolute host paths into shipped
// artifacts, or trip anti-leak guards downstream. They must be resolved to
// their real package content before packaging copies anything.

import { existsSync } from 'node:fs';
import { readdir, readlink, rm } from 'node:fs/promises';
import path from 'node:path';

export { cp, mkdir } from 'node:fs/promises';

/**
 * Resolves a hash-suffixed placeholder directory (e.g. "jsdom-4cccfac9827ebcfe")
 * to its true package directory inside <repoRoot>/node_modules. Scoped
 * placeholders use the "@scope-pkg-hash" form. Returns undefined when no
 * confident match exists — callers must then fail loudly rather than guess.
 */
export function findTracedPackageDir(repoRoot, placeholderName) {
  const base = path.basename(placeholderName);
  const hashMatch = base.match(/^(?<name>.+)-(?<hash>[0-9a-f]{8,})$/);
  if (!hashMatch) return undefined;
  let { name } = hashMatch.groups;
  let resolved = path.join(repoRoot, 'node_modules', name);
  if (existsSync(resolved)) return resolved;
  if (name.startsWith('@')) {
    const withoutScope = name.slice(1);
    const separator = withoutScope.indexOf('-');
    if (separator > 0) {
      name = `@${withoutScope.slice(0, separator)}/${withoutScope.slice(separator + 1)}`;
      resolved = path.join(repoRoot, 'node_modules', name);
      if (existsSync(resolved)) return resolved;
    }
  }
  return undefined;
}

/**True when `candidate` lies inside `root` (or equals it).*/
export function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**Collects every symlink/junction path under `dir` recursively.*/
export async function collectSymlinks(dir, links) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      links.push(fullPath);
    } else if (entry.isDirectory()) {
      await collectSymlinks(fullPath, links);
    }
  }
}

/**
 * Replaces placeholder links pointing OUTSIDE `root` (typically into the
 * monorepo's hoisted node_modules) with real copies of their packages.
 * Links staying inside `root`/`fixedRoots` belong to the standalone layout
 * itself and are left untouched. Unresolvable external links throw so that
 * stray leaks can never silently enter a shipped package.
 */
export async function materializeStandaloneTracedLinks({ root, repoRoot }) {
  const links = [];
  await collectSymlinks(root, links);

  for (const link of links) {
    const rawTarget = await readlink(link);
    const target = path.resolve(path.dirname(link), rawTarget);
    if (isPathInside(target, root)) continue;

    const mapped = findTracedPackageDir(repoRoot, link);
    if (!mapped || !existsSync(mapped)) {
      throw new Error(
        `Refusing to materialize local package symlink outside the standalone build: ${link} -> ${target}`,
      );
    }

    await rm(link, { recursive: true, force: true });
    const { cp } = await import('node:fs/promises');
    await cp(mapped, link, { recursive: true, dereference: true });
  }
}
