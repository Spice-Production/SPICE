'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PlayIcon } from './media-icons';
import { toggleWatchlist, watchPageHref, type WatchKind } from './watch-client';

export interface HeroItem {
  tmdbId: string;
  title: string;
  overview: string;
  backdropUrl: string | null;
  year: string | null;
}

const ROTATE_MS = 8000;

/**
 * Billboard hero: the trending shelf scrolls by itself behind the header —
 * each backdrop fades in with its title, a Play button, and a My List
 * toggle, plus dots to jump. Tightens vertically on phones so the first
 * shelves stay visible above the fold.
 */
export default function MediaHero({
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
  const watchHref = watchPageHref({ kind, tmdbId: current.tmdbId });

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
    <section className="media-hero" aria-label={kicker}>
      <style>{`
        .media-hero {
          position: relative;
          overflow: hidden;
        }
        .media-hero__content {
          position: relative;
          max-width: 1120px;
          margin: 0 auto;
          padding: 68px 24px 40px;
        }
        .media-hero__overview {
          color: #d4d4d8;
          font-size: 0.92rem;
          line-height: 1.55;
          margin: 0 0 18px 0;
          max-width: 540px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .media-hero__content {
            padding: 36px 14px 24px;
          }
          .media-hero__overview {
            font-size: 0.84rem;
            line-height: 1.45;
            margin-bottom: 14px;
            -webkit-line-clamp: 2;
          }
        }
      `}</style>
      {slides.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.tmdbId}
          src={slide.backdropUrl as string}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: i === index % slides.length ? 0.52 : 0,
            transition: 'opacity 900ms ease',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, var(--bg-primary, #050509) 6%, rgba(5,5,9,0.58) 55%, rgba(5,5,9,0.22))',
        }}
      />
      <div className="media-hero__content">
        <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.72rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '0.1em' }}>
          {kicker}
        </p>
        <h1 style={{ fontSize: 'clamp(1.65rem, 4.6vw, 3rem)', lineHeight: 1.06, margin: '0 0 8px 0', maxWidth: '620px' }}>
          {current.title}
        </h1>
        {current.overview && <p className="media-hero__overview">{current.overview}</p>}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href={watchHref}
            style={{
              background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))',
              borderRadius: '11px',
              color: '#fff',
              padding: '10px 22px',
              fontSize: '0.9rem',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <PlayIcon size={15} /> Watch now
          </Link>
          {token && (
            <button type="button" onClick={() => void onToggle()} disabled={busy} style={listStyle}>
              {saved ? '✓ In My List' : '+ My List'}
            </button>
          )}
        </div>
        {slides.length > 1 && (
          <div style={{ display: 'flex', gap: '7px', marginTop: '18px' }} role="tablist" aria-label="Trending picks">
            {slides.map((slide, i) => (
              <button
                key={slide.tmdbId}
                type="button"
                role="tab"
                aria-selected={i === index % slides.length}
                aria-label={slide.title}
                title={slide.title}
                onClick={() => setIndex(i)}
                style={{
                  width: i === index % slides.length ? '24px' : '9px',
                  height: '9px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: i === index % slides.length ? 'var(--accent-cyan, #a855f7)' : 'rgba(255,255,255,0.32)',
                  transition: 'width 300ms ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const listStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '11px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 700,
  padding: '10px 18px',
};
