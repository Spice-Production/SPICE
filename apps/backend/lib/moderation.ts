export const MODERATION_STATUS_ACTIVE = 'active';
export const MODERATION_STATUS_TIMEOUT = 'timeout';
export const MODERATION_STATUS_BANNED = 'banned';
export const MODERATION_STATUSES = [
  MODERATION_STATUS_ACTIVE,
  MODERATION_STATUS_TIMEOUT,
  MODERATION_STATUS_BANNED,
] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_ERROR_TIMED_OUT = 'account_timed_out';
export const MODERATION_ERROR_BANNED = 'account_banned';
export type AccountModerationErrorCode = typeof MODERATION_ERROR_TIMED_OUT | typeof MODERATION_ERROR_BANNED;

export interface AccountModerationRecord {
  moderationStatus?: string | null;
  moderationExpiresAt?: Date | string | null;
  moderationReason?: string | null;
}

export interface AccountModerationSnapshot {
  status: ModerationStatus;
  expiresAt: string | null;
  reason: string | null;
}

const MODERATION_STATUS_SET = new Set<string>(MODERATION_STATUSES);

export function normalizeModerationStatus(value: unknown): ModerationStatus {
  return typeof value === 'string' && MODERATION_STATUS_SET.has(value)
    ? (value as ModerationStatus)
    : MODERATION_STATUS_ACTIVE;
}

function validTime(value: Date | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

export function resolveAccountModeration(
  record: AccountModerationRecord | null | undefined,
  now: number = Date.now(),
): AccountModerationSnapshot {
  const status = normalizeModerationStatus(record?.moderationStatus);
  const expiresAtTime = validTime(record?.moderationExpiresAt);
  const reason = typeof record?.moderationReason === 'string' && record.moderationReason.trim()
    ? record.moderationReason.trim()
    : null;

  if (status === MODERATION_STATUS_TIMEOUT && (!Number.isFinite(expiresAtTime) || expiresAtTime <= now)) {
    return { status: MODERATION_STATUS_ACTIVE, expiresAt: null, reason: null };
  }

  return {
    status,
    expiresAt: status === MODERATION_STATUS_TIMEOUT && Number.isFinite(expiresAtTime)
      ? new Date(expiresAtTime).toISOString()
      : null,
    reason: status === MODERATION_STATUS_ACTIVE ? null : reason,
  };
}

export function isAccountModerationBlocked(moderation: AccountModerationSnapshot): boolean {
  return moderation.status === MODERATION_STATUS_TIMEOUT || moderation.status === MODERATION_STATUS_BANNED;
}

export function accountModerationErrorCode(status: ModerationStatus): AccountModerationErrorCode | null {
  if (status === MODERATION_STATUS_TIMEOUT) return MODERATION_ERROR_TIMED_OUT;
  if (status === MODERATION_STATUS_BANNED) return MODERATION_ERROR_BANNED;
  return null;
}

export function accountModerationMessage(
  status: ModerationStatus,
  moderation: Pick<AccountModerationSnapshot, 'expiresAt' | 'reason'>,
): string {
  if (status === MODERATION_STATUS_TIMEOUT) {
    const reason = moderation.reason ? ` Reason: ${moderation.reason}` : '';
    if (moderation.expiresAt) {
      const date = new Date(moderation.expiresAt);
      if (!Number.isNaN(date.getTime())) {
        return `This account is temporarily timed out until ${date.toUTCString()}.${reason}`;
      }
    }
    return `This account is temporarily timed out.${reason}`;
  }
  if (status === MODERATION_STATUS_BANNED) {
    const reason = moderation.reason ? ` Reason: ${moderation.reason}` : '';
    return `This account has been banned.${reason}`;
  }
  return 'This account is allowed to use SPICE.';
}

export class AccountModerationError extends Error {
  public readonly code: AccountModerationErrorCode;
  public readonly moderation: AccountModerationSnapshot;

  constructor(code: AccountModerationErrorCode, message: string, moderation: AccountModerationSnapshot) {
    super(message);
    this.name = 'AccountModerationError';
    this.code = code;
    this.moderation = moderation;
  }
}

export function accountModerationErrorPayload(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof AccountModerationError)) return null;
  return {
    error: error.code,
    message: error.message,
    status: error.moderation.status,
    reason: error.moderation.reason,
    expiresAt: error.moderation.expiresAt,
  };
}

export function assertAccountModerationAllowed(
  moderation: AccountModerationSnapshot,
): AccountModerationSnapshot {
  if (!isAccountModerationBlocked(moderation)) return moderation;
  const code = accountModerationErrorCode(moderation.status) as AccountModerationErrorCode;
  throw new AccountModerationError(code, accountModerationMessage(moderation.status, moderation), moderation);
}

export const MODERATION_REASON_MAX_LENGTH = 500;
export const MODERATION_MIN_TIMEOUT_HOURS = 1;
export const MODERATION_MAX_TIMEOUT_HOURS = 24 * 365;

export interface AccountModerationUpdate {
  status: ModerationStatus;
  expiresAt: Date | null;
  reason: string | null;
}

export function resolveAccountModerationUpdate(
  input: Record<string, unknown>,
  now: Date = new Date(),
): AccountModerationUpdate | { error: string } {
  const hasModerationField = [
    'moderationStatus',
    'moderationDurationHours',
    'moderationExpiresAt',
    'moderationReason',
  ].some((field) => field in input);

  if (!hasModerationField) {
    return { error: 'No moderation fields were provided.' };
  }

  const status = normalizeModerationStatus(input.moderationStatus);

  let reason: string | null = null;
  if (input.moderationReason !== undefined && input.moderationReason !== null) {
    if (typeof input.moderationReason !== 'string') {
      return { error: 'Invalid moderation reason.' };
    }
    reason = input.moderationReason.trim();
    if (reason.length > MODERATION_REASON_MAX_LENGTH) {
      return { error: `Moderation reason must be ${MODERATION_REASON_MAX_LENGTH} characters or fewer.` };
    }
    if (reason.length === 0) reason = null;
  }

  if (status === MODERATION_STATUS_ACTIVE) {
    return { status, expiresAt: null, reason: null };
  }

  if (status === MODERATION_STATUS_BANNED) {
    return { status, expiresAt: null, reason };
  }

  // Timeout requires an explicit expiry, either as a duration or an ISO date.
  let expiresAt: Date | null = null;
  if (input.moderationExpiresAt !== undefined && input.moderationExpiresAt !== null) {
    if (typeof input.moderationExpiresAt !== 'string') {
      return { error: 'Invalid timeout expiry.' };
    }
    const parsed = new Date(input.moderationExpiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Invalid timeout expiry.' };
    }
    expiresAt = parsed;
  } else if (input.moderationDurationHours !== undefined && input.moderationDurationHours !== null) {
    const hours = Number(input.moderationDurationHours);
    if (!Number.isFinite(hours) || hours < MODERATION_MIN_TIMEOUT_HOURS || hours > MODERATION_MAX_TIMEOUT_HOURS) {
      return {
        error: `Timeout duration must be between ${MODERATION_MIN_TIMEOUT_HOURS} and ${MODERATION_MAX_TIMEOUT_HOURS} hours.`,
      };
    }
    expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  if (!expiresAt) {
    return { error: 'A timeout duration or expiry is required for a temporary timeout.' };
  }

  return { status, expiresAt, reason };
}
