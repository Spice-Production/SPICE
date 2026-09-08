'use client';

/**
 * Shared client for the account-synced watch state (watchlist +
 * continue-watching). One token source — the same `spice_cloud_token` the
 * music player stores — so signing in anywhere on this origin lights up
 * movies, shows, and later anime without a second login.
 */

export type WatchKind = 'movie' | 'show' | 'anime';

export interface WatchEntry {
  kind: string;
  tmdbId: string;
  title: string;
  posterUrl: string | null;
  year?: string | null;
  addedAt?: string;
}

export interface ContinueEntry {
  kind: string;
  tmdbId: string;
  season: number;
  episode: number;
  title: string;
  posterUrl: string | null;
  updatedAt: string;
}

export interface WatchState {
  watchlist: WatchEntry[];
  continueWatching: ContinueEntry[];
  completed: { kind: string; tmdbId: string; season: number; episode: number }[];
}

export function readAccountToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('spice_cloud_token');
  } catch {
    return null;
  }
}

export interface AccountProfile {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
}

/**
 * The music player's profile (avatar included), resolved the same way
 * everywhere: the stored active profile first, otherwise the first synced
 * profile. Server-sourced, so a PFP change follows the account.
 */
export async function fetchAccountProfile(token: string): Promise<AccountProfile | null> {
  let storedId: string | null = null;
  try {
    storedId = window.localStorage.getItem('spice_cloud_profile_id');
  } catch {
    storedId = null;
  }
  const res = await fetch('/api/sync/profiles', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('signed-out');
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  const data = (await res.json().catch(() => null)) as {
    profiles?: { id?: unknown; avatarUrl?: unknown; displayName?: unknown; username?: unknown }[];
  } | null;
  const list = Array.isArray(data?.profiles) ? data.profiles : [];
  const match =
    (storedId && list.find((p) => p.id === storedId)) ?? list[0] ?? null;
  if (!match) return null;
  return {
    avatarUrl: typeof match.avatarUrl === 'string' && match.avatarUrl ? match.avatarUrl : null,
    displayName: typeof match.displayName === 'string' && match.displayName ? match.displayName : null,
    username: typeof match.username === 'string' && match.username ? match.username : null,
  };
}

async function watchFetch(token: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new Error('signed-out');
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json() as Promise<unknown>;
}

export async function fetchWatchState(token: string): Promise<WatchState> {
  const data = (await watchFetch(token, '/api/watch/state')) as WatchState;
  return { watchlist: data.watchlist ?? [], continueWatching: data.continueWatching ?? [], completed: data.completed ?? [] };
}

export async function toggleWatchlist(
  token: string,
  entry: { kind: WatchKind; tmdbId: string; title: string; posterUrl?: string | null; year?: string | null },
  saved: boolean,
): Promise<void> {
  await watchFetch(token, '/api/watch/watchlist', {
    method: 'POST',
    body: JSON.stringify({ ...entry, action: saved ? 'remove' : 'add' }),
  });
}

export async function reportProgress(
  token: string,
  entry: {
    kind: WatchKind;
    tmdbId: string;
    title: string;
    posterUrl?: string | null;
    season?: number;
    episode?: number;
    completed?: boolean;
  },
): Promise<void> {
  await watchFetch(token, '/api/watch/progress', { method: 'POST', body: JSON.stringify(entry) });
}

export function watchPageHref(entry: { kind: string; tmdbId: string; season?: number; episode?: number }): string {
  if (entry.kind === 'show') {
    const params = new URLSearchParams();
    if (entry.season) params.set('s', String(entry.season));
    if (entry.episode) params.set('e', String(entry.episode));
    const query = params.toString();
    return `/shows/watch/${entry.tmdbId}${query ? `?${query}` : ''}`;
  }
  return `/movie/watch/${entry.tmdbId}`;
}
