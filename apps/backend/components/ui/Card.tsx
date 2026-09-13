'use client';

import type { ReactNode } from 'react';

export interface SpkCardProps {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
}

/**
 * Quiet content block: flat surface, hairline border, small header row.
 * No shadows, no glow — hierarchy comes from spacing, not elevation.
 */
export function Card({ title, extra, children }: SpkCardProps) {
  return (
    <>
      <style>{`
        .spk-card { background: var(--spk-surface, #111114); border: 1px solid var(--spk-line, #26262c);
          border-radius: var(--spk-radius-md, 8px); padding: 20px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 14px; }
        .spk-card-title { margin: 0; font-size: 0.95rem; font-weight: 650; color: var(--spk-text, #fafafa);
          letter-spacing: 0.005em; }
        .spk-card-extra { font-size: 0.76rem; color: var(--spk-text-3, #71717a); }
      `}</style>
      <section className="spk-card">
        {(title || extra) && (
          <div className="spk-card-head">
            {title ? <h2 className="spk-card-title">{title}</h2> : <span />}
            {extra && <span className="spk-card-extra">{extra}</span>}
          </div>
        )}
        {children}
      </section>
    </>
  );
}
