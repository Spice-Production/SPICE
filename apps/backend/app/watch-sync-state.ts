'use client';

import { useEffect, useState } from 'react';

import {
  WATCH_LIST_STATUS_ORDER,
  fetchWatchState,
  readAccountToken,
  reportProgress,
  setWatchListStatus,
  toggleWatchlist,
  type WatchKind,
  type WatchListStatus,
} from './watch-client';

export interface WatchSyncProps {
  kind: WatchKind;
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  year?: string | null;
  releaseDate?: string | null;
  season?: number;
  episode?: number;
  episodeLabel?: string;
}

/**
 * Watch-page account sync shared by the classic and new interfaces: reports
 * progress (Continue watching), tracks the list status, and marks watched.
 */
export function useWatchSync({
  kind,
  tmdbId,
  title,
  posterUrl,
  year,
  releaseDate,
  season = 0,
  episode = 0,
}: WatchSyncProps) {
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [status, setStatus] = useState<WatchListStatus | null>(null);
  const [known, setKnown] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    reportProgress(token, { kind, tmdbId, title, posterUrl, season, episode }).catch(() => null);
    fetchWatchState(token)
      .then((state) => {
        if (cancelled) return;
        const row = state.watchlist.find((entry) => entry.kind === kind && entry.tmdbId === tmdbId);
        const shelf = row?.status as WatchListStatus | null | undefined;
        setStatus(shelf && (WATCH_LIST_STATUS_ORDER as string[]).includes(shelf) ? shelf : row ? 'watch_later' : null);
        setKnown(true);
        setCompleted(
          state.completed.some(
            (entry) => entry.kind === kind && entry.tmdbId === tmdbId && entry.season === season && entry.episode === episode,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, kind, tmdbId, title, posterUrl, season, episode]);

  async function pickStatus(next: WatchListStatus) {
    if (busy || !token) return;
    setBusy(true);
    try {
      if (status === null) {
        await toggleWatchlist(token, { kind, tmdbId, title, posterUrl, year, releaseDate }, false, next);
      } else {
        await setWatchListStatus(token, { kind, tmdbId, status: next });
      }
      setStatus(next);
      setKnown(true);
    } catch {
      /* shelf refreshes next visit; keep the old state */
    } finally {
      setBusy(false);
    }
  }

  async function removeFromList() {
    if (busy || status === null || !token) return;
    setBusy(true);
    try {
      await toggleWatchlist(token, { kind, tmdbId, title }, true);
      setStatus(null);
    } catch {
      /* shelf refreshes next visit */
    } finally {
      setBusy(false);
    }
  }

  async function markWatched() {
    if (!token) return;
    setBusy(true);
    try {
      await reportProgress(token, { kind, tmdbId, title, posterUrl, season, episode, completed: true });
      setCompleted(true);
      if (status !== null) setStatus('completed');
    } catch {
      /* ignore; retry next visit */
    } finally {
      setBusy(false);
    }
  }

  return { token, setToken, status, known, completed, busy, pickStatus, removeFromList, markWatched };
}
