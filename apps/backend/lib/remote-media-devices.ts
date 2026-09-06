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
