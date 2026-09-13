'use client';

import { useEffect, type ReactNode } from 'react';

export interface SpkDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

/** Modal dialog: backdrop close, Escape close, action row. */
export function Dialog({ open, onClose, title, children, actions }: SpkDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        .spk-dlg-back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,0.6); }
        .spk-dlg { position: fixed; z-index: 61; left: 50%; top: 16vh; transform: translateX(-50%);
          width: min(440px, calc(100vw - 48px)); background: var(--spk-surface, #111114);
          border: 1px solid var(--spk-line, #26262c); border-radius: var(--spk-radius-md, 8px);
          padding: 20px; display: grid; gap: 12px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-dlg-title { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--spk-text, #fafafa); }
        .spk-dlg-body { font-size: 0.86rem; line-height: 1.6; color: var(--spk-text-2, #a1a1aa); }
        .spk-dlg-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
      `}</style>
      <div className="spk-dlg-back" aria-hidden onClick={onClose} />
      <div className="spk-dlg" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="spk-dlg-title">{title}</h2>
        <div className="spk-dlg-body">{children}</div>
        {actions && <div className="spk-dlg-actions">{actions}</div>}
      </div>
    </>
  );
}
