'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
  readSpiceUiV2CookieValue,
  resolveSpiceUiV2Preference,
  serializeSpiceUiV2Cookie,
  serializeSpiceUiV2Preference,
  SPICE_UI_V2_DOCUMENT_ATTRIBUTE,
  SPICE_UI_V2_QUERY_PARAM,
  SPICE_UI_V2_STORAGE_KEY,
} from './preference';

const CHANGE_EVENT = 'spice-ui-v2-change';

function syncDocumentFlag(enabled: boolean) {
  if (enabled) document.documentElement.setAttribute(SPICE_UI_V2_DOCUMENT_ATTRIBUTE, 'v2');
  else document.documentElement.removeAttribute(SPICE_UI_V2_DOCUMENT_ATTRIBUTE);
}

/** Saves the choice to localStorage and the domain-wide cookie, and updates <html>. */
export function persistSpiceUiV2Preference(enabled: boolean) {
  try {
    localStorage.setItem(SPICE_UI_V2_STORAGE_KEY, serializeSpiceUiV2Preference(enabled));
  } catch {
    // Storage can be unavailable (private mode); the cookie still carries it.
  }
  try {
    document.cookie = serializeSpiceUiV2Cookie(enabled, window.location.hostname, window.location.protocol === 'https:');
  } catch {
    // Cookies disabled: the choice lasts for this origin only.
  }
  syncDocumentFlag(enabled);
}

/**
 * Resolves the preference (query > cookie > localStorage), persists it when
 * a link or the cookie changed it, strips `?ui=` from the address bar, and
 * returns the result. Safe to call from several components; it is idempotent.
 */
export function resolveClientSpiceUiV2Preference(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SPICE_UI_V2_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const url = new URL(window.location.href);
  const queryValue = url.searchParams.get(SPICE_UI_V2_QUERY_PARAM);
  const resolution = resolveSpiceUiV2Preference(stored, queryValue, readSpiceUiV2CookieValue(document.cookie));
  if (resolution.persist) persistSpiceUiV2Preference(resolution.enabled);
  else syncDocumentFlag(resolution.enabled);
  if (queryValue !== null) {
    url.searchParams.delete(SPICE_UI_V2_QUERY_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return resolution.enabled;
}

/** Tell other mounted readers (and server-rendered routes) that the choice changed. */
export function announceSpiceUiV2Change(enabled: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: enabled }));
}

/** Current choice without side effects (query > cookie > localStorage). */
function readSpiceUiV2Snapshot(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SPICE_UI_V2_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const queryValue = new URLSearchParams(window.location.search).get(SPICE_UI_V2_QUERY_PARAM);
  return resolveSpiceUiV2Preference(stored, queryValue, readSpiceUiV2CookieValue(document.cookie)).enabled;
}

function subscribeSpiceUiV2(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * Preview toggle for pages outside SpiceApp (Spice Movies). Renders classic
 * during hydration to match the server, then the stored choice; the boot
 * script hides classic shells for v2 testers so nothing flashes.
 */
export function useSpiceUiV2() {
  const router = useRouter();
  const enabled = useSyncExternalStore(subscribeSpiceUiV2, readSpiceUiV2Snapshot, () => false);

  useEffect(() => {
    resolveClientSpiceUiV2Preference();
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      persistSpiceUiV2Preference(next);
      announceSpiceUiV2Change(next);
      // Server-rendered routes (watch pages) pick the interface from the cookie.
      router.refresh();
    },
    [router],
  );

  return { enabled, setEnabled };
}

/** Mounted once in the root layout: persists `?ui=` links on every route. */
export function SpiceUiV2PreferenceSync() {
  useEffect(() => {
    resolveClientSpiceUiV2Preference();
  }, []);
  return null;
}
