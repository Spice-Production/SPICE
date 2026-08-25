import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getInitialAccountRoleForEmail,
  hasActiveSubscription,
  isAdminAccount,
  normalizeAccountRole,
  serializeAccount,
  serializeSubscription,
} from '../lib/account.ts';

test('account roles normalize to user unless explicitly admin', () => {
  assert.equal(normalizeAccountRole('admin'), 'admin');
  assert.equal(normalizeAccountRole('user'), 'user');
  // The legacy 'banned' role value moved to the moderation columns.
  assert.equal(normalizeAccountRole('banned'), 'user');
  assert.equal(normalizeAccountRole('owner'), 'user');
  assert.equal(isAdminAccount({ accountRole: 'admin' }), true);
  assert.equal(isAdminAccount({ accountRole: 'user' }), false);
});

test('configured admin emails bootstrap new admin accounts', () => {
  assert.equal(getInitialAccountRoleForEmail('Owner@Example.com', 'owner@example.com, ops@example.com'), 'admin');
  assert.equal(getInitialAccountRoleForEmail('listener@example.com', 'owner@example.com, ops@example.com'), 'user');
  assert.equal(getInitialAccountRoleForEmail('owner@example.com', ''), 'user');
});

test('account serialization includes role, moderation, and default free subscription snapshot', () => {
  assert.deepEqual(
    serializeAccount({ id: 'user-1', email: 'listener@example.com', username: 'listener', accountRole: null }),
    {
      id: 'user-1',
      email: 'listener@example.com',
      username: 'listener',
      emailVerified: false,
      accountRole: 'user',
      isAdmin: false,
      moderation: {
        status: 'active',
        expiresAt: null,
        reason: null,
      },
      subscription: {
        tier: 'free',
        status: 'inactive',
        provider: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        isActive: false,
      },
    },
  );
  assert.equal(serializeAccount({
    id: 'user-2',
    email: 'verified@example.com',
    emailVerifiedAt: new Date('2026-07-13T00:00:00.000Z'),
  }).emailVerified, true);
});

test('account serialization surfaces timeout and banned moderation state', () => {
  const timedOut = serializeAccount({
    id: 'user-3',
    email: 'timed@example.com',
    moderationStatus: 'timeout',
    moderationExpiresAt: '2999-01-01T00:00:00.000Z',
    moderationReason: 'Too many reports',
  });
  assert.equal(timedOut.moderation.status, 'timeout');
  assert.equal(timedOut.moderation.expiresAt, '2999-01-01T00:00:00.000Z');
  assert.equal(timedOut.moderation.reason, 'Too many reports');

  const banned = serializeAccount({
    id: 'user-4',
    email: 'banned@example.com',
    moderationStatus: 'banned',
    moderationReason: 'Spam',
  });
  assert.equal(banned.moderation.status, 'banned');
  assert.equal(banned.moderation.expiresAt, null);
  assert.equal(banned.moderation.reason, 'Spam');
});

test('subscription serialization preserves future plan codes and active state', () => {
  const subscription = serializeSubscription({
    tier: 'family_plus',
    status: 'active',
    provider: 'stripe',
    currentPeriodEnd: '2999-01-01T00:00:00.000Z',
    cancelAtPeriodEnd: true,
  });

  assert.equal(subscription.tier, 'family_plus');
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.provider, 'stripe');
  assert.equal(subscription.cancelAtPeriodEnd, true);
  assert.equal(subscription.isActive, true);
});

test('expired or inactive subscriptions are not active entitlements', () => {
  assert.equal(hasActiveSubscription({ status: 'active', currentPeriodEnd: '2000-01-01T00:00:00.000Z' }), false);
  assert.equal(hasActiveSubscription({ status: 'inactive', currentPeriodEnd: null }), false);
});
