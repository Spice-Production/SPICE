import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { normalizeAccountRole, type AccountRole } from './account';
import { assertAccountModerationAllowed, resolveAccountModeration } from './moderation';

let jwtSecret: Uint8Array | null = null;

function getJwtSecret() {
  if (jwtSecret) return jwtSecret;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      console.warn('Warning: Missing JWT_SECRET. Using fallback for dev/test.');
      jwtSecret = new TextEncoder().encode('spice_dev_secret_key_32_characters_minimum');
      return jwtSecret;
    }
    throw new Error('Missing JWT_SECRET environment variable.');
  }

  jwtSecret = new TextEncoder().encode(secret);
  return jwtSecret;
}

export interface SpiceSession {
  userId: string;
  email: string;
  accountRole: AccountRole;
}

interface LastFmLinkPayload {
  userId: string;
  email: string;
  accountRole?: string;
  purpose: 'lastfm_link';
}

export async function signSession(session: SpiceSession): Promise<string> {
  return await new SignJWT({
    userId: session.userId,
    email: session.email,
    accountRole: normalizeAccountRole(session.accountRole),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getJwtSecret());
}

export async function signLastFmLinkState(session: SpiceSession): Promise<string> {
  return await new SignJWT({
    userId: session.userId,
    email: session.email,
    accountRole: normalizeAccountRole(session.accountRole),
    purpose: 'lastfm_link',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getJwtSecret());
}

export async function verifySession(token: string): Promise<SpiceSession> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid session token.');
  }

  // Reload the account from the database so role and moderation changes apply
  // immediately instead of waiting for the 30-day JWT to expire. Blocked
  // accounts (temporarily timed out or permanently banned) are rejected on
  // every authenticated call, which kills existing sessions instantly.
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      accountRole: true,
      moderationStatus: true,
      moderationExpiresAt: true,
      moderationReason: true,
    },
    where: eq(users.id, payload.userId),
  });
  if (!user) {
    throw new Error('Invalid session token.');
  }

  assertAccountModerationAllowed(resolveAccountModeration(user));

  return {
    userId: user.id,
    email: user.email,
    accountRole: normalizeAccountRole(user.accountRole),
  };
}

export async function verifyLastFmLinkState(token: string): Promise<SpiceSession> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const linkPayload = payload as unknown as LastFmLinkPayload;
  if (linkPayload.purpose !== 'lastfm_link') {
    throw new Error('Invalid Last.fm link state.');
  }

  return {
    userId: linkPayload.userId,
    email: linkPayload.email,
    accountRole: normalizeAccountRole(linkPayload.accountRole),
  };
}
