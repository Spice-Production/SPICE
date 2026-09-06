import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tsImport } from 'tsx/esm/api';

const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const importTs = (path) => tsImport(path, {
  parentURL: import.meta.url,
  tsconfig,
});

const cloudRoute = await importTs('../app/api/cloud/[...path]/route.ts');

function cloudPost(path) {
  // Bind-based request URL (what the standalone server sees in production)
  // with the client-facing host forwarded by Caddy.
  return cloudRoute.POST(
    new Request(`http://0.0.0.0:3000/api/cloud/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'music.spice-app.xyz',
        'x-forwarded-proto': 'https',
      },
    }),
    { params: Promise.resolve({ path: path.split('/') }) },
  );
}

test('cloud namespace redirects at the client-facing origin, never the bind address', async () => {
  const saved = process.env.SPICE_RUNTIME_TARGET;
  process.env.SPICE_RUNTIME_TARGET = 'selfhost';
  try {
    const res = await cloudPost('auth/spice/signin');
    assert.equal(res.status, 307);
    const location = new URL(res.headers.get('location'));
    // Regression: the redirect used request.url's origin (https://0.0.0.0:3000),
    // which browsers block — killing login, sync, and account on the web.
    assert.equal(location.host, 'music.spice-app.xyz');
    assert.equal(location.protocol, 'https:');
    assert.equal(location.pathname, '/api/auth/spice/signin');
  } finally {
    if (saved === undefined) delete process.env.SPICE_RUNTIME_TARGET;
    else process.env.SPICE_RUNTIME_TARGET = saved;
  }
});
