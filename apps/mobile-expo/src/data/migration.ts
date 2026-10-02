import * as SecureStore from 'expo-secure-store';

import { engine } from '../engine/engine';
import { prefs } from './prefs';

const DONE_KEY = 'legacy_migration_done';
// Same entries src/data/secure.ts reads.
const SESSION_KEY = 'spice_account_session_v1';
const PAIRING_KEY = 'spice_paired_credential_v1';
const TRACK_PRIORITIES_KEY = 'track_priorities_v1';

/**
 * One-time import of the Kotlin app's data when this app installs over it.
 * Must run before the library database and stores are first read. The native
 * side has already copied the library database; this carries the rest over.
 */
export function runLegacyMigration(): void {
  if (prefs.getBoolean(DONE_KEY, false)) return;
  try {
    const legacy = engine.legacyData();
    if (legacy) {
      for (const [key, value] of Object.entries({ ...legacy.connectPreferences, ...legacy.preferences })) {
        if (key === TRACK_PRIORITIES_KEY) engine.replaceTrackPriorities(value);
        else if (!prefs.has(key)) prefs.set(key, value);
      }
      if (legacy.session && !SecureStore.getItem(SESSION_KEY)) SecureStore.setItem(SESSION_KEY, legacy.session);
      if (legacy.pairedCredential && !SecureStore.getItem(PAIRING_KEY)) {
        SecureStore.setItem(PAIRING_KEY, legacy.pairedCredential);
      }
    }
  } catch {
    // A failed import leaves a fresh install; cloud sync restores the library after sign-in.
  }
  prefs.set(DONE_KEY, true);
}
