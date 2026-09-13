'use client';

import { useState } from 'react';

export interface V2WatchSource {
  id: string;
  label: string;
  url: string | null;
}

/**
 * v2 provider tabs + frame, shared by movie/show/anime watch pages.
 * Same contract as the original: tabs hide when there is a single
 * source, entries without a URL render disabled (never built), the
 * frame remounts per provider and shows a loader until it fires.
 */
export function V2ProviderTabs({
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
    <>
      <style>{`
        .v2-ptabs { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-ptabs-label { font-size: 0.78rem; color: var(--spk-text-3, #6b6f7d); }
        .v2-ptab { font-size: 0.8rem; font-weight: 650; padding: 7px 14px; cursor: pointer;
          border-radius: var(--spk-radius-sm, 8px); color: var(--spk-text-2, #a3a7b5);
          background: transparent; border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); }
        .v2-ptab:hover:not(:disabled) { color: var(--spk-text, #e8eaf0); border-color: var(--spk-text-3, #6b6f7d); }
        .v2-ptab[data-on="true"] { background: var(--spk-accent-soft, rgba(139,147,248,0.14));
          border-color: transparent; color: var(--spk-text, #e8eaf0); }
        .v2-ptab:disabled { opacity: 0.4; cursor: not-allowed; }
        .v2-ptab:focus-visible { outline: 2px solid var(--spk-accent, #8b93f8); outline-offset: 2px; }
      `}</style>
      <div className="v2-ptabs">
        <span className="v2-ptabs-label">Source:</span>
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            disabled={source.disabled}
            data-on={source.id === activeId ? 'true' : 'false'}
            className="v2-ptab"
            onClick={() => onPick(source.id)}
          >
            {source.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function V2WatchFrame({ src, title, frameKey }: { src: string; title: string; frameKey: string }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <style>{`
        .v2-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000;
          border-radius: var(--spk-radius-lg, 16px); overflow: hidden;
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); }
        .v2-frame-loader { position: absolute; inset: 0; display: grid; place-items: center;
          color: var(--spk-text-3, #6b6f7d); font-size: 0.88rem;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-frame-el { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      `}</style>
      <div className="v2-frame">
        {!ready && <div className="v2-frame-loader">Loading player…</div>}
        <iframe
          key={frameKey}
          src={src}
          title={title}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          onLoad={() => setReady(true)}
          className="v2-frame-el"
        />
      </div>
    </>
  );
}
