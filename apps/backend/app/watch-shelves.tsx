'use client';

import { toggleWatchlist, watchPageHref, type ContinueEntry, type WatchEntry, type WatchKind } from './watch-client';

import { PlayIcon } from './media-icons';

/**
 * Synced shelves shared by movies, shows, and later anime: one
 * continue-watching rail plus one watchlist rail, fed by a single
 * /api/watch/state call. Cards link straight into the right player.
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
  if (list.length === 0 && resume.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: '1.25rem', marginBottom: '1.75rem' }}>
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
      {list.length > 0 && (
        <section aria-label="My list">
          <ShelfTitle>My List</ShelfTitle>
          <ShelfRow>
            {list.map((entry) => (
              <div key={entry.tmdbId} style={{ position: 'relative' }}>
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
  return <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.6rem' }}>{children}</h2>;
}

function ShelfRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.7rem', overflowX: 'auto', paddingBottom: '0.35rem' }}>{children}</div>
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
            background: 'rgba(0,0,0,0.72)',
            borderRadius: '999px',
            color: '#fff',
            fontSize: '0.7rem',
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
            background: 'rgba(0,0,0,0.72)',
            borderRadius: '999px',
            color: '#cbd5e1',
            fontSize: '0.7rem',
            padding: '0.1rem 0.5rem',
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

const cardLinkStyle: React.CSSProperties = { textDecoration: 'none', color: 'inherit' };

const cardStyle: React.CSSProperties = {
  position: 'relative',
  width: '112px',
  height: '168px',
  borderRadius: '12px',
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

const removeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.25rem',
  right: '0.25rem',
  width: '1.5rem',
  height: '1.5rem',
  borderRadius: '999px',
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.9rem',
  lineHeight: 1,
};
