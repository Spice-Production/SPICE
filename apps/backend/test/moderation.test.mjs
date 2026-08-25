import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AccountModerationError,
  accountModerationErrorPayload,
  accountModerationMessage,
  assertAccountModerationAllowed,
  isAccountModerationBlocked,
  resolveAccountModeration,
  resolveAccountModerationUpdate,
} from '../lib/moderation.ts';
test('resolveAccountModeration treats missing state as active', () => {
  assert.deepEqual(resolveAccountModeration(null), { status: 'active', expiresAt: null, reason: null });
  assert.deepEqual(resolveAccountModeration({}), { status: 'active', expiresAt: null, reason: null });
  assert.deepEqual(resolveAccountModeration({ moderationStatus: 'unknown' }), { status: 'active', expiresAt: null, reason: null });
});

test('resolveAccountModeration keeps active timeouts and clears expired ones', () => {
  const now = Date.parse('2026-08-15T12:00:00.000Z');
  const active = resolveAccountModeration(
    {
      moderationStatus: 'timeout',
      moderationExpiresAt: '2026-08-16T12:00:00.000Z',
      moderationReason: '  chill out  ',
    },
    now,
  );
  assert.equal(active.status, 'timeout');
  assert.equal(active.expiresAt, '2026-08-16T12:00:00.000Z');
  assert.equal(active.reason, 'chill out');

  const expired = resolveAccountModeration(
    {
      moderationStatus: 'timeout',
      moderationExpiresAt: '2026-08-14T12:00:00.000Z',
      moderationReason: 'chill out',
    },
    now,
  );
  assert.deepEqual(expired, { status: 'active', expiresAt: null, reason: null });
});

test('resolveAccountModeration surfaces permanent bans', () => {
  const banned = resolveAccountModeration({
    moderationStatus: 'banned',
    moderationReason: 'Spam',
  });
  assert.equal(banned.status, 'banned');
  assert.equal(banned.expiresAt, null);
  assert.equal(banned.reason, 'Spam');
});

test('isAccountModerationBlocked only flags timeout and banned', () => {
  assert.equal(isAccountModerationBlocked({ status: 'active', expiresAt: null, reason: null }), false);
  assert.equal(isAccountModerationBlocked({ status: 'timeout', expiresAt: '2999-01-01T00:00:00.000Z', reason: null }), true);
  assert.equal(isAccountModerationBlocked({ status: 'banned', expiresAt: null, reason: null }), true);
});

test('assertAccountModerationAllowed throws structured errors with payloads', () => {
  const timedOut = resolveAccountModeration({
    moderationStatus: 'timeout',
    moderationExpiresAt: '2999-01-01T00:00:00.000Z',
    moderationReason: 'Reason text',
  });
  assert.throws(
    () => assertAccountModerationAllowed(timedOut),
    (error) => {
      assert.ok(error instanceof AccountModerationError);
      assert.equal(error.code, 'account_timed_out');
      assert.match(error.message, /temporarily timed out until/);
      assert.match(error.message, /Reason: Reason text/);
      const payload = accountModerationErrorPayload(error);
      assert.equal(payload?.error, 'account_timed_out');
      assert.equal(payload?.status, 'timeout');
      assert.equal(payload?.reason, 'Reason text');
      assert.equal(payload?.expiresAt, '2999-01-01T00:00:00.000Z');
      return true;
    },
  );

  const banned = resolveAccountModeration({ moderationStatus: 'banned' });
  assert.throws(
    () => assertAccountModerationAllowed(banned),
    (error) => {
      assert.ok(error instanceof AccountModerationError);
      assert.equal(error.code, 'account_banned');
      return true;
    },
  );

  assert.equal(accountModerationErrorPayload(new Error('other')), null);
  assert.equal(assertAccountModerationAllowed(resolveAccountModeration(null)).status, 'active');
});

test('accountModerationMessage renders human-readable copies', () => {
  assert.match(
    accountModerationMessage('banned', { expiresAt: null, reason: 'Spam' }),
    /has been banned/,
  );
  assert.match(
    accountModerationMessage('timeout', { expiresAt: '2999-01-01T00:00:00.000Z', reason: 'Abuse' }),
    /temporarily timed out until/,
  );
  assert.match(
    accountModerationMessage('timeout', { expiresAt: null, reason: null }),
    /temporarily timed out/,
  );
});

test('resolveAccountModerationUpdate validates timeout and ban changes', () => {
  assert.deepEqual(
    resolveAccountModerationUpdate({ moderationStatus: 'active' }),
    { status: 'active', expiresAt: null, reason: null },
  );
  assert.deepEqual(
    resolveAccountModerationUpdate({ moderationStatus: 'banned', moderationReason: '  Spam  ' }),
    { status: 'banned', expiresAt: null, reason: 'Spam' },
  );
  assert.deepEqual(
    resolveAccountModerationUpdate({ moderationStatus: 'banned', moderationReason: '   ' }),
    { status: 'banned', expiresAt: null, reason: null },
  );

  const timeout = resolveAccountModerationUpdate({
    moderationStatus: 'timeout',
    moderationDurationHours: 24,
    moderationReason: 'Chill',
  }, new Date('2026-08-15T12:00:00.000Z'));
  assert.deepEqual(timeout, {
    status: 'timeout',
    expiresAt: new Date('2026-08-16T12:00:00.000Z'),
    reason: 'Chill',
  });

  const explicitExpiry = resolveAccountModerationUpdate({
    moderationStatus: 'timeout',
    moderationExpiresAt: '2026-08-20T12:00:00.000Z',
  });
  assert.deepEqual(explicitExpiry, {
    status: 'timeout',
    expiresAt: new Date('2026-08-20T12:00:00.000Z'),
    reason: null,
  });
});

test('resolveAccountModerationUpdate rejects invalid inputs', () => {
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout' }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout', moderationDurationHours: 0 }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout', moderationDurationHours: 9000 }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout', moderationDurationHours: 'soon' }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout', moderationExpiresAt: 'not-a-date' }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'banned', moderationReason: 'x'.repeat(501) }));
  assert.ok('error' in resolveAccountModerationUpdate({ moderationStatus: 'timeout', moderationDurationHours: 24, moderationReason: 42 }));
  assert.ok('error' in resolveAccountModerationUpdate({}));
});
