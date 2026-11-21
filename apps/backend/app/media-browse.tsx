'use client';

import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

import { CloseIcon, FilmIcon, SearchIcon } from './media-icons';
import { formatReleaseDate } from './watch-client';

export interface BrowseCardItem {
  tmdbId: string;
  title: string;
  year: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  badge?: string | null;
}

/**
 * Shared styles and primitives for classic Movies, TV Series, and Anime
 * browse pages: compact search bar, responsive scroll rails, and 2:3 cards.
 */
export function MediaBrowseStyles() {
  return (
    <style>{`
      .browse-container {
        max-width: 1120px;
        width: 100%;
        margin: 0 auto;
        padding: 18px 24px 0;
      }
      .browse-search {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 4px 0 24px;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border-subtle, rgba(255,255,255,0.12));
        border-radius: 14px;
        padding: 5px 5px 5px 14px;
        transition: border-color 150ms ease, background 150ms ease;
      }
      .browse-search:focus-within {
        border-color: var(--accent-cyan, #a855f7);
        background: rgba(255,255,255,0.07);
      }
      .browse-search__input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        color: var(--text-primary, #f1f5f9);
        font-size: 0.96rem;
        padding: 8px 0;
        outline: none;
      }
      .browse-search__input::placeholder {
        color: var(--text-secondary, #94a3b8);
      }
      .browse-search__clear {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: none;
        background: rgba(255,255,255,0.08);
        color: var(--text-secondary, #cbd5e1);
        display: grid;
        place-items: center;
        cursor: pointer;
        flex: none;
      }
      .browse-search__submit {
        background: var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7));
        border: none;
        border-radius: 10px;
        color: #fff;
        padding: 9px 18px;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        flex: none;
      }
      .browse-search__submit:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .browse-shelf {
        margin-bottom: 26px;
      }
      .browse-shelf__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .browse-shelf__title {
        font-size: 1.05rem;
        font-weight: 800;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        letter-spacing: -0.01em;
      }
      .browse-rail {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        scroll-snap-type: x proximity;
        padding-bottom: 6px;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .browse-rail::-webkit-scrollbar {
        display: none;
      }
      .browse-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
        gap: 14px;
      }
      .poster-card {
        display: block;
        text-decoration: none;
        color: inherit;
        width: 156px;
        flex: none;
        scroll-snap-align: start;
        transition: transform 160ms ease;
      }
      .browse-grid .poster-card {
        width: 100%;
      }
      .poster-card:hover {
        transform: translateY(-2px);
      }
      .poster-card__frame {
        position: relative;
        background: var(--bg-surface, rgba(255,255,255,0.04));
        border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
        border-radius: 12px;
        overflow: hidden;
      }
      .poster-card__img {
        width: 100%;
        aspect-ratio: 2 / 3;
        object-fit: cover;
        display: block;
      }
      .poster-card__fallback {
        width: 100%;
        aspect-ratio: 2 / 3;
        display: grid;
        place-items: center;
        background: rgba(124,58,237,0.16);
        color: var(--accent-pink, #c4b5fd);
      }
      .poster-card__badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(5,5,9,0.78);
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 999px;
        color: #f1f5f9;
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 7px;
      }
      .poster-card__meta {
        padding: 8px 9px;
      }
      .poster-card__title {
        font-weight: 700;
        font-size: 0.82rem;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .poster-card__sub {
        color: var(--text-secondary, #94a3b8);
        font-size: 0.72rem;
        margin-top: 2px;
      }
      @media (max-width: 640px) {
        .browse-container {
          padding: 12px 14px 0;
        }
        .browse-search {
          margin: 0 0 18px;
          padding: 4px 4px 4px 12px;
        }
        .browse-search__submit {
          padding: 8px 14px;
          font-size: 0.82rem;
        }
        .browse-rail {
          gap: 10px;
        }
        .browse-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .poster-card {
          width: 126px;
        }
        .poster-card__frame {
          border-radius: 10px;
        }
        .poster-card__meta {
          padding: 6px 7px;
        }
        .poster-card__title {
          font-size: 0.78rem;
        }
      }
      @media (max-width: 390px) {
        .browse-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `}</style>
  );
}

export function MediaSearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder,
  ariaLabel,
  loading,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClear?: () => void;
  placeholder: string;
  ariaLabel: string;
  loading: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="browse-search">
      <span style={{ color: 'var(--text-secondary, #94a3b8)', display: 'inline-flex', flex: 'none' }}>
        <SearchIcon size={17} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="browse-search__input"
      />
      {value && onClear && (
        <button type="button" onClick={onClear} aria-label="Clear search" className="browse-search__clear">
          <CloseIcon size={14} />
        </button>
      )}
      <button type="submit" disabled={loading || !value.trim()} className="browse-search__submit">
        {loading ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}

export function MediaPosterCard({
  href,
  item,
  fallbackIcon,
}: {
  href: string;
  item: BrowseCardItem;
  fallbackIcon?: ReactNode;
}) {
  const sub = formatReleaseDate(item.releaseDate) ?? item.year;
  return (
    <Link href={href} className="poster-card">
      <div className="poster-card__frame">
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl} alt={`${item.title} poster`} className="poster-card__img" loading="lazy" />
        ) : (
          <div className="poster-card__fallback">{fallbackIcon ?? <FilmIcon size={32} />}</div>
        )}
        {item.badge && <span className="poster-card__badge">{item.badge}</span>}
        <div className="poster-card__meta">
          <div className="poster-card__title">{item.title}</div>
          {sub && <div className="poster-card__sub">{sub}</div>}
        </div>
      </div>
    </Link>
  );
}

export function MediaShelf({
  title,
  action,
  ariaLabel,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="browse-shelf" aria-label={ariaLabel}>
      <div className="browse-shelf__head">
        <h2 className="browse-shelf__title">{title}</h2>
        {action}
      </div>
      <div className="browse-rail">{children}</div>
    </section>
  );
}

export function MediaShelfSkeleton() {
  return (
    <div style={{ marginBottom: '26px' }}>
      <div style={{ height: '18px', width: '160px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', marginBottom: '12px' }} />
      <div className="browse-rail">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="poster-card" style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.05)', aspectRatio: '2 / 3.3' }} />
        ))}
      </div>
    </div>
  );
}
