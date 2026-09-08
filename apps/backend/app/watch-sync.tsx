'use client';

import { useEffect, useState } from 'react';

import MediaSignIn from './media-signin';
import {
  fetchWatchState,
  readAccountToken,
  reportProgress,
  toggleWatchlist,
  type WatchKind,
} from './watch-client';

/**
 * One island per watch page: reports progress to the SPICE account (so the
 * series bookmark / started film shows up in Continue watching everywhere),
 * owns the My List toggle, and offers Mark watched. When signed out it
 * collapses to a compact sign-in instead of dead buttons.
 */
export default function WatchSync({
  kind,
  tmdbId,
  title,
  posterUrl,
  year,
  season = 0,
  episode = 0,
  episodeLabel,
}: {
  kind: WatchKind;
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  year?: string | null;
  season?: number;
  episode?: number;
  episodeLabel?: string;
}) {
  const [token, setToken] = useState<string | null>(() => readAccountToken());
  const [saved, setSaved] = useState<boolean | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    reportProgress(token, { kind, tmdbId, title, posterUrl, season, episode }).catch(() => null);
    fetchWatchState(token)
      .then((state) => {
        if (cancelled) return;
        setSaved(state.watchlist.some((entry) => entry.kind === kind && entry.tmdbId === tmdbId));
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
      <div style={{ margin: '0 0 1.1rem' }}>
        <MediaSignIn onSignedIn={setToken} />
      </div>
    );
  }

  async function onToggle() {
    if (saved === null) return;
    setBusy(true);
    try {
      await toggleWatchlist(token as string, { kind, tmdbId, title, posterUrl, year }, saved);
      setSaved(!saved);
    } catch {
      /* shelf refreshes next visit; keep the old state */
    } finally {
      setBusy(false);
    }
  }

  async function onCompleted() {
    setBusy(true);
    try {
      await reportProgress(token as string, { kind, tmdbId, title, posterUrl, season, episode, completed: true });
      setCompleted(true);
    } catch {
      /* ignore; retry next visit */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 1.1rem' }}>
      <button type="button" onClick={() => void onToggle()} disabled={busy || saved === null} style={primaryStyle}>
        {saved ? '✓ In My List' : '+ My List'}
      </button>
      {!completed ? (
        <button type="button" onClick={() => void onCompleted()} disabled={busy} style={ghostStyle}>
          Mark {episodeLabel ?? 'watched'}
        </button>
      ) : (
        <span style={{ color: '#86efac', fontSize: '0.85rem', fontWeight: 600 }}>✓ Watched</span>
      )}
    </div>
  );
}

const primaryStyle: React.CSSProperties = {
  background: '#7c3aed',
  border: '1px solid #7c3aed',
  borderRadius: '10px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 700,
  padding: '0.5rem 1rem',
};

const ghostStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '10px',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
  padding: '0.5rem 1rem',
};
