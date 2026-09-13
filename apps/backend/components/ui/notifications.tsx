'use client';

import { useCallback, useEffect, useState } from 'react';

import { RELEASE_NOTIFICATION_STORAGE_KEY, type ReleaseNotification } from '@/lib/release-notifications';
import { Badge } from './Badge';
import { Button } from './Button';
import { Dialog } from './Dialog';

function storedReadIds(): string[] {
  try {
    const saved = window.localStorage.getItem(RELEASE_NOTIFICATION_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Release bell: unread count from the cloud release feed with read
 * state in the same storage key as the original. Lives in the app
 * sidebar foot on every v2 page.
 */
export function useReleaseNotes() {
  const [notes, setNotes] = useState<ReleaseNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>(() => (typeof window === 'undefined' ? [] : storedReadIds()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/release');
        const data = (await res.json().catch(() => ({}))) as { notifications?: ReleaseNotification[] };
        if (!cancelled && Array.isArray(data.notifications)) setNotes(data.notifications);
      } catch {
        /* bell stays quiet when the feed is unreachable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistIds = (ids: string[]) => {
    try {
      window.localStorage.setItem(RELEASE_NOTIFICATION_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* private mode: read state lasts the visit */
    }
  };

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const missing = notes.map((note) => note.id).filter((id) => !prev.includes(id));
      if (missing.length === 0) return prev;
      const next = [...prev, ...missing];
      persistIds(next);
      return next;
    });
  }, [notes]);

  const unread = notes.filter((note) => !readIds.includes(note.id));

  return { notes, unread, open, setOpen, markRead, markAllRead };
}

export function ReleaseBell() {
  const { notes, unread, open, setOpen, markRead, markAllRead } = useReleaseNotes();

  return (
    <>
      <style>{`
        .v2-bell { display: inline-flex; align-items: center; gap: 8px; background: transparent;
          border: 1px solid transparent; border-radius: 8px; padding: 6px 10px; cursor: pointer;
          color: var(--spk-text-2, #a1a1aa); font-size: 0.8rem; font-weight: 600;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-bell:hover { background: var(--spk-surface-2, #18181d); color: var(--spk-text, #fafafa); }
        .v2-note { display: grid; gap: 4px; padding: 10px 0; border-top: 1px solid var(--spk-line, #26262c); }
        .v2-note:first-of-type { border-top: none; padding-top: 0; }
        .v2-note-title { font-size: 0.86rem; font-weight: 700; color: var(--spk-text, #fafafa); }
        .v2-note-meta { font-size: 0.72rem; color: var(--spk-text-3, #71717a); }
        .v2-note-body { font-size: 0.82rem; line-height: 1.55; color: var(--spk-text-2, #a1a1aa); margin: 0; }
      `}</style>
      <button type="button" className="v2-bell" onClick={() => setOpen(true)} aria-label={`Release notes (${unread.length} unread)`}>
        <span aria-hidden="true">○</span> What&apos;s new
        {unread.length > 0 && <Badge tone="accent">{unread.length}</Badge>}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Release notes"
        actions={
          unread.length > 0 ? (
            <Button size="sm" variant="quiet" onClick={markAllRead}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        {notes.length === 0 && <>No release notes right now.</>}
        {notes.map((note) => {
          const isUnread = unread.some((item) => item.id === note.id);
          return (
            <div key={note.id} className="v2-note" onMouseEnter={() => markRead(note.id)}>
              <div className="v2-note-title">
                {note.title} {isUnread && <Badge tone="accent">new</Badge>}
              </div>
              <div className="v2-note-meta">v{note.version}</div>
              <p className="v2-note-body">{note.summary}</p>
            </div>
          );
        })}
      </Dialog>
    </>
  );
}
