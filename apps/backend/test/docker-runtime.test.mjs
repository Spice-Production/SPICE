import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dockerfileUrl = new URL('../Dockerfile', import.meta.url);
const dockerignoreUrl = new URL('../../../.dockerignore', import.meta.url);

test('backend Docker image starts the hosted standalone runtime', async () => {
  const dockerfile = await readFile(dockerfileUrl, 'utf8');

  assert.match(dockerfile, /^ARG SPICE_RUNTIME_TARGET=vercel$/m);
  assert.match(dockerfile, /^ENV SPICE_RUNTIME_TARGET=\$\{SPICE_RUNTIME_TARGET\}$/m);
  assert.match(dockerfile, /^ENV NEXT_PUBLIC_SPICE_RUNTIME_TARGET=\$\{SPICE_RUNTIME_TARGET\}$/m);
  assert.match(dockerfile, /^WORKDIR \/app\/apps\/backend$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\.\/docker-entrypoint\.sh"\]$/m);
  assert.match(dockerfile, /^CMD \["node", "server\.js"\]$/m);
});

test('backend Docker image ships migrations for self-hosted boots', async () => {
  const dockerfile = await readFile(dockerfileUrl, 'utf8');

  assert.match(dockerfile, /db\/migrations/);
  assert.match(dockerfile, /migrate-selfhost\.mjs/);
  assert.match(dockerfile, /SPICE_RUN_MIGRATIONS/);
});

test('backend Docker runner installs prod deps for the migrate script', async () => {
  const dockerfile = await readFile(dockerfileUrl, 'utf8');
  const runnerStage = dockerfile.slice(dockerfile.indexOf('FROM base AS runner'));
  // migrate-selfhost.mjs imports drizzle-orm + pg, which the standalone
  // trace does not carry — without an explicit prod install the entrypoint
  // crash-loops with ERR_MODULE_NOT_FOUND on first self-host boot.
  assert.match(runnerStage, /npm ci --workspace @spice\/backend --omit=dev/);
});

test('backend Docker context excludes unrelated workspaces and generated output', async () => {
  const dockerignore = await readFile(dockerignoreUrl, 'utf8');

  for (const entry of [
    '.git',
    'node_modules',
    'dist',
    'dist-native',
    'native-runtime',
    'apps/mobile',
    'apps/backend/.next',
    'apps/backend/dist',
  ]) {
    assert.match(dockerignore, new RegExp(`^${entry.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'));
  }
});
