// Shared async generator: yields source files under root, skipping build
// output and dependencies, filtered by extension allowlist.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);

export async function* walk(root, extensions) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      yield* walk(full, extensions);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}
