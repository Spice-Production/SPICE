// Spice Connect rules shared with the Kotlin client and the desktop/web
// receivers: polling cadence, pairing codes, handoff phases, and redelivery.

// Realtime events wake the receiver instantly. These values are only fallbacks
// for a stream that is reconnecting or an older server deployment.
export const COMMAND_POLL_INTERVAL_MS = 5_000;
export const REALTIME_FALLBACK_POLL_INTERVAL_MS = 30_000;
export const REALTIME_RECONNECT_MIN_MS = 250;
export const REALTIME_RECONNECT_MAX_MS = 5_000;
export const COMMAND_STATE_SETTLE_MS = 500;
export const DEVICE_SYNC_INTERVAL_MS = 60_000;
export const CONTROLLER_REFRESH_INTERVAL_MS = 30_000;
export const OPTIMISTIC_STATE_WINDOW_MS = 6_000;
export const PROGRESS_REPORT_BUCKET_MS = 60_000;
export const HANDOFF_ACCEPT_TIMEOUT_MS = 8_000;
export const HANDOFF_COMPLETE_TIMEOUT_MS = 12_000;
export const MAX_APPLIED_COMMAND_IDS = 160;

const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function shouldSyncDevices(options: {
  nowMs: number;
  nextDeviceSyncAtMs: number;
  receivedCommands: boolean;
  receivedStateUpdate?: boolean;
  isControllingRemoteDevice: boolean;
}): boolean {
  return (
    options.receivedCommands ||
    options.receivedStateUpdate === true ||
    options.nowMs >= options.nextDeviceSyncAtMs ||
    (options.isControllingRemoteDevice && options.nowMs + CONTROLLER_REFRESH_INTERVAL_MS < options.nextDeviceSyncAtMs)
  );
}

export function nextDeviceSyncAt(nowMs: number, receivedCommands: boolean, isControllingRemoteDevice: boolean): number {
  if (receivedCommands) return nowMs + COMMAND_POLL_INTERVAL_MS;
  if (isControllingRemoteDevice) return nowMs + CONTROLLER_REFRESH_INTERVAL_MS;
  return nowMs + DEVICE_SYNC_INTERVAL_MS;
}

function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0));
}

export function normalizePairingCodeInput(value: string): string {
  let normalized = value;
  try {
    normalized = normalized.normalize('NFKC');
  } catch {
    // Engines without Unicode normalization still get the half-width mapping below.
  }
  let result = '';
  for (const character of toHalfWidth(normalized).toUpperCase()) {
    if (PAIRING_ALPHABET.includes(character)) result += character;
    if (result.length === 8) break;
  }
  return result;
}

export function formatPairingCodeInput(value: string): string {
  const padded = normalizePairingCodeInput(value).padEnd(8, '_');
  return `${padded.slice(0, 4)}-${padded.slice(4)}`;
}

export type PairingCodeEdit = { text: string; selectionStart: number; selectionEnd: number };

export function sanitizePairingCodeEdit(value: string, selectionStart: number, selectionEnd: number): PairingCodeEdit {
  const normalized = normalizePairingCodeInput(value);
  const normalizedOffset = (offset: number) =>
    Math.min(normalizePairingCodeInput(value.slice(0, Math.min(Math.max(offset, 0), value.length))).length, normalized.length);
  return { text: normalized, selectionStart: normalizedOffset(selectionStart), selectionEnd: normalizedOffset(selectionEnd) };
}

export function pairingCodeForSubmission(value: string): string | null {
  const normalized = normalizePairingCodeInput(value);
  return normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : null;
}

export function isCompletePairingCode(value: string): boolean {
  return normalizePairingCodeInput(value).length === 8;
}

export function hasConnectAccess(hasAccountSession: boolean, hasPairedCredential: boolean): boolean {
  return hasAccountSession || hasPairedCredential;
}

export function shouldStartConnect(enabled: boolean, hasAccountSession: boolean, hasPairedCredential: boolean): boolean {
  return enabled && hasConnectAccess(hasAccountSession, hasPairedCredential);
}

export function requiresDeviceRegistration(publishedAccessIdentity: string | null, activeAccessIdentity: string): boolean {
  return publishedAccessIdentity !== activeAccessIdentity;
}

export function shouldResetDeviceRegistration(commandPollStatusCode: number | null): boolean {
  return commandPollStatusCode === 404;
}

export function projectedProgressMs(
  progressMs: number,
  durationMs: number,
  isPlaying: boolean,
  observedAtMs: number,
  nowMs: number,
): number {
  const elapsed = isPlaying && observedAtMs > 0 ? Math.max(nowMs - observedAtMs, 0) : 0;
  const projected = Math.max(Math.max(progressMs, 0) + elapsed, 0);
  return durationMs > 0 ? Math.min(projected, durationMs) : projected;
}

export function deviceStatus(isOnline: boolean, isPlaying: boolean, lastSeenSeconds: number, trackTitle: string | null): string {
  const seconds = Math.max(lastSeenSeconds, 0);
  if (!isOnline) {
    if (seconds < 60) return 'Offline · last seen just now';
    if (seconds < 3_600) return `Offline · last seen ${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400) return `Offline · last seen ${Math.floor(seconds / 3_600)}h ago`;
    return `Offline · last seen ${Math.floor(seconds / 86_400)}d ago`;
  }
  if (trackTitle !== null) return `${isPlaying ? 'Playing' : 'Paused'} · ${trackTitle}`;
  return seconds <= 5 ? 'Online now' : `Online · last seen ${Math.max(1, Math.floor(seconds / 60))}m ago`;
}

/** Bounded, ordered set of applied command ids so redelivery never repeats an action. */
export class BoundedCommandIds {
  private readonly capacity: number;
  private readonly ids = new Set<string>();

  constructor(capacity: number, initialIds: Iterable<string> = []) {
    if (capacity <= 0) throw new Error('capacity must be positive');
    this.capacity = capacity;
    for (const id of initialIds) this.markIfNew(id);
  }

  markIfNew(commandId: string): boolean {
    const normalized = commandId.trim();
    if (!normalized || this.ids.has(normalized)) return false;
    this.ids.add(normalized);
    while (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value;
      if (oldest === undefined) break;
      this.ids.delete(oldest);
    }
    return true;
  }

  contains(commandId: string): boolean {
    return this.ids.has(commandId.trim());
  }

  snapshot(): string[] {
    return [...this.ids];
  }
}

export type HandoffPhase = 'WaitingForReady' | 'WaitingForComplete';

export type PendingHandoff = {
  transferId: string;
  targetDeviceId: string;
  targetName: string;
  sourceWasPlaying: boolean;
  phase: HandoffPhase;
};

export type PreparedHandoff = {
  transferId: string;
  sourceDeviceId: string;
  expiresAtMs: number;
};

export function beginHandoff(
  transferId: string,
  targetDeviceId: string,
  targetName: string,
  sourceWasPlaying: boolean,
): PendingHandoff {
  return { transferId, targetDeviceId, targetName, sourceWasPlaying, phase: 'WaitingForReady' };
}

export function acceptHandoffReady(
  pending: PendingHandoff | null,
  transferId: string,
  sourceDeviceId: string,
  sourceWasPlaying: boolean,
): PendingHandoff | null {
  if (
    !pending ||
    pending.phase !== 'WaitingForReady' ||
    pending.transferId !== transferId ||
    pending.targetDeviceId !== sourceDeviceId
  ) {
    return null;
  }
  return { ...pending, sourceWasPlaying, phase: 'WaitingForComplete' };
}

export function completesHandoff(pending: PendingHandoff | null, transferId: string, sourceDeviceId: string): boolean {
  return (
    !!pending &&
    pending.phase === 'WaitingForComplete' &&
    pending.transferId === transferId &&
    pending.targetDeviceId === sourceDeviceId
  );
}

export function shouldResumeSource(pending: PendingHandoff | null, destinationConfirmedNoPlayback: boolean): boolean {
  return !!pending && pending.sourceWasPlaying && (pending.phase === 'WaitingForReady' || destinationConfirmedNoPlayback);
}

export function acceptsPreparedCommit(
  prepared: PreparedHandoff | null | undefined,
  transferId: string,
  sourceDeviceId: string,
  nowMs: number,
): boolean {
  return !!prepared && prepared.transferId === transferId && prepared.sourceDeviceId === sourceDeviceId && prepared.expiresAtMs > nowMs;
}

export function normalizeTransferId(value: string): string {
  let result = '';
  for (const character of value.trim()) {
    if (/[A-Za-z0-9:_-]/.test(character)) result += character;
  }
  return result.slice(0, 160);
}

export type RealtimeEvent = 'Ready' | 'Command' | 'State';

/** Minimal SSE record parser: an event fires only after its blank terminator line. */
export class RealtimeEventParser {
  private eventName = '';

  consumeLine(line: string): RealtimeEvent | null {
    if (line === '') {
      const event: RealtimeEvent | null =
        this.eventName === 'ready' ? 'Ready' : this.eventName === 'command' ? 'Command' : this.eventName === 'state' ? 'State' : null;
      this.eventName = '';
      return event;
    }
    if (line.startsWith('event:')) this.eventName = line.slice('event:'.length).trim();
    return null;
  }
}

/** Live data-channel timestamps use receipt time; see the LAN protocol notes. */
export function connectTimestamp(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString();
}
