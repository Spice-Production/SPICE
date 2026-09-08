'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { toggleWatchlist, type WatchKind } from './watch-client';

import { PlayIcon } from './media-icons';

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
 * toggle, plus dots to jump. Pauses on nothing fancy: it just loops.
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
    <section style={{ position: 'relative', overflow: 'hidden' }} aria-label={kicker}>
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
            opacity: i === index % slides.length ? 0.5 : 0,
            transition: 'opacity 900ms ease',
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #050509 4%, rgba(5,5,9,0.55) 55%, rgba(5,5,9,0.25))' }} />
      <div style={{ position: 'relative', maxWidth: '1080px', margin: '0 auto', padding: '88px 24px 64px' }}>
        <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '0.08em' }}>
          {kicker}
        </p>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', lineHeight: 1.05, margin: '0 0 10px 0', maxWidth: '640px' }}>
          {current.title}
        </h1>
        {current.overview && (
          <p style={{ color: '#d4d4d8', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 22px 0', maxWidth: '560px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {current.overview}
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={watchHref} style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))', borderRadius: '12px', color: '#fff', padding: '12px 28px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <PlayIcon size={16} /> Watch now
          </Link>
          {token && (
            <button type="button" onClick={() => void onToggle()} disabled={busy} style={listStyle}>
              {saved ? '✓ In My List' : '+ My List'}
            </button>
          )}
        </div>
        {slides.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '22px' }} role="tablist" aria-label="Trending picks">
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
                  width: i === index % slides.length ? '26px' : '10px',
                  height: '10px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: i === index % slides.length ? '#a855f7' : 'rgba(255,255,255,0.3)',
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
  borderRadius: '12px',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  padding: '12px 22px',
};
