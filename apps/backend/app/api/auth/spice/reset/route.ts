import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { passwordResetChallenges, users } from '@/db/schema';
import { getAccountSnapshotForUserId } from '@/lib/accounts';
import { signSession } from '@/lib/auth';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { normalizeEmailAddress } from '@/lib/email-verification';
import { hashPasswordAsync } from '@/lib/hash';
import {
  isAcceptablePassword,
  PASSWORD_RESET_MAX_ATTEMPTS,
  verifyPasswordResetToken,
} from '@/lib/password-reset';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

/**
 * Completes a password reset: single-use token, signup-grade password rule,
 * then straight into a signed session so the user is simply logged in.
 */
export async function POST(request: Request) {
  try {
    const { email, token, newPassword } = await request.json().catch(() => ({}));
    const normalized = typeof email === 'string' ? normalizeEmailAddress(email) : null;
    if (!normalized || typeof token !== 'string' || !token) {
      return jsonResponse(
        { error: 'invalid_reset', message: 'This reset link is invalid. Request a new one.' },
        { status: 400 },
        request,
      );
    }
    if (!isAcceptablePassword(newPassword)) {
      return jsonResponse(
        {
          error: 'weak_password',
          message: 'Password must be at least 8 characters long, and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
        },
        { status: 400 },
        request,
      );
    }

    const now = new Date();
    const candidates = await db.query.passwordResetChallenges.findMany({
      where: and(
        eq(passwordResetChallenges.email, normalized),
        isNull(passwordResetChallenges.consumedAt),
        gt(passwordResetChallenges.expiresAt, now),
      ),
    });

    let challenge: (typeof candidates)[number] | null = null;
    for (const row of candidates) {
      if (row.attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) continue;
      if (verifyPasswordResetToken(token, row.tokenHash)) {
        challenge = row;
        break;
      }
    }

    if (!challenge) {
      // Count the miss against every live challenge for this email so tokens
      // cannot be guessed quietly.
      for (const row of candidates) {
        if (row.attemptCount < PASSWORD_RESET_MAX_ATTEMPTS) {
          await db
            .update(passwordResetChallenges)
            .set({ attemptCount: row.attemptCount + 1 })
            .where(eq(passwordResetChallenges.id, row.id));
        }
      }
      return jsonResponse(
        { error: 'invalid_reset', message: 'This reset link is invalid or expired. Request a new one.' },
        { status: 400 },
        request,
      );
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, challenge.userId) });
    if (!user) {
      return jsonResponse(
        { error: 'invalid_reset', message: 'This reset link is invalid or expired. Request a new one.' },
        { status: 400 },
        request,
      );
    }

    await db.update(users).set({ passwordHash: await hashPasswordAsync(newPassword) }).where(eq(users.id, user.id));
    // Single use: consume this challenge and retire its siblings.
    await db
      .update(passwordResetChallenges)
      .set({ consumedAt: now })
      .where(eq(passwordResetChallenges.email, normalized));

    const account = await getAccountSnapshotForUserId(user.id);
    if (!account) {
      return jsonResponse(
        { error: 'invalid_reset', message: 'This reset link is invalid or expired. Request a new one.' },
        { status: 400 },
        request,
      );
    }
    const session = await signSession({
      userId: user.id,
      email: user.email,
      accountRole: account.accountRole,
    });
    return jsonResponse({ token: session, user: account, account }, {}, request);
  } catch (error) {
    console.error('password reset failed:', error instanceof Error ? error.message : error);
    return jsonResponse(
      { error: 'reset_failed', message: 'Could not reset the password. Try again.' },
      { status: 500 },
      request,
    );
  }
}
