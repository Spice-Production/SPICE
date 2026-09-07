import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isAcceptablePassword,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_MAX_PER_HOUR,
  PASSWORD_RESET_MAX_SENDS,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_TTL_MS,
  passwordResetChallengeExpired,
  passwordResetExpiresAt,
  verifyPasswordResetToken,
} from '../lib/password-reset.ts';

test('reset tokens are 256-bit hex and hash to sha256 digests', () => {
  const token = createPasswordResetToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.match(hashPasswordResetToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(createPasswordResetToken(), token);
});

test('token verification is exact and rejects garbage', () => {
  const token = createPasswordResetToken();
  const digest = hashPasswordResetToken(token);
  assert.equal(verifyPasswordResetToken(token, digest), true);
  assert.equal(verifyPasswordResetToken(`${token.slice(0, -1)}0`, digest), false);
  assert.equal(verifyPasswordResetToken('', digest), false);
  assert.equal(verifyPasswordResetToken(token, '0'.repeat(64)), false);
});

test('challenges live 30 minutes', () => {
  assert.equal(PASSWORD_RESET_TTL_MS, 30 * 60 * 1000);
  assert.equal(passwordResetExpiresAt(1_000).getTime(), 1_000 + PASSWORD_RESET_TTL_MS);
  assert.equal(passwordResetChallengeExpired(new Date(2_000), 2_000), true);
  assert.equal(passwordResetChallengeExpired(new Date(2_001), 2_000), false);
});

test('abuse caps stay tight', () => {
  assert.equal(PASSWORD_RESET_RESEND_COOLDOWN_MS, 60 * 1000);
  assert.equal(PASSWORD_RESET_MAX_SENDS, 5);
  assert.equal(PASSWORD_RESET_MAX_PER_HOUR, 5);
  assert.equal(PASSWORD_RESET_MAX_ATTEMPTS, 10);
});

test('new passwords follow the signup rule', () => {
  assert.equal(isAcceptablePassword('Str0ng!Pass'), true);
  assert.equal(isAcceptablePassword('sh0rt!A'), false);
  assert.equal(isAcceptablePassword('nouppercase1!'), false);
  assert.equal(isAcceptablePassword('NOLOWERCASE1!'), false);
  assert.equal(isAcceptablePassword('NoDigitsHere!'), false);
  assert.equal(isAcceptablePassword('NoSpecial123'), false);
  assert.equal(isAcceptablePassword(''), false);
  assert.equal(isAcceptablePassword(null), false);
});
