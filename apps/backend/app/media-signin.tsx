'use client';

import { useState } from 'react';

/** Compact sign-in for the browse pages (movies, shows, later anime). */
export default function MediaSignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
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
      onSignedIn(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
      aria-label="Sign in to sync your list"
    >
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={fieldStyle}
      />
      <input
        type="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={fieldStyle}
      />
      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <span style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</span>}
    </form>
  );
}

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '10px',
  color: '#e2e8f0',
  fontSize: '0.85rem',
  padding: '0.45rem 0.7rem',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  background: '#7c3aed',
  border: '1px solid #7c3aed',
  borderRadius: '10px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
  padding: '0.45rem 0.9rem',
};
