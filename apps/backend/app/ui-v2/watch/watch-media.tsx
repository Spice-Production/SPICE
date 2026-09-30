'use client';

/* eslint-disable @next/next/no-img-element -- TMDB artwork URLs are not configured for next/image. */

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import {
  WATCH_LIST_STATUS_LABELS,
  WATCH_LIST_STATUS_ORDER,
  toggleWatchlist,
  watchPageHref,
  type ContinueEntry,
  type WatchEntry,
  type WatchKind,
  type WatchListStatus,
} from '../../watch-client';
import { Icon, type IconName } from '../icons';
import { Shelf } from '../media';
import { Badge, Button, IconButton, cn, primitiveStyles as ps } from '../primitives';
import s from './watch.module.css';

export interface HeroItem {
  tmdbId: string;
  title: string;
  overview: string;
  backdropUrl: string | null;
  year: string | null;
}

export function watchHrefFor(kind: WatchKind, tmdbId: string) {
  return kind === 'show' ? `/shows/watch/${tmdbId}` : `/movie/watch/${tmdbId}`;
}

/** 2:3 poster tile linking to its player. */
export function PosterCard({
  href,
  title,
  posterUrl,
  subtitle,
  fallbackIcon = 'film',
  badge,
  dimmed,
  action,
}: {
  href: string;
  title: string;
  posterUrl: string | null;
  subtitle?: ReactNode;
  fallbackIcon?: IconName;
  /** Overlay chip on the artwork (e.g. "S2 E5"). */
  badge?: ReactNode;
  dimmed?: boolean;
  /** Extra control over the artwork corner (e.g. remove from list). */
  action?: ReactNode;
}) {
  return (
    <div className={cn(s.poster, dimmed && s.posterDimmed)}>
      <Link href={href} className={s.posterLink} aria-label={title}>
        <span className={s.posterArt}>
          {posterUrl ? (
            <img src={posterUrl} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <span className={s.posterFallback}>
              <Icon name={fallbackIcon} size={28} />
            </span>
          )}
          <span className={s.posterPlay} aria-hidden="true">
            <Icon name="play" size={16} filled />
          </span>
          {badge ? <span className={s.posterBadge}>{badge}</span> : null}
        </span>
        <span className={s.posterTitle}>{title}</span>
        {subtitle ? <span className={s.posterSubtitle}>{subtitle}</span> : null}
      </Link>
      {action ? <span className={s.posterAction}>{action}</span> : null}
    </div>
  );
}

const ROTATE_MS = 8000;

/**
 * Billboard: the trending titles rotate behind the page header with Watch now
 * and My List (same behavior as the classic hero).
 */
export function WatchHero({
  kicker,
  items,
  kind,
  token,
  savedIds,
  onListChange,
}: {
  kicker: string;
  items: HeroItem[];
  kind: WatchKind;
  token: string | null;
  savedIds: Set<string>;
  onListChange: (tmdbId: string, saved: boolean, title: string) => void;
}) {
  const slides = items.filter((item) => item.backdropUrl).slice(0, 5);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = slides.length > 0 ? slides[index % slides.length] : undefined;

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (!current) return null;
  const saved = savedIds.has(current.tmdbId);

  async function onToggle() {
    const item = current;
    if (!token || busy || !item) return;
    setBusy(true);
    try {
      await toggleWatchlist(token, { kind, tmdbId: item.tmdbId, title: item.title }, saved);
      onListChange(item.tmdbId, !saved, item.title);
    } catch {
      /* shelf refreshes next visit */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.hero} aria-label={kicker}>
      {slides.map((slide, i) => (
        <img
          key={slide.tmdbId}
          src={slide.backdropUrl as string}
          alt=""
          aria-hidden="true"
          className={s.heroImage}
          data-active={i === index % slides.length ? 'true' : undefined}
        />
      ))}
      <div className={s.heroScrim} />
      <div className={s.heroBody}>
        <Badge variant="outline" icon="trendingUp">
          {kicker}
        </Badge>
        <h1 className={s.heroTitle}>{current.title}</h1>
        {current.overview ? <p className={s.heroOverview}>{current.overview}</p> : null}
        <div className={s.heroActions}>
          <Link href={watchHrefFor(kind, current.tmdbId)} className={cn(ps.button, ps['button-default'], ps['button-lg'])}>
            <Icon name="play" size={16} filled />
            Watch now
          </Link>
          {token ? (
            <Button variant="secondary" size="lg" icon={saved ? 'check' : 'plus'} loading={busy} onClick={() => void onToggle()}>
              {saved ? 'In My List' : 'My List'}
            </Button>
          ) : null}
        </div>
        {slides.length > 1 ? (
          <div className={s.heroDots} role="tablist" aria-label="Trending picks">
            {slides.map((slide, i) => (
              <button
                key={slide.tmdbId}
                type="button"
                role="tab"
                aria-selected={i === index % slides.length}
                aria-label={slide.title}
                title={slide.title}
                className={s.heroDot}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Continue watching plus the list grouped by status (Watching / Watch Later /
 * Completed / Dropped), from the synced watch state.
 */
export function WatchListShelves({
  kind,
  token,
  state,
  onRemoved,
}: {
  kind: WatchKind;
  token: string;
  state: { watchlist: WatchEntry[]; continueWatching: ContinueEntry[] };
  onRemoved: (tmdbId: string) => void;
}) {
  const list = state.watchlist.filter((entry) => entry.kind === kind);
  const resume = state.continueWatching.filter((entry) => entry.kind === kind);
  if (list.length === 0 && resume.length === 0) return null;

  const shelfOf = (entry: WatchEntry): WatchListStatus => {
    const status = entry.status as WatchListStatus | null | undefined;
    return status && (WATCH_LIST_STATUS_ORDER as string[]).includes(status) ? status : 'watch_later';
  };
  const fallbackIcon: IconName = kind === 'show' ? 'tv' : 'film';

  return (
    <>
      {resume.length > 0 ? (
        <Shelf title="Continue watching" itemWidth={150} id={`${kind}-continue`}>
          {resume.map((entry) => (
            <PosterCard
              key={`${entry.tmdbId}:${entry.season}:${entry.episode}`}
              href={watchPageHref(entry)}
              title={entry.title}
              posterUrl={entry.posterUrl}
              fallbackIcon={fallbackIcon}
              badge={
                <>
                  <Icon name="play" size={10} filled />
                  {entry.season > 0 || entry.episode > 0 ? `S${entry.season} E${entry.episode}` : 'Resume'}
                </>
              }
            />
          ))}
        </Shelf>
      ) : null}
      {WATCH_LIST_STATUS_ORDER.map((status) => {
        const items = list.filter((entry) => shelfOf(entry) === status);
        if (items.length === 0) return null;
        return (
          <Shelf
            key={status}
            id={`${kind}-${status}`}
            title={
              <span className={s.shelfTitle}>
                {WATCH_LIST_STATUS_LABELS[status]}
                <span className={s.shelfCount}>{items.length}</span>
              </span>
            }
            itemWidth={150}
          >
            {items.map((entry) => (
              <PosterCard
                key={entry.tmdbId}
                href={watchPageHref(entry)}
                title={entry.title}
                posterUrl={entry.posterUrl}
                subtitle={entry.year ?? undefined}
                fallbackIcon={fallbackIcon}
                dimmed={status === 'dropped'}
                action={
                  <IconButton
                    icon="x"
                    size="xs"
                    variant="secondary"
                    label={`Remove ${entry.title} from your list`}
                    title="Remove from My List"
                    onClick={() => {
                      void toggleWatchlist(token, { kind, tmdbId: entry.tmdbId, title: entry.title }, true).then(() =>
                        onRemoved(entry.tmdbId),
                      );
                    }}
                  />
                }
              />
            ))}
          </Shelf>
        );
      })}
    </>
  );
}
