'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button, Card, ErrorNote, PageHeader, TextField } from '@/components/ui';

function V2ResetForm() {
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
      <Card title="Password updated.">
        <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--spk-text-2, #a3a7b5)' }}>
          Sign in with the new password to get back to your music.
        </p>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Button variant="primary">Back to Spice</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Choose a new password.">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {!token && <ErrorNote message="This page needs a reset link — request one from the sign-in screen first." />}
        <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="New password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label="Confirm new password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--spk-text-3, #6b6f7d)' }}>
          At least 8 characters, with upper and lower case, a number, and a special character.
        </p>
        {error && <ErrorNote message={error} />}
        <div>
          <Button type="submit" variant="primary" disabled={loading || !token}>
            {loading ? 'Updating…' : 'Set new password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * /v2/reset-password — same reset contract (email + token + newPassword
 * to the same endpoint, mismatch guard, tokenless disabled state) in the
 * quiet kit language.
 */
export default function V2ResetPasswordPage() {
  return (
    <>
      <style>{`
        .v2-reset { min-height: 100vh; background: var(--spk-bg, #000); color: var(--spk-text, #e8eaf0);
          font-family: var(--spk-font, Inter, system-ui, sans-serif);
          display: grid; place-items: center; padding: 32px 24px; box-sizing: border-box; }
        .v2-reset-inner { width: min(440px, 100%); display: grid; gap: 18px; }
      `}</style>
      <div className="v2-reset">
        <div className="v2-reset-inner">
          <PageHeader kicker="SPICE ACCOUNT" title="Reset password" />
          <Suspense fallback={<p style={{ color: 'var(--spk-text-3, #6b6f7d)' }}>Loading…</p>}>
            <V2ResetForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
