/**
 * Password-reset challenge helpers.
 *
 * Same shape as the email-verification flow: the raw token only ever travels
 * by email, the database keeps its SHA-256 digest, challenges are single-use
 * with a bounded lifetime, and wrong guesses are counted so tokens cannot be
 * brute-forced quietly.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_MAX_SENDS = 5;
export const PASSWORD_RESET_MAX_ATTEMPTS = 10;
export const PASSWORD_RESET_MAX_PER_HOUR = 5;

/**
 * Password rule, mirroring signup: at least 8 characters with uppercase,
 * lowercase, digit, and special character.
 */
const PASSWORD_POLICY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=[\]{}|;:',./<>?~`-])[A-Za-z\d@$!%*?&#^()_+=[\]{}|;:',./<>?~`-]{8,}$/;

export function isAcceptablePassword(value: unknown): value is string {
  return typeof value === 'string' && PASSWORD_POLICY.test(value);
}

export function createPasswordResetToken(random: () => Buffer = () => randomBytes(32)): string {
  return random().toString('hex');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyPasswordResetToken(candidate: string, expectedHash: string): boolean {
  if (typeof candidate !== 'string' || !candidate) return false;
  const candidateHash = hashPasswordResetToken(candidate);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordResetExpiresAt(now = Date.now()): Date {
  return new Date(now + PASSWORD_RESET_TTL_MS);
}

export function passwordResetChallengeExpired(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}
