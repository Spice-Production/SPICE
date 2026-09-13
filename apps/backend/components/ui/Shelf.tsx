'use client';

import type { ReactNode } from 'react';

export interface SpkShelfProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Horizontal rail with scroll snap — the continue-watching shape. */
export function Shelf({ title, action, children }: SpkShelfProps) {
  return (
    <>
      <style>{`
        .spk-shelf { display: grid; gap: 10px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-shelf-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .spk-shelf-title { margin: 0; font-size: 0.85rem; font-weight: 650;
          color: var(--spk-text-2, #a3a7b5); letter-spacing: 0.04em; text-transform: uppercase; }
        .spk-shelf-action { font-size: 0.8rem; color: var(--spk-text-3, #6b6f7d); }
        .spk-shelf-rail { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px;
          scroll-snap-type: x mandatory; scrollbar-width: thin; }
        .spk-shelf-rail > * { scroll-snap-align: start; flex: none; }
      `}</style>
      <section className="spk-shelf">
        {(title || action) && (
          <div className="spk-shelf-head">
            {title ? <h2 className="spk-shelf-title">{title}</h2> : <span />}
            {action && <span className="spk-shelf-action">{action}</span>}
          </div>
        )}
        <div className="spk-shelf-rail">{children}</div>
      </section>
    </>
  );
}
