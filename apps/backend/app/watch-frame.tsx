'use client';

import { useState } from 'react';

export interface WatchSource {
  id: string;
  label: string;
  url: string | null;
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
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Source:</span>
      {sources.map((source) => {
        const active = source.id === activeId;
        return (
          <button
            key={source.id}
            type="button"
            disabled={source.disabled}
            onClick={() => onPick(source.id)}
            style={{
              background: active ? 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))' : 'rgba(255,255,255,0.06)',
              border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              color: '#fff',
              padding: '7px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
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
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#000',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
          Loading player…
        </div>
      )}
      <iframe
        key={frameKey}
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={() => setReady(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}
