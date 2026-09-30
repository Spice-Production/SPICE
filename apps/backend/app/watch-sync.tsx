'use client';

import { useState } from 'react';

import MediaSignIn from './media-signin';
import { WATCH_LIST_STATUS_LABELS, WATCH_LIST_STATUS_ORDER, type WatchListStatus } from './watch-client';
import { useWatchSync, type WatchSyncProps } from './watch-sync-state';

/**
 * One island per watch page: reports progress to the SPICE account (so the
 * series bookmark / started film shows up in Continue watching everywhere),
 * owns the list-status picker (Watch Later / Watching / Completed /
 * Dropped), and offers Mark watched. When signed out it collapses to a
 * compact sign-in instead of dead buttons.
 */
export default function WatchSync(props: WatchSyncProps) {
  const { episodeLabel } = props;
  const { token, setToken, status, known, completed, busy, pickStatus: saveStatus, removeFromList: removeEntry, markWatched } = useWatchSync(props);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!token) {
    return (
      <div style={{ margin: '0 0 1.1rem' }}>
        <MediaSignIn onSignedIn={setToken} />
      </div>
    );
  }

  function pickStatus(next: WatchListStatus) {
    setPickerOpen(false);
    void saveStatus(next);
  }

  function removeFromList() {
    setPickerOpen(false);
    void removeEntry();
  }

  function onCompleted() {
    void markWatched();
  }

  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 1.1rem' }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setPickerOpen((prev) => !prev)}
          disabled={busy || !known}
          aria-expanded={pickerOpen}
          style={status === null ? ghostStyle : primaryStyle}
        >
          {status === null ? '+ Add to list' : `✓ ${WATCH_LIST_STATUS_LABELS[status]}`}
        </button>
        {pickerOpen && (
          <>
            <div aria-hidden onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }} />
            <div
              role="menu"
              aria-label="File under"
              style={{
                position: 'absolute',
                left: 0,
                top: 'calc(100% + 6px)',
                minWidth: '190px',
                background: '#1b1b24',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '12px',
                boxShadow: '0 14px 36px rgba(0,0,0,0.5)',
                zIndex: 41,
                padding: '4px',
                display: 'grid',
                gap: '2px',
              }}
            >
              {WATCH_LIST_STATUS_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void pickStatus(option)}
                  aria-pressed={status === option}
                  style={{
                    ...menuItemStyle,
                    background: status === option ? 'rgba(124,58,237,0.28)' : 'transparent',
                    fontWeight: status === option ? 700 : 500,
                  }}
                >
                  {WATCH_LIST_STATUS_LABELS[option]}
                </button>
              ))}
              {status !== null && (
                <button type="button" onClick={() => void removeFromList()} style={{ ...menuItemStyle, color: '#f87171' }}>
                  Remove from list
                </button>
              )}
            </div>
          </>
        )}
      </div>
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

const menuItemStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '7px',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: '0.85rem',
  padding: '8px 10px',
  textAlign: 'left',
  width: '100%',
};
