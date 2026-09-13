'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, EmptyState, ErrorNote, PageHeader, Picker, TextField } from '@/components/ui';

const TOKEN_KEY = 'spice_cloud_token';
const LEGACY_TOKEN_KEY = 'spice_token';
const RUNTIME_TARGET = process.env.NEXT_PUBLIC_SPICE_RUNTIME_TARGET === 'vercel' ? 'vercel' : 'local';
const CLOUD_ORIGIN = (process.env.NEXT_PUBLIC_SPICE_CLOUD_API_ORIGIN || 'https://music.spice-app.xyz').replace(/\/+$/, '');

function cloudApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return RUNTIME_TARGET === 'local' ? `${CLOUD_ORIGIN}/api/cloud${normalized}` : `/api${normalized}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export interface AccountSnapshot {
  email: string;
  username: string | null;
  displayName: string | null;
}

function snapshotOf(payload: Record<string, unknown>): AccountSnapshot | null {
  const session = (payload.session && typeof payload.session === 'object' ? payload.session : null) as Record<string, unknown> | null;
  const user = (payload.user && typeof payload.user === 'object' ? payload.user : null) as Record<string, unknown> | null;
  const email = readString(payload.email) || readString(session?.email) || readString(user?.email);
  if (!email) return null;
  return {
    email,
    username: readString(payload.username) || readString(user?.username) || null,
    displayName: readString(payload.displayName) || readString(user?.displayName) || null,
  };
}

function tokenOf(payload: Record<string, unknown>): string {
  return readString(payload.token) || readString(payload.sessionToken) || readString(payload.accessToken);
}

/**
 * Full account management: sign in, sign up (with email verification),
 * username, sign out. Same endpoints, token keys, and session snapshot
 * as the original account panel — new presentation.
 */
export function useAccount() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [username, setUsername] = useState('');
  const [ready] = useState(true);

  const clearSession = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      /* private mode */
    }
    setToken(null);
    setAccount(null);
    setUsername('');
  }, []);

  const loadUsername = useCallback(async (savedToken: string) => {
    try {
      const res = await fetch(cloudApiUrl('/account/username'), {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      const payload = await readJson(res);
      if (res.ok && typeof payload.username === 'string') setUsername(payload.username);
    } catch {
      /* username is optional; account stands without it */
    }
  }, []);

  const loadAccount = useCallback(
    async (savedToken: string) => {
      try {
        const res = await fetch(cloudApiUrl('/account/me'), {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        const payload = await readJson(res);
        if (!res.ok) {
          if (res.status === 401) clearSession();
          return;
        }
        const snapshot = snapshotOf(payload);
        if (snapshot) setAccount(snapshot);
        void loadUsername(savedToken);
      } catch {
        /* offline: keep the stored token, account refreshes later */
      }
    },
    [clearSession, loadUsername],
  );

  const bootedRef = useRef(false);

  useEffect(() => {
    // One boot load; later token changes load explicitly via actions.
    if (bootedRef.current) return;
    bootedRef.current = true;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled && token) await loadAccount(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadAccount]);

  const persist = (nextToken: string) => {
    try {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      window.localStorage.setItem(LEGACY_TOKEN_KEY, nextToken);
    } catch {
      /* private mode: session lasts the visit */
    }
    setToken(nextToken);
    void loadAccount(nextToken);
  };

  return { token, account, username, setUsername, ready, persist, clearSession, loadAccount };
}

export type AccountHook = ReturnType<typeof useAccount>;

export function AccountView({ hook }: { hook: AccountHook }) {
  const { token, account, username, setUsername, ready, persist, clearSession } = hook;
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [verification, setVerification] = useState<{ registrationId: string; email: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState(username);
  const [seenUsername, setSeenUsername] = useState(username);

  // Derived state: a freshly loaded username resets the draft.
  if (username !== seenUsername) {
    setSeenUsername(username);
    setUsernameDraft(username);
  }

  if (!ready) return <EmptyState message="Loading account…" />;

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(cloudApiUrl(`/auth/spice/${mode === 'signin' ? 'signin' : 'signup'}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(mode === 'register' ? { username: newUsername } : {}) }),
      });
      const payload = await readJson(res);
      const registrationId = readString(payload.registrationId);
      if (res.ok && payload.verificationRequired === true && registrationId) {
        setVerification({ registrationId, email: readString(payload.email) || email });
        setPassword('');
        setCode('');
        setNotice(`We sent a six-digit code to ${readString(payload.email) || email}.`);
        return;
      }
      const nextToken = tokenOf(payload);
      if (!res.ok || !nextToken) throw new Error(readString(payload.message) || readString(payload.error) || 'Authentication failed.');
      setPassword('');
      persist(nextToken);
      setNotice(mode === 'signin' ? 'Signed in.' : 'Account created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verification) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(cloudApiUrl('/auth/spice/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: verification.registrationId, code }),
      });
      const payload = await readJson(res);
      const nextToken = tokenOf(payload);
      if (!res.ok || !nextToken) throw new Error(readString(payload.message) || 'Verification failed.');
      setVerification(null);
      setCode('');
      persist(nextToken);
      setNotice('Email verified — welcome.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!verification) return;
    setBusy(true);
    try {
      await fetch(cloudApiUrl('/auth/spice/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: verification.registrationId }),
      });
      setNotice('A new code is on its way.');
    } catch {
      setError('Could not resend the code.');
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(cloudApiUrl('/account/username'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: usernameDraft.trim() }),
      });
      const payload = await readJson(res);
      if (!res.ok) throw new Error(readString(payload.message) || 'Could not save username.');
      setUsername(usernameDraft.trim());
      setNotice('Username updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save username.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Card title={verification ? 'Check your inbox' : mode === 'signin' ? 'Sign in' : 'Create account'}>
        {verification ? (
          <form onSubmit={submitVerification} style={{ display: 'grid', gap: 12 }}>
            <TextField label="Verification code" placeholder="Six digits" value={code} onChange={(e) => setCode(e.target.value)} />
            {notice && <EmptyState message={notice} />}
            {error && <ErrorNote message={error} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" disabled={busy || !code.trim()}>
                {busy ? 'Verifying…' : 'Verify email'}
              </Button>
              <Button variant="ghost" onClick={() => void resendCode()} disabled={busy}>
                Resend code
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitAuth} style={{ display: 'grid', gap: 12 }}>
            <Picker
              label="Mode"
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'register', label: 'Create account' },
              ]}
              value={mode}
              onChange={(value) => setMode(value as 'signin' | 'register')}
            />
            <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode === 'register' && (
              <TextField label="Username" autoComplete="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            )}
            <TextField label="Password" type="password" required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {notice && <EmptyState message={notice} />}
            {error && <ErrorNote message={error} />}
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating…') : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card title={account?.displayName ?? account?.email ?? 'Account'} extra={account?.email}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <TextField label="Username" value={usernameDraft} onChange={(e) => setUsernameDraft(e.target.value)} />
          </div>
          <Button onClick={() => void saveUsername()} disabled={busy || !usernameDraft.trim() || usernameDraft === username}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={clearSession}>
            Sign out
          </Button>
        </div>
        {notice && <EmptyState message={notice} />}
        {error && <ErrorNote message={error} />}
      </div>
    </Card>
  );
}

export function AccountHeader() {
  return <PageHeader kicker="SPICE ACCOUNT" title="Profile" lede="Identity, music profiles, and your synced library at a glance." />;
}
