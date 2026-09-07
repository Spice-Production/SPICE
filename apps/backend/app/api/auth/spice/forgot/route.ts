import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { passwordResetChallenges, users } from '@/db/schema';
import { jsonResponse, optionsResponse } from '@/lib/cors';
import { sendPasswordResetEmail } from '@/lib/email';
import { maskEmailAddress, normalizeEmailAddress } from '@/lib/email-verification';
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_MAX_PER_HOUR,
  PASSWORD_RESET_MAX_SENDS,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  passwordResetExpiresAt,
} from '@/lib/password-reset';
import { effectiveRequestOrigin } from '@/lib/request-host';

export const runtime = 'nodejs';

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

/**
 * Starts a password reset. Always answers 200 so the endpoint never reveals
 * whether an address has an account; per-email cooldown and hourly caps keep
 * it from becoming a mail cannon.
 */
export async function POST(request: Request) {
  const GENERIC_OK = { ok: true, message: 'If that address has an account, a reset link is on its way.' };
  try {
    const { email } = await request.json().catch(() => ({}));
    const normalized = typeof email === 'string' ? normalizeEmailAddress(email) : null;
    if (!normalized) return jsonResponse(GENERIC_OK, {}, request);

    const now = new Date();
    const recent = await db.query.passwordResetChallenges.findMany({
      where: and(
        eq(passwordResetChallenges.email, normalized),
        isNull(passwordResetChallenges.consumedAt),
        gt(passwordResetChallenges.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
      ),
      orderBy: [desc(passwordResetChallenges.createdAt)],
    });

    const latest = recent[0];
    if (latest && now.getTime() - latest.lastSentAt.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
      return jsonResponse(GENERIC_OK, {}, request);
    }
    if (recent.length >= PASSWORD_RESET_MAX_PER_HOUR) {
      return jsonResponse(GENERIC_OK, {}, request);
    }

    const user = await db.query.users.findFirst({ where: eq(users.email, normalized) });
    if (!user) return jsonResponse(GENERIC_OK, {}, request);
    if (latest && latest.sendCount >= PASSWORD_RESET_MAX_SENDS) {
      return jsonResponse(GENERIC_OK, {}, request);
    }

    const token = createPasswordResetToken();
    const origin = effectiveRequestOrigin(request);
    const resetUrl = `${origin}/reset-password?${new URLSearchParams({ token, email: normalized })}`;
    const username = user.username || maskEmailAddress(normalized);

    try {
      await sendPasswordResetEmail({ to: normalized, username, resetUrl });
    } catch (error) {
      console.error('password reset email failed:', error instanceof Error ? error.message : error);
      return jsonResponse(GENERIC_OK, {}, request);
    }

    await db.insert(passwordResetChallenges).values({
      userId: user.id,
      email: normalized,
      tokenHash: hashPasswordResetToken(token),
      sendCount: (latest?.sendCount ?? 0) + 1,
      lastSentAt: now,
      expiresAt: passwordResetExpiresAt(now.getTime()),
    });
    return jsonResponse(GENERIC_OK, {}, request);
  } catch (error) {
    console.error('password reset request failed:', error instanceof Error ? error.message : error);
    return jsonResponse(
      { ok: true, message: 'If that address has an account, a reset link is on its way.' },
      {},
      request,
    );
  }
}
