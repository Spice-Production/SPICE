import { jsonResponse, optionsResponse } from '@/lib/cors';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPasswordAsync } from '@/lib/hash';
import { signSession } from '@/lib/auth';
import { getAccountSnapshotForUserId } from '@/lib/accounts';
import { accountModerationMessage } from '@/lib/moderation';
import { reserveDurableRateLimits } from '@/lib/durable-rate-limit';
import {
  hashRateLimitRequestIp,
  hashScopedRateLimitKey,
  SIGNIN_ACCOUNT_ATTEMPTS_PER_WINDOW,
  SIGNIN_IP_ATTEMPTS_PER_WINDOW,
  SIGNIN_RATE_LIMIT_WINDOW_MS,
} from '@/lib/rate-limit-policy';

export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json().catch(() => ({}));
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return jsonResponse(
        {
          error: 'invalid_inputs',
          message: 'Both email and password are required to sign in.',
        },
        { status: 400 },
        request,
      );
    }

    const normEmail = email.toLowerCase().trim();

    if (!process.env.DATABASE_URL) {
      return jsonResponse(
        {
          error: 'database_not_configured',
          message: 'Backend DATABASE_URL environment variable is not configured. Please configure it in your Vercel settings.',
        },
        { status: 500 },
        request,
      );
    }

    const signInQuota = await reserveDurableRateLimits({
      windowMs: SIGNIN_RATE_LIMIT_WINDOW_MS,
      reservations: [
        {
          scope: 'auth_signin_account',
          keyHash: hashScopedRateLimitKey('auth_signin_account', normEmail),
          limit: SIGNIN_ACCOUNT_ATTEMPTS_PER_WINDOW,
        },
        {
          scope: 'auth_signin_ip',
          keyHash: hashRateLimitRequestIp(request, 'auth_signin_ip'),
          limit: SIGNIN_IP_ATTEMPTS_PER_WINDOW,
        },
      ],
    });
    if (signInQuota.limited) {
      return jsonResponse(
        { error: 'signin_rate_limited', message: 'Too many sign-in attempts. Try again later.' },
        {
          status: 429,
          headers: {
            ...noStore,
            'Retry-After': String(signInQuota.retryAfterSeconds),
          },
        },
        request,
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, normEmail),
    });

    if (!user || !user.passwordHash || !(await verifyPasswordAsync(password, user.passwordHash))) {
      return jsonResponse(
        {
          error: 'invalid_credentials',
          message: 'Incorrect email or password. Please try again.',
        },
        { status: 401 },
        request,
      );
    }

    if (!user.emailVerifiedAt) {
      return jsonResponse(
        {
          error: 'email_not_verified',
          message: 'Verify your email address before signing in. Start registration again to receive a new code.',
        },
        { status: 403 },
        request,
      );
    }

    const account = await getAccountSnapshotForUserId(user.id);
    if (!account) {
      return jsonResponse(
        {
          error: 'account_not_found',
          message: 'The account for these credentials no longer exists.',
        },
        { status: 401 },
        request,
      );
    }

    if (account.moderation.status !== 'active') {
      const moderation = account.moderation;
      const error = moderation.status === 'timeout' ? 'account_timed_out' : 'account_banned';
      return jsonResponse(
        {
          error,
          message: accountModerationMessage(moderation.status, moderation),
          status: moderation.status,
          reason: moderation.reason,
          expiresAt: moderation.expiresAt,
        },
        { status: 403 },
        request,
      );
    }

    const token = await signSession({
      userId: user.id,
      email: user.email,
      accountRole: account.accountRole,
    });

    return jsonResponse({
      token,
      user: account,
      account,
    }, {}, request);
  } catch (error) {
    return jsonResponse(
      {
        error: 'signin_failed',
        message: error instanceof Error ? error.message : 'Sign in failed.',
      },
      { status: 500 },
      request,
    );
  }
}
