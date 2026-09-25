'use client';

import { useEffect, useState } from 'react';

import { Avatar } from './Avatar';

export interface SpkProfileButtonProps {
  name: string | null;
  signedIn: boolean;
}

/**
 * Top-right account control: avatar + name chip that opens a small menu
 * with Profile and Settings. Auth itself lives on /v2/profile — this
 * control is just the doorway, never an inline login form.
 */
export function ProfileButton({ name, signedIn }: SpkProfileButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  return (
    <>
      <style>{`
        .spk-pwrap { position: relative; flex: none; }
        .spk-pbtn { display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
          border: 1px solid transparent; border-radius: var(--spk-radius-full, 9999px);
          padding: 3px 10px 3px 3px; font-family: var(--spk-font, Inter, system-ui, sans-serif);
          background: transparent; cursor: pointer; color: inherit; font: inherit; }
        .spk-pbtn:hover { border-color: var(--spk-line, #26262c); background: var(--spk-surface, #111114); }
        .spk-pbtn:focus-visible { outline: none; box-shadow: var(--spk-ring); }
        .spk-pbtn-name { font-size: 0.8rem; font-weight: 600; color: var(--spk-text-2, #a1a1aa);
          max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .spk-pbtn:hover .spk-pbtn-name { color: var(--spk-text, #fafafa); }
        .spk-pmenu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 180px; z-index: 50;
          background: var(--spk-surface, #111114); border: 1px solid var(--spk-line, #26262c);
          border-radius: var(--spk-radius-md, 8px); padding: 6px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-pmenu a { display: block; padding: 8px 10px; border-radius: var(--spk-radius-sm, 6px);
          text-decoration: none; color: var(--spk-text-2, #a3a7b5); font-size: 0.85rem; font-weight: 600; }
        .spk-pmenu a:hover { background: var(--spk-surface-2, #18181d); color: var(--spk-text, #fafafa); }
        .spk-pmenu-note { padding: 8px 10px 4px; font-size: 0.72rem; color: var(--spk-text-3, #71717a); }
      `}</style>
      <div className="spk-pwrap">
        <button
          type="button"
          className="spk-pbtn"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={signedIn ? `Account (${name ?? 'account'})` : 'Sign in'}
        >
          <Avatar name={signedIn ? (name ?? '?') : null} size="sm" />
          <span className="spk-pbtn-name">{signedIn ? (name ?? 'Account') : 'Sign in'}</span>
        </button>
        {open && (
          <div className="spk-pmenu" role="menu">
            {signedIn && (
              <div className="spk-pmenu-note">{name ?? 'Account'}</div>
            )}
            <a href="/v2/profile" role="menuitem" onClick={() => setOpen(false)}>
              {signedIn ? 'Profile' : 'Sign in'}
            </a>
            <a href="/v2/settings" role="menuitem" onClick={() => setOpen(false)}>
              Settings
            </a>
          </div>
        )}
      </div>
    </>
  );
}
