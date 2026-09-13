'use client';

import {
  WATCH_LIST_STATUS_LABELS,
  WATCH_LIST_STATUS_ORDER,
  toggleWatchlist,
  type ContinueEntry,
  type WatchEntry,
  type WatchKind,
  type WatchListStatus,
} from '../watch-client';
import { v2WatchPageHref } from './watch-href';
import { PosterCard, Shelf } from '@/components/ui';

/**
 * v2 synced shelves: continue-watching rail plus the list grouped into
 * Watching / Watch Later / Completed / Dropped. Same data contract as the
 * original (kind, token, state, onToggle) and the same toggle endpoint —
 * only the presentation is new.
 */
export function V2WatchShelves({
  kind,
  token,
  state,
  onToggle,
}: {
  kind: WatchKind;
  token: string;
  state: { watchlist: WatchEntry[]; continueWatching: ContinueEntry[] };
  onToggle: (tmdbId: string, saved: boolean) => void;
}) {
  const list = state.watchlist.filter((entry) => entry.kind === kind);
  const resume = state.continueWatching.filter((entry) => entry.kind === kind);
  if (list.length === 0 && resume.length === 0) return null;

  const shelfOf = (entry: WatchEntry): WatchListStatus => {
    const status = entry.status as WatchListStatus | null | undefined;
    return status && (WATCH_LIST_STATUS_ORDER as string[]).includes(status) ? status : 'watch_later';
  };

  return (
    <>
      <style>{`
        .v2-shelves { display: grid; gap: 4px; }
        .v2-shelf-item { position: relative; flex: none; opacity: 1; }
        .v2-shelf-item[data-dropped="true"] { opacity: 0.55; }
        .v2-remove { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px;
          border-radius: var(--spk-radius-full, 9999px);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          background: rgba(0,0,0,0.7); color: #fff; cursor: pointer;
          font-size: 0.95rem; line-height: 1; padding: 0; }
        .v2-remove:hover { border-color: var(--spk-text-3, #6b6f7d); }
      `}</style>
      <div className="v2-shelves">
        {resume.length > 0 && (
          <Shelf title="Continue watching">
            {resume.map((entry) => (
              <PosterCard
                key={`${entry.tmdbId}:${entry.season}:${entry.episode}`}
                href={v2WatchPageHref(entry)}
                title={entry.title}
                meta={entry.season > 0 || entry.episode > 0 ? `S${entry.season} E${entry.episode}` : 'Resume'}
                posterUrl={entry.posterUrl}
              />
            ))}
          </Shelf>
        )}
        {WATCH_LIST_STATUS_ORDER.map((status) => {
          const items = list.filter((entry) => shelfOf(entry) === status);
          if (items.length === 0) return null;
          return (
            <Shelf key={status} title={WATCH_LIST_STATUS_LABELS[status]} action={`${items.length}`}>
              {items.map((entry) => (
                <div key={entry.tmdbId} className="v2-shelf-item" data-dropped={status === 'dropped' ? 'true' : 'false'}>
                  <PosterCard
                    href={v2WatchPageHref(entry)}
                    title={entry.title}
                    meta={entry.year ?? undefined}
                    posterUrl={entry.posterUrl}
                  />
                  <button
                    type="button"
                    className="v2-remove"
                    aria-label={`Remove ${entry.title} from your list`}
                    title="Remove from My List"
                    onClick={() => {
                      void toggleWatchlist(
                        token,
                        { kind, tmdbId: entry.tmdbId, title: entry.title },
                        true,
                      ).then(() => onToggle(entry.tmdbId, false));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </Shelf>
          );
        })}
      </div>
    </>
  );
}
