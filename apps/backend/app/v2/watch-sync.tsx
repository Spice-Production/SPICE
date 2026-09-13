'use client';

import { useEffect, useState } from 'react';

import {
  WATCH_LIST_STATUS_LABELS,
  WATCH_LIST_STATUS_ORDER,
  fetchWatchState,
  readAccountToken,
  reportProgress,
  setWatchListStatus,
  toggleWatchlist,
  type WatchKind,
  type WatchListStatus,
} from '../watch-client';
import { AccountMenu, Button } from '@/components/ui';

/**
 * v2 watch sync island: reports progress on mount (feeds Continue
 * watching everywhere), owns the list-status picker and Mark watched.
 * Signed out it shows the compact sign-in, never dead buttons. Same
 * endpoints and state transitions as the original.
 */
export function V2WatchSync({
  kind,
  tmdbId,
  title,
  posterUrl,
  year,
  releaseDate,
  season = 0,
  episode = 0,
  episodeLabel,
}: {
  kind: WatchKind;
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  year?: string | null;
  releaseDate?: string | null;
  season?: number;
  episode?: number;
  episodeLabel?: string;
}) {
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [status, setStatus] = useState<WatchListStatus | null>(null);
  const [known, setKnown] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  if (!token) {
    return (
      <div style={{ margin: '0 0 18px' }}>
        <AccountMenu token={null} name={null} onSignedIn={setToken} onSignOut={() => setToken(null)} />
      </div>
    );
  }

  async function pickStatus(next: WatchListStatus) {
    setPickerOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      if (status === null) {
        await toggleWatchlist(token as string, { kind, tmdbId, title, posterUrl, year, releaseDate }, false, next);
      } else {
        await setWatchListStatus(token as string, { kind, tmdbId, status: next });
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
    setPickerOpen(false);
    if (busy || status === null) return;
    setBusy(true);
    try {
      await toggleWatchlist(token as string, { kind, tmdbId, title }, true);
      setStatus(null);
    } catch {
      /* shelf refreshes next visit */
    } finally {
      setBusy(false);
    }
  }

  async function onCompleted() {
    setBusy(true);
    try {
      await reportProgress(token as string, { kind, tmdbId, title, posterUrl, season, episode, completed: true });
      setCompleted(true);
      if (status !== null) setStatus('completed');
    } catch {
      /* ignore; retry next visit */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{`
        .v2-sync { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 18px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-sync-pop { position: relative; }
        .v2-sync-menu-wrap { position: absolute; left: 0; top: calc(100% + 6px); z-index: 41;
          min-width: 190px; background: var(--spk-surface, #101014);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          border-radius: var(--spk-radius-md, 12px); padding: 4px; display: grid; gap: 2px; }
        .v2-sync-item { border: none; border-radius: 7px; background: transparent;
          color: var(--spk-text, #e8eaf0); cursor: pointer; font-size: 0.84rem;
          padding: 8px 10px; text-align: left; width: 100%; }
        .v2-sync-item:hover { background: var(--spk-surface-2, #17171d); }
        .v2-sync-item[data-on="true"] { background: var(--spk-accent-soft, rgba(139,147,248,0.14)); font-weight: 700; }
        .v2-sync-item[data-danger="true"] { color: #e89893; }
        .v2-sync-done { color: #8fd6a0; font-size: 0.85rem; font-weight: 600; }
      `}</style>
      <div className="v2-sync">
        <div className="v2-sync-pop">
          <Button
            size="sm"
            variant={status === null ? 'quiet' : 'primary'}
            onClick={() => setPickerOpen((prev) => !prev)}
            disabled={busy || !known}
            aria-expanded={pickerOpen}
          >
            {status === null ? '+ Add to list' : `✓ ${WATCH_LIST_STATUS_LABELS[status]}`}
          </Button>
          {pickerOpen && (
            <>
              <div aria-hidden onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }} />
              <div className="v2-sync-menu-wrap" role="menu" aria-label="File under">
                {WATCH_LIST_STATUS_ORDER.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="v2-sync-item"
                    data-on={status === option ? 'true' : 'false'}
                    onClick={() => void pickStatus(option)}
                    aria-pressed={status === option}
                  >
                    {WATCH_LIST_STATUS_LABELS[option]}
                  </button>
                ))}
                {status !== null && (
                  <button type="button" className="v2-sync-item" data-danger="true" onClick={() => void removeFromList()}>
                    Remove from list
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {!completed ? (
          <Button size="sm" variant="ghost" onClick={() => void onCompleted()} disabled={busy}>
            Mark {episodeLabel ?? 'watched'}
          </Button>
        ) : (
          <span className="v2-sync-done">✓ Watched</span>
        )}
      </div>
    </>
  );
}
