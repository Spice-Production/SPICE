export const ACCOUNT_ROLE_USER = 'user';
export const ACCOUNT_ROLE_ADMIN = 'admin';
// Legacy role value from before account moderation existed. The moderation
// columns in the users table now own permanent bans; keep the constant only
// so older stored values and payloads can be recognized and normalized.
export const ACCOUNT_ROLE_BANNED = 'banned';
export const ACCOUNT_ROLES = [ACCOUNT_ROLE_USER, ACCOUNT_ROLE_ADMIN] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const SUBSCRIPTION_TIER_FREE = 'free';
export const SUBSCRIPTION_STATUS_INACTIVE = 'inactive';
export const SUBSCRIPTION_STATUS_TRIALING = 'trialing';
export const SUBSCRIPTION_STATUS_ACTIVE = 'active';
export const SUBSCRIPTION_STATUS_PAST_DUE = 'past_due';
export const SUBSCRIPTION_STATUS_CANCELED = 'canceled';

export const SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUS_INACTIVE,
  SUBSCRIPTION_STATUS_TRIALING,
  SUBSCRIPTION_STATUS_ACTIVE,
  SUBSCRIPTION_STATUS_PAST_DUE,
  SUBSCRIPTION_STATUS_CANCELED,
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface AccountSubscriptionSnapshot {
  tier: string;
  status: SubscriptionStatus;
  provider: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
}

import {
  resolveAccountModeration,
  type AccountModerationRecord,
  type AccountModerationSnapshot,
} from './moderation.ts';

export interface AccountSnapshot {
  id: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  accountRole: AccountRole;
  isAdmin: boolean;
  moderation: AccountModerationSnapshot;
  subscription: AccountSubscriptionSnapshot;
}

interface AccountRecord extends AccountModerationRecord {
  id: string;
  email: string;
  username?: string | null;
  emailVerifiedAt?: Date | string | null;
  accountRole?: string | null;
}

interface SubscriptionRecord {
  tier?: string | null;
  status?: string | null;
  provider?: string | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean | null;
}

const ACCOUNT_ROLE_SET = new Set<string>(ACCOUNT_ROLES);
const SUBSCRIPTION_STATUS_SET = new Set<string>(SUBSCRIPTION_STATUSES);

export function normalizeAccountRole(value: unknown): AccountRole {
  return typeof value === 'string' && ACCOUNT_ROLE_SET.has(value) ? (value as AccountRole) : ACCOUNT_ROLE_USER;
}

export function isAdminRole(value: unknown): boolean {
  return normalizeAccountRole(value) === ACCOUNT_ROLE_ADMIN;
}

export function isAdminAccount(account: Pick<AccountSnapshot, 'accountRole'> | null | undefined): boolean {
  return isAdminRole(account?.accountRole);
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  return typeof value === 'string' && SUBSCRIPTION_STATUS_SET.has(value)
    ? (value as SubscriptionStatus)
    : SUBSCRIPTION_STATUS_INACTIVE;
}

export function normalizeSubscriptionTier(value: unknown): string {
  if (typeof value !== 'string') {
    return SUBSCRIPTION_TIER_FREE;
  }

  const tier = value.trim().toLowerCase();
  return tier.length > 0 ? tier : SUBSCRIPTION_TIER_FREE;
}

export function getInitialAccountRoleForEmail(email: string, configuredAdminEmails = process.env.SPICE_ADMIN_EMAILS): AccountRole {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !configuredAdminEmails) {
    return ACCOUNT_ROLE_USER;
  }

  const configuredAdmins = configuredAdminEmails
    .split(',')
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean);

  return configuredAdmins.includes(normalizedEmail) ? ACCOUNT_ROLE_ADMIN : ACCOUNT_ROLE_USER;
}

export function serializeSubscription(subscription?: SubscriptionRecord | null): AccountSubscriptionSnapshot {
  const tier = normalizeSubscriptionTier(subscription?.tier);
  const status = normalizeSubscriptionStatus(subscription?.status);
  const currentPeriodEnd = serializeDate(subscription?.currentPeriodEnd);

  return {
    tier,
    status,
    provider: subscription?.provider ?? null,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    isActive: hasActiveSubscription({ status, currentPeriodEnd }),
  };
}

export function serializeAccount(account: AccountRecord, subscription?: SubscriptionRecord | null): AccountSnapshot {
  const accountRole = normalizeAccountRole(account.accountRole);
  const username = typeof account.username === 'string' ? account.username.trim() : '';

  return {
    id: account.id,
    email: account.email,
    username: username || null,
    emailVerified: Boolean(account.emailVerifiedAt),
    accountRole,
    isAdmin: isAdminRole(accountRole),
    moderation: resolveAccountModeration(account),
    subscription: serializeSubscription(subscription),
  };
}

export function hasActiveSubscription(subscription: Pick<AccountSubscriptionSnapshot, 'status' | 'currentPeriodEnd'>): boolean {
  if (subscription.status !== SUBSCRIPTION_STATUS_ACTIVE && subscription.status !== SUBSCRIPTION_STATUS_TRIALING) {
    return false;
  }

  if (!subscription.currentPeriodEnd) {
    return true;
  }

  const periodEnd = new Date(subscription.currentPeriodEnd);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now();
}

function serializeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
