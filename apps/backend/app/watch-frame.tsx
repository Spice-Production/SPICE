'use client';

import { useEffect, useState } from 'react';

import { PLAYER_IFRAME_SANDBOX } from '@/lib/movie-provider';

import { ShieldIcon } from './media-icons';

export interface WatchSource {
  id: string;
  label: string;
  url: string | null;
}

export function WatchPageStyles() {
  return (
    <style>{`
      .watch-page {
        min-height: 100vh;
        background: var(--bg-primary, #050509);
        color: var(--text-primary, #f1f5f9);
        font-family: var(--font-geist-sans), Inter, sans-serif;
        padding-bottom: 56px;
        position: relative;
        overflow-x: hidden;
      }
      .watch-backdrop {
        position: absolute;
        inset: 0 0 auto 0;
        height: 260px;
        overflow: hidden;
        pointer-events: none;
      }
      .watch-backdrop img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.24;
        filter: blur(2px);
      }
      .watch-backdrop__fade {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, rgba(5,5,9,0.35), var(--bg-primary, #050509));
      }
      .watch-shell {
        position: relative;
        max-width: 1080px;
        margin: 0 auto;
        padding: 18px 24px 0;
      }
      .watch-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--accent-pink, #c084fc);
        text-decoration: none;
        font-weight: 700;
        font-size: 0.88rem;
        margin-bottom: 12px;
      }
      .watch-frame-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid var(--border-subtle, rgba(255,255,255,0.12));
        box-shadow: 0 18px 50px rgba(0,0,0,0.55);
      }
      .watch-provider-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .watch-provider-tabs {
        display: flex;
        gap: 6px;
        align-items: center;
        overflow-x: auto;
        scrollbar-width: none;
        max-width: 100%;
        padding: 2px 0;
      }
      .watch-provider-tabs::-webkit-scrollbar {
        display: none;
      }
      .watch-details {
        margin-top: 20px;
      }
      .watch-title {
        font-size: clamp(1.35rem, 3.6vw, 2.2rem);
        margin: 0 0 6px;
        line-height: 1.12;
      }
      .watch-meta {
        color: var(--text-secondary, #94a3b8);
        font-size: 0.86rem;
        margin: 0 0 12px;
      }
      .watch-overview {
        color: #d4d4d8;
        font-size: 0.9rem;
        line-height: 1.6;
        margin: 10px 0 0;
        max-width: 740px;
      }
      .watch-episodes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 12px;
      }
      .watch-ep-card {
        display: flex;
        flex-direction: column;
        text-align: left;
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
        padding: 0;
        color: inherit;
        transition: border-color 150ms ease, background 150ms ease;
      }
      .watch-ep-thumb {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        display: block;
        flex: none;
      }
      .watch-ep-fallback {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: grid;
        place-items: center;
        background: rgba(124,58,237,0.16);
        color: var(--accent-pink, #c4b5fd);
        font-weight: 700;
        font-size: 0.85rem;
        flex: none;
      }
      .watch-ep-body {
        padding: 8px 10px;
        min-width: 0;
      }
      @media (max-width: 640px) {
        .watch-shell {
          padding: 12px 12px 0;
        }
        .watch-frame-wrap {
          border-radius: 12px;
        }
        .watch-episodes-grid {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .watch-ep-card {
          flex-direction: row;
          align-items: center;
        }
        .watch-ep-thumb,
        .watch-ep-fallback {
          width: 124px;
        }
        .watch-ep-body {
          padding: 8px 12px;
        }
      }
    `}</style>
  );
}

export function ProviderTabs({
  sources,
  activeId,
  onPick,
}: {
  sources: { id: string; label: string; disabled: boolean }[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  if (sources.length < 2) return null;
  return (
    <div className="watch-provider-tabs" role="tablist" aria-label="Stream server">
      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 700, marginRight: '2px', whiteSpace: 'nowrap' }}>
        Server
      </span>
      {sources.map((source) => {
        const active = source.id === activeId;
        return (
          <button
            key={source.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={source.disabled}
            onClick={() => onPick(source.id)}
            style={{
              background: active ? 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))' : 'rgba(255,255,255,0.06)',
              border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: '999px',
              color: '#fff',
              padding: '6px 13px',
              fontSize: '0.8rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              cursor: source.disabled ? 'not-allowed' : 'pointer',
              opacity: source.disabled ? 0.4 : 1,
            }}
          >
            {source.label}
          </button>
        );
      })}
    </div>
  );
}

export function WatchFrame({ src, title, frameKey }: { src: string; title: string; frameKey: string }) {
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [ready, frameKey]);

  return (
    <div className="watch-frame-wrap">
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: '16px',
            color: 'var(--text-secondary, #94a3b8)',
            fontSize: '0.88rem',
            pointerEvents: 'none',
          }}
        >
          <div>
            <div>Loading player…</div>
            {slow && (
              <div style={{ fontSize: '0.78rem', marginTop: '6px', color: '#cbd5e1' }}>
                Taking a while? Try switching servers below.
              </div>
            )}
          </div>
        </div>
      )}
      <iframe
        key={frameKey}
        src={src}
        title={title}
        sandbox={PLAYER_IFRAME_SANDBOX}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
        onLoad={() => setReady(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}

export function AdShieldBadge() {
  return (
    <span
      title="Strict iframe sandbox active: popups, new tabs, and page redirects are blocked."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 10px',
        borderRadius: '999px',
        background: 'rgba(34,197,94,0.12)',
        border: '1px solid rgba(34,197,94,0.32)',
        color: '#86efac',
        fontSize: '0.74rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <ShieldIcon size={13} />
      <span>Ad Shield</span>
    </span>
  );
}
