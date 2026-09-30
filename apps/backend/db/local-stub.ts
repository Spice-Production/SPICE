function localDbDisabled(): never {
  throw new Error('Cloud database routes are disabled in the SPICE local runtime.');
}

export const db = new Proxy(
  {},
  {
    get() {
      return localDbDisabled();
    },
  },
) as never;

// Mirrors db/index.ts so shared route code compiles against the stub; the
// local runtime never opens a database, so there is no pool to close.
export function isNeonDatabaseUrl(databaseUrl: string): boolean {
  try {
    return new URL(databaseUrl).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

export function closeDatabasePool(): Promise<void> {
  return Promise.resolve();
}
