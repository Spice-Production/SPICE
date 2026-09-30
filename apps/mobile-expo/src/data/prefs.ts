import Storage from 'expo-sqlite/kv-store';

/** Synchronous preference access backed by expo-sqlite's key-value store. */
export const prefs = {
  getString(key: string, fallback = ''): string {
    try {
      return Storage.getItemSync(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  getNumber(key: string, fallback: number): number {
    const raw = prefs.getString(key, '');
    if (raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  getBoolean(key: string, fallback: boolean): boolean {
    const raw = prefs.getString(key, '');
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  },
  getStringList(key: string): string[] {
    try {
      const parsed: unknown = JSON.parse(prefs.getString(key, '[]'));
      return Array.isArray(parsed)
        ? parsed.flatMap((value) => (typeof value === 'string' && value.trim() ? [value.trim()] : []))
        : [];
    } catch {
      return [];
    }
  },
  has(key: string): boolean {
    try {
      return Storage.getItemSync(key) !== null;
    } catch {
      return false;
    }
  },
  set(key: string, value: string | number | boolean): void {
    try {
      Storage.setItemSync(key, String(value));
    } catch {
      // Preferences are best effort; the in-memory state still applies.
    }
  },
  setStringList(key: string, values: Iterable<string>): void {
    prefs.set(key, JSON.stringify([...values]));
  },
  remove(key: string): void {
    try {
      Storage.removeItemSync(key);
    } catch {
      // Ignore missing keys.
    }
  },
};

export const PREF = {
  accentTheme: 'accent_theme',
  surfaceTheme: 'surface_theme',
  quality: 'quality',
  searchProvider: 'search_provider',
  crossfadeDurationMs: 'crossfade_duration_ms',
  smartQueueEnabled: 'smart_queue_enabled',
  tasteAdaptiveSyncedAt: 'taste_adaptive_synced_at',
  pendingLikedIds: 'pending_liked_ids',
  likesSyncInitialized: 'likes_sync_initialized',
  likesSyncRevision: 'likes_sync_revision',
  pendingHistoryIds: 'pending_history_ids',
  historySyncInitialized: 'history_sync_initialized',
  historySyncRevision: 'history_sync_revision',
  remoteDeviceId: 'remote_device_id',
  spiceConnectEnabled: 'spice_connect_enabled',
  selectedPlaybackDeviceId: 'selected_playback_device_id',
  appliedRemoteCommandIds: 'applied_remote_command_ids',
} as const;
