'use client';

import type { ReactNode } from 'react';

import { ReleaseBell } from './notifications';

export interface SpkNavItem {
  id: string;
  label: string;
  href: string;
}

export interface SpkAppShellProps {
  items: SpkNavItem[];
  active: string;
  topbar?: ReactNode;
  children: ReactNode;
}

/**
 * App frame for the rebuilt surfaces: slim sidebar on desktop that
 * collapses to a top strip on phones, sticky topbar, content below.
 * Plain <a> links keep the file copy-portable (no router import).
 */
export function AppShell({ items, active, topbar, children }: SpkAppShellProps) {
  return (
    <>
      <style>{`
        .spk-shell { display: flex; min-height: 100vh; background: var(--spk-bg, #000);
          color: var(--spk-text, #e8eaf0); font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-side { width: 216px; flex: none; border-right: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          padding: 20px 12px; display: flex; flex-direction: column; gap: 4px;
          position: sticky; top: 0; height: 100vh; box-sizing: border-box; }
        .spk-brand { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.14em;
          color: var(--spk-text-3, #71717a); padding: 4px 12px 14px; }
        .spk-side-foot { margin-top: auto; padding-top: 12px;
          border-top: 1px solid var(--spk-line, #26262c); display: grid; gap: 4px; }
        .spk-navlink { display: block; padding: 9px 12px; border-radius: var(--spk-radius-sm, 8px);
          text-decoration: none; color: var(--spk-text-2, #a3a7b5);
          font-weight: 600; font-size: 0.88rem; }
        .spk-navlink:hover { background: var(--spk-surface-2, #17171d); color: var(--spk-text, #e8eaf0); }
        .spk-navlink[data-on="true"] { background: var(--spk-accent-soft, rgba(139,147,248,0.14));
          color: var(--spk-text, #e8eaf0); }
        .spk-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .spk-top { display: flex; align-items: center; gap: 12px; padding: 12px 24px;
          border-bottom: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          position: sticky; top: 0; background: var(--spk-bg, #000); z-index: 30; }
        .spk-body { padding: 28px 24px 80px; max-width: 1024px; width: 100%;
          margin: 0 auto; box-sizing: border-box; display: grid; gap: 24px; align-content: start; }
        @media (max-width: 900px) {
          .spk-shell { flex-direction: column; }
          .spk-side { width: auto; height: auto; position: static; flex-direction: row; align-items: center;
            border-right: none; border-bottom: 1px solid var(--spk-line, rgba(255,255,255,0.09));
            padding: 10px 12px; overflow-x: auto; }
          .spk-brand { padding: 4px 8px; }
          .spk-navlink { white-space: nowrap; }
          .spk-top { position: static; }
        }
      `}</style>
      <div className="spk-shell">
        <nav className="spk-side" aria-label="Primary">
          <span className="spk-brand">SPICE</span>
          {items.map((item) => (
            <a key={item.id} className="spk-navlink" data-on={item.id === active ? 'true' : 'false'} href={item.href}>
              {item.label}
            </a>
          ))}
          <div className="spk-side-foot">
            <ReleaseBell />
          </div>
        </nav>
        <div className="spk-main">
          {topbar && <div className="spk-top">{topbar}</div>}
          <div className="spk-body">{children}</div>
        </div>
      </div>
    </>
  );
}
