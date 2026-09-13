'use client';

import { Avatar } from './Avatar';

export interface SpkProfileButtonProps {
  name: string | null;
  signedIn: boolean;
}

/**
 * Top-right account button for app topbars: avatar + name when signed
 * in, a quiet sign-in chip otherwise. Always routes to /v2/profile —
 * auth lives there, never inline in browse pages.
 */
export function ProfileButton({ name, signedIn }: SpkProfileButtonProps) {
  return (
    <>
      <style>{`
        .spk-pbtn { display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
          border: 1px solid transparent; border-radius: var(--spk-radius-full, 9999px);
          padding: 3px 10px 3px 3px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-pbtn:hover { border-color: var(--spk-line, #26262c); background: var(--spk-surface, #111114); }
        .spk-pbtn:focus-visible { outline: none; box-shadow: var(--spk-ring); }
        .spk-pbtn-name { font-size: 0.8rem; font-weight: 600; color: var(--spk-text-2, #a1a1aa);
          max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .spk-pbtn:hover .spk-pbtn-name { color: var(--spk-text, #fafafa); }
      `}</style>
      <a className="spk-pbtn" href="/v2/profile" aria-label={signedIn ? `Profile (${name ?? 'account'})` : 'Sign in'}>
        <Avatar name={signedIn ? (name ?? '?') : null} size="sm" />
        <span className="spk-pbtn-name">{signedIn ? (name ?? 'Account') : 'Sign in'}</span>
      </a>
    </>
  );
}
