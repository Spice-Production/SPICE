'use client';

import type { ReactNode } from 'react';

export type SpkBadgeTone = 'default' | 'accent' | 'success' | 'danger';

export interface SpkBadgeProps {
  children: ReactNode;
  tone?: SpkBadgeTone;
}

/** Micro pill for counts, statuses, and flags. */
export function Badge({ children, tone = 'default' }: SpkBadgeProps) {
  return (
    <>
      <style>{`
        .spk-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
          border-radius: var(--spk-radius-full, 9999px); font-size: 0.7rem; font-weight: 650;
          font-family: var(--spk-font, Inter, system-ui, sans-serif);
          border: 1px solid var(--spk-line, #26262c); color: var(--spk-text-2, #a1a1aa);
          background: var(--spk-surface-2, #18181d); white-space: nowrap; }
        .spk-badge[data-tone="accent"] { color: var(--spk-text, #fafafa);
          background: var(--spk-accent-soft, rgba(139,147,248,0.12)); border-color: transparent; }
        .spk-badge[data-tone="success"] { color: #8fd6a0; background: rgba(80,180,110,0.12); border-color: transparent; }
        .spk-badge[data-tone="danger"] { color: #e89893; background: rgba(224,101,95,0.12); border-color: transparent; }
      `}</style>
      <span className="spk-badge" data-tone={tone}>
        {children}
      </span>
    </>
  );
}
