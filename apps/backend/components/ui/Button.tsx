'use client';

import type { ButtonHTMLAttributes } from 'react';

export type SpkButtonVariant = 'primary' | 'quiet' | 'ghost';
export type SpkButtonSize = 'sm' | 'md';

export interface SpkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SpkButtonVariant;
  size?: SpkButtonSize;
}

/**
 * One flat button. `primary` is reserved for the single main action per
 * view; everything else is `quiet` (bordered) or `ghost` (chromeless).
 */
export function Button({ variant = 'quiet', size = 'md', type = 'button', ...rest }: SpkButtonProps) {
  return (
    <>
      <style>{`
        .spk-btn { font-family: var(--spk-font, Inter, system-ui, sans-serif); font-weight: 600;
          border: 1px solid transparent; border-radius: var(--spk-radius-sm, 6px);
          cursor: pointer; transition: background 120ms ease, border-color 120ms ease, color 120ms ease; }
        .spk-btn[data-size="sm"] { font-size: 0.8rem; padding: 0 12px; height: 32px; }
        .spk-btn[data-size="md"] { font-size: 0.875rem; padding: 0 16px; height: 38px; }
        .spk-btn[data-variant="primary"] { background: var(--spk-accent, #fafafa); color: var(--spk-accent-ink, #0b0c12); }
        .spk-btn[data-variant="primary"]:hover { filter: brightness(1.08); }
        .spk-btn[data-variant="quiet"] { background: var(--spk-surface-2, #18181d);
          border-color: var(--spk-line, #26262c); color: var(--spk-text, #fafafa); }
        .spk-btn[data-variant="quiet"]:hover { background: var(--spk-surface-2, #18181d); border-color: var(--spk-text-3, #71717a); }
        .spk-btn[data-variant="ghost"] { background: transparent; color: var(--spk-text-2, #a1a1aa); height: auto; padding: 6px 10px; }
        .spk-btn[data-variant="ghost"]:hover { color: var(--spk-text, #fafafa); background: var(--spk-surface-2, #18181d); }
        .spk-btn:disabled { opacity: 0.45; cursor: default; }
        .spk-btn:focus-visible { outline: none; box-shadow: var(--spk-ring); }
      `}</style>
      <button type={type} data-variant={variant} data-size={size} {...rest} className={['spk-btn', rest.className].filter(Boolean).join(' ')} />
    </>
  );
}
