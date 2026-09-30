import * as SecureStore from 'expo-secure-store';

import { asObject, bool, int, obj, str } from '../core/json';
import type { AccountSession, PairedDeviceCredential } from '../core/models';
import { parseAccount } from '../core/parsers';

// The account session and the scoped Spice Connect pairing credential live in
// separate Keystore-backed entries, matching the Kotlin client's separation.
const SESSION_KEY = 'spice_account_session_v1';
const PAIRING_KEY = 'spice_paired_credential_v1';

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = SecureStore.getItem(key);
    return raw ? asObject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    SecureStore.setItem(key, JSON.stringify(value));
  } catch {
    // Secure storage can be unavailable on first boot; the in-memory session still works.
  }
}

function remove(key: string): void {
  SecureStore.deleteItemAsync(key).catch(() => undefined);
}

export const sessionStore = {
  load(): AccountSession | null {
    const payload = read(SESSION_KEY);
    const token = str(payload, 'token').trim();
    const account = parseAccount(obj(payload, 'account') ?? {});
    return token && account.id ? { token, account } : null;
  },
  save(session: AccountSession): void {
    write(SESSION_KEY, {
      token: session.token,
      account: { ...session.account, moderation: { status: session.account.moderationStatus } },
    });
  },
  clear(): void {
    remove(SESSION_KEY);
  },
};

export const pairedCredentialStore = {
  load(): PairedDeviceCredential | null {
    const payload = read(PAIRING_KEY);
    if (!payload) return null;
    const credential: PairedDeviceCredential = {
      accessToken: str(payload, 'accessToken'),
      authorizationId: str(payload, 'authorizationId'),
      ownerUserId: str(payload, 'ownerUserId'),
      expiresAt: str(payload, 'expiresAt'),
      expiresAtEpochMs: int(payload, 'expiresAtEpochMs', 0),
      deviceId: str(payload, 'deviceId'),
      displayName: str(payload, 'displayName') || 'Spice Android',
    };
    const valid =
      credential.accessToken.startsWith('spice_pair_') &&
      credential.authorizationId !== '' &&
      credential.ownerUserId !== '' &&
      credential.deviceId !== '' &&
      credential.expiresAtEpochMs > 0 &&
      !bool(payload, 'revoked', false);
    return valid ? credential : null;
  },
  save(credential: PairedDeviceCredential): void {
    write(PAIRING_KEY, credential);
  },
  clear(): void {
    remove(PAIRING_KEY);
  },
};
