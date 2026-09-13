'use client';

import { useEffect, useState } from 'react';

import { toggleWatchlist, type WatchKind } from '../watch-client';
import { Button } from '@/components/ui';

export interface V2HeroItem {
  tmdbId: string;
  title: string;
  overview: string;
  backdropUrl: string | null;
  year: string | null;
}

const ROTATE_MS = 8000;

/**
 * v2 billboard hero: same behavior as the original (trending backdrops
 * rotate with title, Watch link, My List toggle, jump dots) in the quiet
 * kit language. The dark scrim over art is functional legibility, not
 * decoration.
 */
export function V2MovieHero({
  kicker,
  items,
  kind,
  token,
  savedIds,
  onListChange,
}: {
  kicker: string;
  items: V2HeroItem[];
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
  const watchHref = kind === 'show' ? `/shows/watch/${current.tmdbId}` : `/movie/watch/${current.tmdbId}`;

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
    <>
      <style>{`
        .v2-hero { position: relative; overflow: hidden; border-radius: var(--spk-radius-lg, 16px);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          font-family: var(--spk-font, Inter, system-ui, sans-serif); min-height: 340px; }
        .v2-hero-slide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
          opacity: 0; transition: opacity 900ms ease; }
        .v2-hero-slide[data-on="true"] { opacity: 0.45; }
        .v2-hero-scrim { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.88) 8%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.15)); }
        .v2-hero-body { position: relative; padding: 64px 28px 28px; max-width: 620px; }
        .v2-hero-kicker { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em;
          color: var(--spk-text-2, #a3a7b5); margin: 0 0 10px; }
        .v2-hero-title { font-size: clamp(1.6rem, 4vw, 2.4rem); line-height: 1.08; margin: 0 0 10px;
          letter-spacing: -0.015em; color: #fff; }
        .v2-hero-overview { color: #c9ccd6; font-size: 0.9rem; line-height: 1.6; margin: 0 0 20px;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .v2-hero-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .v2-hero-dots { display: flex; gap: 8px; margin-top: 20px; }
        .v2-hero-dot { height: 8px; border-radius: 999px; border: none; cursor: pointer; padding: 0;
          width: 8px; background: rgba(255,255,255,0.3); transition: width 300ms ease, background 300ms ease; }
        .v2-hero-dot[data-on="true"] { width: 24px; background: var(--spk-accent, #8b93f8); }
      `}</style>
      <section className="v2-hero" aria-label={kicker}>
        {slides.map((slide, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.tmdbId}
            src={slide.backdropUrl as string}
            alt=""
            aria-hidden
            data-on={i === index % slides.length ? 'true' : 'false'}
            className="v2-hero-slide"
          />
        ))}
        <div className="v2-hero-scrim" aria-hidden="true" />
        <div className="v2-hero-body">
          <p className="v2-hero-kicker">{kicker}</p>
          <h1 className="v2-hero-title">{current.title}</h1>
          {current.overview && <p className="v2-hero-overview">{current.overview}</p>}
          <div className="v2-hero-actions">
            <a href={watchHref} style={{ textDecoration: 'none' }}>
              <Button variant="primary">Watch now</Button>
            </a>
            {token && (
              <Button variant="quiet" onClick={() => void onToggle()} disabled={busy}>
                {saved ? '✓ In My List' : '+ My List'}
              </Button>
            )}
          </div>
          {slides.length > 1 && (
            <div className="v2-hero-dots" role="tablist" aria-label="Trending picks">
              {slides.map((slide, i) => (
                <button
                  key={slide.tmdbId}
                  type="button"
                  role="tab"
                  aria-selected={i === index % slides.length}
                  aria-label={slide.title}
                  title={slide.title}
                  data-on={i === index % slides.length ? 'true' : 'false'}
                  className="v2-hero-dot"
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
