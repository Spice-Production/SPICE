'use client';

import { useState } from 'react';

import {
  WATCH_LIST_STATUS_LABELS,
  WATCH_LIST_STATUS_ORDER,
  toggleWatchlist,
  watchPageHref,
  type ContinueEntry,
  type WatchEntry,
  type WatchKind,
  type WatchListStatus,
} from './watch-client';

import { PlayIcon } from './media-icons';

/**
 * Synced shelves shared by movies, shows, and anime: one
 * continue-watching rail plus a compact tabbed "My List" rail across
 * Watching / Watch Later / Completed / Dropped so personal shelves never
 * bury the discovery catalog on mobile.
 */
export function WatchShelves({
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
  const [pickedStatus, setPickedStatus] = useState<WatchListStatus | null>(null);

  if (list.length === 0 && resume.length === 0) return null;

  const shelfOf = (entry: WatchEntry): WatchListStatus => {
    const status = entry.status as WatchListStatus | null | undefined;
    return status && (WATCH_LIST_STATUS_ORDER as string[]).includes(status) ? status : 'watch_later';
  };

  const buckets = WATCH_LIST_STATUS_ORDER.map((status) => ({
    status,
    items: list.filter((entry) => shelfOf(entry) === status),
  })).filter((bucket) => bucket.items.length > 0);

  const activeBucket =
    (pickedStatus && buckets.find((bucket) => bucket.status === pickedStatus)) ?? buckets[0] ?? null;

  return (
    <div style={{ display: 'grid', gap: '1.25rem', marginBottom: '1.6rem' }}>
      {resume.length > 0 && (
        <section aria-label="Continue watching">
          <ShelfTitle>Continue watching</ShelfTitle>
          <ShelfRow>
            {resume.map((entry) => (
              <a
                key={`${entry.tmdbId}:${entry.season}:${entry.episode}`}
                href={watchPageHref(entry)}
                style={cardLinkStyle}
              >
                <ShelfCard
                  title={entry.title}
                  posterUrl={entry.posterUrl}
                  subtitle={entry.season > 0 || entry.episode > 0 ? `S${entry.season} E${entry.episode}` : 'Resume'}
                  badge={<PlayIcon size={10} />}
                />
              </a>
            ))}
          </ShelfRow>
        </section>
      )}
      {activeBucket && (
        <section aria-label="My List">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>My List</h2>
            <div role="tablist" aria-label="List status" style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {buckets.map((bucket) => {
                const selected = bucket.status === activeBucket.status;
                return (
                  <button
                    key={bucket.status}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setPickedStatus(bucket.status)}
                    style={{
                      background: selected ? 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))' : 'rgba(255,255,255,0.06)',
                      border: selected ? 'none' : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '999px',
                      color: selected ? '#fff' : 'var(--text-secondary, #cbd5e1)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '5px 11px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {WATCH_LIST_STATUS_LABELS[bucket.status]} · {bucket.items.length}
                  </button>
                );
              })}
            </div>
          </div>
          <ShelfRow>
            {activeBucket.items.map((entry) => (
              <div key={entry.tmdbId} style={{ position: 'relative', flex: 'none', opacity: activeBucket.status === 'dropped' ? 0.58 : 1 }}>
                <a href={watchPageHref(entry)} style={cardLinkStyle}>
                  <ShelfCard title={entry.title} posterUrl={entry.posterUrl} subtitle={entry.year ?? undefined} />
                </a>
                <button
                  type="button"
                  aria-label={`Remove ${entry.title} from your list`}
                  title="Remove from My List"
                  onClick={() => {
                    void toggleWatchlist(
                      token,
                      { kind, tmdbId: entry.tmdbId, title: entry.title },
                      true,
                    ).then(() => onToggle(entry.tmdbId, false));
                  }}
                  style={removeStyle}
                >
                  ×
                </button>
              </div>
            ))}
          </ShelfRow>
        </section>
      )}
    </div>
  );
}

function ShelfTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.6rem' }}>{children}</h2>;
}

function ShelfRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.35rem', scrollbarWidth: 'none' }}>{children}</div>
  );
}

function ShelfCard({
  title,
  posterUrl,
  subtitle,
  badge,
}: {
  title: string;
  posterUrl: string | null;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div style={cardStyle} title={title}>
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: '0.5rem', textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{title}</span>
        </div>
      )}
      {badge && (
        <span
          style={{
            position: 'absolute',
            left: '0.4rem',
            bottom: '0.4rem',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: '999px',
            color: '#fff',
            fontSize: '0.68rem',
            padding: '0.15rem 0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          {badge} {subtitle}
        </span>
      )}
      {!badge && subtitle && (
        <span
          style={{
            position: 'absolute',
            left: '0.4rem',
            bottom: '0.4rem',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: '999px',
            color: '#cbd5e1',
            fontSize: '0.68rem',
            padding: '0.1rem 0.5rem',
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

const cardLinkStyle: React.CSSProperties = { textDecoration: 'none', color: 'inherit', display: 'block' };

const cardStyle: React.CSSProperties = {
  position: 'relative',
  width: '116px',
  height: '174px',
  borderRadius: '11px',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
};

const removeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.3rem',
  right: '0.3rem',
  width: '1.65rem',
  height: '1.65rem',
  borderRadius: '999px',
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(0,0,0,0.78)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.95rem',
  lineHeight: 1,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
};
