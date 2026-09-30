'use client';

import { useEffect, useState } from 'react';

import { fetchWatchState, readAccountToken, type WatchState } from '../../watch-client';

/** Signs in with the SPICE account and stores the session the music player uses. */
export async function signInToSpice(email: string, password: string): Promise<string> {
  const res = await fetch('/api/cloud/auth/spice/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = (await res.json().catch(() => null)) as { token?: string; user?: unknown; error?: string } | null;
  if (!res.ok || !data?.token) throw new Error(data?.error ?? 'Sign-in failed.');
  try {
    window.localStorage.setItem('spice_cloud_token', data.token);
    if (data.user) window.localStorage.setItem('spice_cloud_user', JSON.stringify(data.user));
  } catch {
    /* private mode: state still works for this visit */
  }
  return data.token;
}

/** Same keys the classic profile menu clears on sign-out. */
export function clearSpiceSession() {
  try {
    window.localStorage.removeItem('spice_cloud_token');
    window.localStorage.removeItem('spice_cloud_user');
    window.localStorage.removeItem('spice_cloud_profile_id');
  } catch {
    /* storage unavailable: state still clears */
  }
}

export function readAccountEmail(): string | null {
  try {
    const raw = window.localStorage.getItem('spice_cloud_user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { email?: unknown };
    return typeof user.email === 'string' ? user.email : null;
  } catch {
    return null;
  }
}

/**
 * Account session for watch pages that don't own one (the browse pages pass
 * their own token/watch state down instead).
 */
export function useWatchSession() {
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [watchState, setWatchState] = useState<WatchState | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchWatchState(token)
      .then((next) => {
        if (!cancelled) setWatchState(next);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return {
    token,
    watchState,
    onSignedIn: (next: string) => setToken(next),
    onSignOut: () => {
      setToken(null);
      setWatchState(null);
    },
  };
}
