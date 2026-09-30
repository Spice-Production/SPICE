/**
 * localStorage can throw (private windows, blocked site data). The classic
 * handlers write it inline; these wrappers keep the state updates that follow
 * from being skipped when storage is unavailable.
 */
export function persistLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence only.
  }
}

export function clearLocalStorage() {
  try {
    localStorage.clear();
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
