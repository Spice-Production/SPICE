import { createHash, randomBytes } from 'node:crypto';

/** Prefix for per-device self-host media tokens handed to remote clients. */
export const REMOTE_MEDIA_DEVICE_TOKEN_PREFIX = 'spice_rm_';

/** Maximum stored device display name length (matches the contract). */
export const REMOTE_MEDIA_DEVICE_NAME_MAX_LENGTH = 64;

/** Maximum active devices per user before POST returns { error: 'device_limit' }. */
export const REMOTE_MEDIA_DEVICE_LIMIT = 10;

/**
 * Mint a per-device media token. The plaintext is returned to the caller
 * exactly once at creation; only its sha256 hex digest is ever stored.
 */
export function createRemoteMediaDeviceToken(random: typeof randomBytes = randomBytes): string {
  return `${REMOTE_MEDIA_DEVICE_TOKEN_PREFIX}${random(32).toString('base64url')}`;
}

export function isRemoteMediaDeviceToken(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.startsWith(REMOTE_MEDIA_DEVICE_TOKEN_PREFIX)
    && value.length >= REMOTE_MEDIA_DEVICE_TOKEN_PREFIX.length + 40
  );
}

/**
 * Hash a device token to its stored form: hex sha256 of the plaintext.
 * Returns null for foreign values so callers never store a bad digest.
 */
export function hashRemoteMediaDeviceToken(value: unknown): string | null {
  if (!isRemoteMediaDeviceToken(value)) return null;
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Normalize a caller-supplied device name: trim, require non-empty, cap at
 * 64 chars. Returns null when no usable name was provided.
 */
export function normalizeRemoteMediaDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REMOTE_MEDIA_DEVICE_NAME_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Self-host gate verification. Media routes call the gate synchronously, so
// per-device bearer checks below are sync reads over an allowlist that is
// verified asynchronously (indexed WHERE token_hash = sha256(bearer) point
// lookup) and refreshed in the background. Device create/revoke routes write
// through to the same set, so tokens work (and stop working) immediately in
// the serving process; other processes converge on next verification.
// ---------------------------------------------------------------------------

const VERIFIED_TOKEN_CACHE_TTL_MS = 30_000;

let verifiedTokenHashes: { hashes: Set<string>; loadedAt: number } | null = null;
const inflightVerifications = new Map<string, Promise<void>>();

function verifiedCacheStale(): boolean {
  return !verifiedTokenHashes || Date.now() - verifiedTokenHashes.loadedAt > VERIFIED_TOKEN_CACHE_TTL_MS;
}

/** Write-through on device create: the plaintext token's hash passes immediately. */
export function noteRemoteMediaDeviceTokenHash(tokenHash: string): void {
  if (verifiedCacheStale()) {
    verifiedTokenHashes = { hashes: new Set(), loadedAt: Date.now() };
  }
  verifiedTokenHashes?.hashes.add(tokenHash);
}

/** Write-through on device revoke: a revoked hash stops passing immediately. */
export function forgetRemoteMediaDeviceTokenHash(tokenHash: string): void {
  verifiedTokenHashes?.hashes.delete(tokenHash);
}

function verifyTokenHashAsync(tokenHash: string): void {
  if (inflightVerifications.has(tokenHash)) return;
  if (!process.env.DATABASE_URL) return;
  const pending = (async () => {
    try {
      const [{ db }, { remoteMediaDevices }, { eq }] = await Promise.all([
        import('@/db'),
        import('@/db/schema'),
        import('drizzle-orm'),
      ]);
      const row = await db.query.remoteMediaDevices.findFirst({
        columns: { tokenHash: true },
        where: eq(remoteMediaDevices.tokenHash, tokenHash),
      });
      if (row) noteRemoteMediaDeviceTokenHash(row.tokenHash);
    } catch {
      // Transient (cold DB, DNS): stay unverified; the next device-token
      // request retries verification.
    }
  })();
  inflightVerifications.set(tokenHash, pending);
  void pending.finally(() => {
    inflightVerifications.delete(tokenHash);
  });
}

/**
 * Sync gate predicate: true when the request carries a per-device media
 * token whose sha256 hash is already verified. Unknown hashes kick off a
 * background indexed lookup and report false until it completes, so callers
 * stay synchronous while the allowlist converges without polling the DB.
 */
export function isVerifiedRemoteMediaDeviceRequest(request: Request): boolean {
  const header = request.headers.get('authorization')?.trim() ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const bearer = header.substring(7).trim();
  if (!isRemoteMediaDeviceToken(bearer)) return false;
  const tokenHash = hashRemoteMediaDeviceToken(bearer);
  if (!tokenHash) return false;
  if (verifiedCacheStale()) {
    // Drop memoized positives so revocations converge; in-flight and future
    // lookups re-verify against the database.
    verifiedTokenHashes = { hashes: new Set(), loadedAt: Date.now() };
  }
  if (verifiedTokenHashes?.hashes.has(tokenHash)) return true;
  verifyTokenHashAsync(tokenHash);
  return false;
}
