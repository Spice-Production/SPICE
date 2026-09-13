'use client';

import type { ReactNode } from 'react';

export interface SpkPageHeaderProps {
  kicker?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}

/** Quiet page opener: kicker, title, one lede line, optional actions. */
export function PageHeader({ kicker, title, lede, actions }: SpkPageHeaderProps) {
  return (
    <>
      <style>{`
        .spk-pagehead { display: grid; gap: 10px; max-width: 640px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-pagehead-kicker { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--spk-text-3, #6b6f7d); }
        .spk-pagehead-title { margin: 0; font-size: 1.7rem; font-weight: 700; letter-spacing: -0.015em;
          color: var(--spk-text, #e8eaf0); }
        .spk-pagehead-lede { margin: 0; font-size: 0.92rem; line-height: 1.6;
          color: var(--spk-text-2, #a3a7b5); }
        .spk-pagehead-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
      `}</style>
      <header className="spk-pagehead">
        {kicker && <span className="spk-pagehead-kicker">{kicker}</span>}
        <h1 className="spk-pagehead-title">{title}</h1>
        {lede && <p className="spk-pagehead-lede">{lede}</p>}
        {actions && <div className="spk-pagehead-actions">{actions}</div>}
      </header>
    </>
  );
}
