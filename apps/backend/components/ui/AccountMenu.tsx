'use client';

import { useState } from 'react';

import { Button } from './Button';

export interface SpkAccountMenuProps {
  token: string | null;
  name: string | null;
  onSignedIn: (token: string) => void;
  onSignOut: () => void;
}

/**
 * Topbar account area, rebuilt from zero on the kit. Same contract as the
 * old chrome: POSTs the same sign-in endpoint, persists the same
 * localStorage keys, clears them on sign out.
 */
export function AccountMenu({ token, name, onSignedIn, onSignOut }: SpkAccountMenuProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/cloud/auth/spice/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as { token?: string; user?: unknown; error?: string } | null;
      if (!res.ok || !data?.token) throw new Error(data?.error ?? 'Sign-in failed.');
      try {
        window.localStorage.setItem('spice_cloud_token', data.token);
        if (data.user) window.localStorage.setItem('spice_cloud_user', JSON.stringify(data.user));
      } catch {
        /* private mode: state still works for this visit */
      }
      setEmail('');
      setPassword('');
      onSignedIn(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    try {
      window.localStorage.removeItem('spice_cloud_token');
      window.localStorage.removeItem('spice_cloud_user');
      window.localStorage.removeItem('spice_cloud_profile_id');
    } catch {
      /* storage unavailable; in-memory state still clears */
    }
    onSignOut();
  }

  if (!token) {
    return (
      <>
        <style>{`
          .spk-signin { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
            font-family: var(--spk-font, Inter, system-ui, sans-serif); }
          .spk-signin-input { background: var(--spk-bg, #000);
            border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); border-radius: var(--spk-radius-sm, 8px);
            color: var(--spk-text, #e8eaf0); font-size: 0.82rem; padding: 8px 11px; width: 150px; }
          .spk-signin-input::placeholder { color: var(--spk-text-3, #6b6f7d); }
          .spk-signin-input:focus { outline: none; border-color: var(--spk-accent, #fafafa); }
          .spk-signin-error { color: #e89893; font-size: 0.78rem; }
        `}</style>
        <form className="spk-signin" onSubmit={submit} aria-label="Sign in to sync your list">
          <input
            className="spk-signin-input"
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="spk-signin-input"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          {error && <span className="spk-signin-error">{error}</span>}
        </form>
      </>
    );
  }

  return (
    <>
      <style>{`
        .spk-account { display: flex; gap: 10px; align-items: center;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .spk-account-name { font-size: 0.83rem; font-weight: 600; color: var(--spk-text-2, #a3a7b5);
          max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
      <div className="spk-account">
        <span className="spk-account-name" title={name ?? 'Account'}>
          {name ?? 'Account'}
        </span>
        <Button size="sm" variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </>
  );
}
