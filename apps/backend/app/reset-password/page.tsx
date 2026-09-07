'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function ResetForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = params.get('token') ?? '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/spice/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not reset the password.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', margin: '10px 0 12px' }}>Password updated.</h1>
        <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Sign in with the new password to get back to your music.</p>
        <Link href="/" style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))', borderRadius: '12px', color: '#fff', padding: '12px 24px', fontWeight: 700, textDecoration: 'none' }}>
          Back to Spice
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {!token && (
        <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af', margin: 0 }}>
          This page needs a reset link — request one from the sign-in screen first.
        </p>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          style={fieldStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
        New password
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="new-password"
          style={fieldStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
        Confirm new password
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          required
          autoComplete="new-password"
          style={fieldStyle}
        />
      </label>
      <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
        At least 8 characters, with upper and lower case, a number, and a special character.
      </p>
      {error && (
        <p style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: '12px', padding: '12px 16px', color: '#fda4af', margin: 0 }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !token}
        style={{
          background: 'var(--accent-gradient, linear-gradient(135deg, #7c3aed, #a855f7))',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          padding: '12px 24px',
          fontSize: '1rem',
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading || !token ? 0.6 : 1,
        }}
      >
        {loading ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  );
}

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '12px',
  color: '#f1f5f9',
  padding: '12px 16px',
  fontSize: '1rem',
  outline: 'none',
};

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050509',
        color: '#f1f5f9',
        fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 24px',
      }}
    >
      <div style={{ width: 'min(440px, 100%)' }}>
        <p style={{ color: 'var(--accent-pink, #c084fc)', fontSize: '0.78rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>
          SPICE ACCOUNT
        </p>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', margin: '10px 0 20px' }}>Choose a new password.</h1>
        <Suspense fallback={<p style={{ color: '#94a3b8' }}>Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
