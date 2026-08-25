'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import styles from './cloud-portal.module.css';

type AuthMode = 'signin' | 'register';

interface AccountSubscription {
  tier: string;
  status: string;
  provider: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
}

interface AccountSnapshot {
  id: string;
  email: string;
  emailVerified?: boolean;
  accountRole: string;
  isAdmin: boolean;
  subscription: AccountSubscription;
}

interface VerificationChallenge {
  registrationId: string;
  email: string;
}

interface CloudAccountPanelProps {
  localRuntimeUrl: string;
}

const TOKEN_KEY = 'spice_cloud_token';
const LEGACY_TOKEN_KEY = 'spice_token';
const SPICE_RUNTIME_TARGET = process.env.NEXT_PUBLIC_SPICE_RUNTIME_TARGET === 'vercel' ? 'vercel' : 'local';
const SPICE_CLOUD_API_ORIGIN = normalizeApiOrigin(process.env.NEXT_PUBLIC_SPICE_CLOUD_API_ORIGIN || 'https://music.spice-app.xyz');

export default function CloudAccountPanel({ localRuntimeUrl }: CloudAccountPanelProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [verification, setVerification] = useState<VerificationChallenge | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [message, setMessage] = useState('Sign in or create an account to manage sync, profile links, and cloud-only account settings.');

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    setToken(null);
    setAccount(null);
    setUsername('');
    setUsernameDraft('');
  }, []);

  const loadUsername = useCallback(async (savedToken: string) => {
    try {
      const response = await fetch(cloudApiUrl('/account/username'), {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      const payload = await readJson(response);
      if (response.ok && typeof payload.username === 'string') {
        setUsername(payload.username);
        setUsernameDraft(payload.username);
      }
    } catch {
      // Username is optional on this hosted summary; keep account loading independent.
    }
  }, []);

  const loadAccount = useCallback(async (savedToken: string, fallbackAccount: AccountSnapshot | null = null) => {
    setLoading(true);
    try {
      const response = await fetch(cloudApiUrl('/account/me'), {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      const payload = await readJson(response);

      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          setMessage('Your saved session expired. Sign in again to manage this account.');
          return;
        }
        setMessage(friendlyAccountError(payload));
        return;
      }

      const nextAccount = normalizeAccountSnapshot(payload);
      if (!nextAccount) {
        if (fallbackAccount) {
          localStorage.setItem(TOKEN_KEY, savedToken);
          setAccount(fallbackAccount);
          setToken(savedToken);
          setMessage('Cloud account connected. Account details will refresh on the next check.');
          void loadUsername(savedToken);
          return;
        }
        setMessage('Cloud account connected, but the account snapshot was empty. Sign out and try again if this repeats.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, savedToken);
      setAccount(nextAccount);
      setToken(savedToken);
      setMessage('Cloud account connected.');
      void loadUsername(savedToken);
    } catch {
      setMessage('Cloud account service is currently unavailable.');
    } finally {
      setLoading(false);
    }
  }, [clearSession, loadUsername]);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    if (!savedToken) return;

    const timeoutId = window.setTimeout(() => {
      void loadAccount(savedToken);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAccount]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(mode === 'signin' ? 'Signing in...' : 'Creating account...');

    try {
      const response = await fetch(cloudApiUrl(`/auth/spice/${mode === 'signin' ? 'signin' : 'signup'}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { username } : {}),
        }),
      });
      const payload = await readJson(response);

      const registrationId = readString(payload.registrationId);
      if (response.ok && payload.verificationRequired === true && registrationId) {
        setVerification({
          registrationId,
          email: readString(payload.email) || email,
        });
        setPassword('');
        setVerificationCode('');
        setMessage(`We sent a six-digit verification code to ${readString(payload.email) || email}.`);
        return;
      }

      const nextToken = readString(payload.token) || readString(payload.sessionToken) || readString(payload.accessToken);

      if (!response.ok || !nextToken) {
        setMessage(friendlyAccountError(payload));
        return;
      }

      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(LEGACY_TOKEN_KEY, nextToken);
      setPassword('');
      setToken(nextToken);
      const nextAccount = normalizeAccountSnapshot(payload);
      if (nextAccount) {
        setAccount(nextAccount);
      }
      await loadAccount(nextToken, nextAccount);
    } catch {
      setMessage('Cloud account service is currently unavailable.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification) return;
    setSubmitting(true);
    setMessage('Verifying your email...');
    try {
      const response = await fetch(cloudApiUrl('/auth/spice/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: verification.registrationId, code: verificationCode }),
      });
      const payload = await readJson(response);
      const nextToken = readString(payload.token) || readString(payload.sessionToken) || readString(payload.accessToken);
      if (!response.ok || !nextToken) {
        setMessage(friendlyAccountError(payload));
        return;
      }

      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(LEGACY_TOKEN_KEY, nextToken);
      setVerification(null);
      setVerificationCode('');
      setToken(nextToken);
      const nextAccount = normalizeAccountSnapshot(payload);
      if (nextAccount) setAccount(nextAccount);
      await loadAccount(nextToken, nextAccount);
    } catch {
      setMessage('Cloud account service is currently unavailable.');
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    if (!verification) return;
    setSubmitting(true);
    setMessage('Sending a new code...');
    try {
      const response = await fetch(cloudApiUrl('/auth/spice/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: verification.registrationId }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        setMessage(friendlyAccountError(payload));
        return;
      }
      setVerificationCode('');
      setMessage(`A new code was sent to ${readString(payload.email) || verification.email}.`);
    } catch {
      setMessage('Cloud account service is currently unavailable.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUsernameSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSavingUsername(true);
    setMessage('Saving username...');

    try {
      const response = await fetch(cloudApiUrl('/account/username'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: usernameDraft, profileId: 'default' }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setMessage(friendlyAccountError(payload));
        return;
      }

      const nextUsername = typeof payload.username === 'string' ? payload.username : usernameDraft;
      setUsername(nextUsername);
      setUsernameDraft(nextUsername);
      setMessage('Username saved.');
    } catch {
      setMessage('Username could not be saved right now.');
    } finally {
      setSavingUsername(false);
    }
  }

  function signOut() {
    clearSession();
    setMessage('Signed out on this browser.');
  }

  if (loading) {
    return (
      <div className={styles.accountCard}>
        <p className={styles.statusNote}>{message}</p>
      </div>
    );
  }

  return (
    <div className={styles.accountCard}>
      {account ? (
        <div className={styles.accountGrid}>
          <section className={styles.accountSummary} aria-label="Cloud account summary">
            <span>Signed in</span>
            <h3>{account.email}</h3>
            <dl>
              <div>
                <dt>Role</dt>
                <dd>{account.accountRole}</dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd>{account.subscription?.tier || 'free'} / {account.subscription?.status || 'inactive'}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{username || 'Not set'}</dd>
              </div>
              <div>
                <dt>Account ID</dt>
                <dd>{account.id}</dd>
              </div>
            </dl>
            <div className={styles.accountActions}>
              <a href={`${localRuntimeUrl}/?page=account`}>Open local account page</a>
              <a href="/changelog">Open changelog</a>
              {account.isAdmin && <a href="/admin-dashboard">Open admin dashboard</a>}
              <button type="button" onClick={signOut}>Sign out</button>
            </div>
          </section>

          <form className={styles.accountForm} onSubmit={handleUsernameSave}>
            <span>Default profile</span>
            <h3>Update username</h3>
            <label>
              Username
              <input
                value={usernameDraft}
                onChange={(event) => setUsernameDraft(event.target.value)}
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_]+"
                placeholder="spice_user"
                required
              />
            </label>
            <button type="submit" disabled={savingUsername}>
              {savingUsername ? 'Saving...' : 'Save username'}
            </button>
            <p className={styles.statusNote}>{message}</p>
          </form>
        </div>
      ) : verification ? (
        <div className={styles.accountGrid}>
          <form className={styles.accountForm} onSubmit={handleVerificationSubmit}>
            <span>Email verification</span>
            <h3>Check {verification.email}</h3>
            <label>
              Six-digit code
              <input
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>
            <button type="submit" disabled={submitting || verificationCode.length !== 6}>
              {submitting ? 'Working...' : 'Verify and sign in'}
            </button>
            <div className={styles.accountActions}>
              <button type="button" disabled={submitting} onClick={() => void resendVerification()}>Resend code</button>
              <button type="button" disabled={submitting} onClick={() => { setVerification(null); setVerificationCode(''); setMessage('Enter your account details to try again.'); }}>Start again</button>
            </div>
            <p className={styles.statusNote}>{message}</p>
          </form>
          <section className={styles.accountSummary} aria-label="Email verification help">
            <span>Inbox ownership</span>
            <h3>Your account is not active yet.</h3>
            <p>The code expires after 10 minutes. Check spam or request another code after the cooldown.</p>
          </section>
        </div>
      ) : (
        <div className={styles.accountGrid}>
          <form className={styles.accountForm} onSubmit={handleAuthSubmit}>
            <div className={styles.modeSwitch} aria-label="Account form mode">
              <button type="button" className={mode === 'signin' ? styles.modeActive : ''} onClick={() => { setMode('signin'); setVerification(null); }}>
                Sign in
              </button>
              <button type="button" className={mode === 'register' ? styles.modeActive : ''} onClick={() => { setMode('register'); setVerification(null); }}>
                Register
              </button>
            </div>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
            </label>
            {mode === 'register' && (
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  minLength={3}
                  maxLength={20}
                  pattern="[A-Za-z0-9_]+"
                  autoComplete="username"
                  required
                />
              </label>
            )}
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <p className={styles.statusNote}>{message}</p>
          </form>

          <section className={styles.accountSummary} aria-label="Cloud account scope">
            <span>Cloud account scope</span>
            <h3>Accounts stay online. Media stays local.</h3>
            <p>
              Use this hosted tab for sign-in, username, subscription status, changelog access,
              and admin entry. Open the local runtime for playback and provider work.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({}));
}

function cloudApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (SPICE_RUNTIME_TARGET === 'local') {
    return `${SPICE_CLOUD_API_ORIGIN}/api/cloud${normalizedPath}`;
  }

  return `/api${normalizedPath}`;
}

function normalizeApiOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}

function normalizeAccountSnapshot(payload: Record<string, unknown>): AccountSnapshot | null {
  const nestedSession = isRecord(payload.session) ? payload.session : null;
  const candidates = [
    payload.account,
    payload.user,
    payload.accountSnapshot,
    isRecord(nestedSession?.account) ? nestedSession.account : null,
    isRecord(nestedSession?.user) ? nestedSession.user : null,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;

    const id = readString(candidate.id) || readString(candidate.userId);
    const email = readString(candidate.email);
    if (!id || !email) continue;

    const accountRole = readString(candidate.accountRole) || readString(candidate.role) || 'user';
    const subscription = normalizeSubscription(candidate.subscription);

    return {
      id,
      email,
      accountRole,
      isAdmin: typeof candidate.isAdmin === 'boolean' ? candidate.isAdmin : accountRole === 'admin',
      subscription,
    };
  }

  return null;
}

function normalizeSubscription(value: unknown): AccountSubscription {
  const subscription = isRecord(value) ? value : {};
  const status = readString(subscription.status) || 'inactive';
  const currentPeriodEnd = readString(subscription.currentPeriodEnd);

  return {
    tier: readString(subscription.tier) || 'free',
    status,
    provider: readString(subscription.provider),
    currentPeriodEnd,
    cancelAtPeriodEnd: typeof subscription.cancelAtPeriodEnd === 'boolean' ? subscription.cancelAtPeriodEnd : false,
    isActive: typeof subscription.isActive === 'boolean' ? subscription.isActive : status === 'active' || status === 'trialing',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function friendlyAccountError(payload: Record<string, unknown>) {
  const code = typeof payload.error === 'string' ? payload.error : '';
  if (code === 'invalid_credentials') return 'Incorrect email or password.';
  if (code === 'invalid_email') return 'Enter a valid email address.';
  if (code === 'email_exists') return 'An account already exists for that email.';
  if (code === 'username_taken') return 'That username is already taken.';
  if (code === 'weak_password') return 'Password needs at least 8 characters with uppercase, lowercase, number, and special character.';
  if (code === 'invalid_username') return 'Username must be 3-20 characters with letters, numbers, or underscores.';
  if (code === 'account_banned') return 'This account is not allowed to sign in.';
  if (code === 'account_timed_out') return typeof payload.message === 'string' ? payload.message : 'This account is temporarily timed out.';
  if (code === 'email_not_verified') return 'Verify this email before signing in.';
  if (code === 'invalid_verification_code') return typeof payload.message === 'string' ? payload.message : 'That code is incorrect.';
  if (code === 'verification_expired') return 'That code expired. Request a new one or start again.';
  if (code === 'verification_locked') return 'Too many incorrect attempts. Request a new code.';
  if (code === 'resend_too_soon' || code === 'verification_rate_limited' || code === 'verification_send_limit') {
    return typeof payload.message === 'string' ? payload.message : 'Please wait before requesting another code.';
  }
  if (code === 'email_delivery_failed') return 'The verification email could not be sent. Try again shortly.';
  if (code === 'database_not_configured') return 'Cloud account service is not ready yet.';
  if (code === 'unauthorized' || code === 'invalid_session') return 'Sign in again to manage this account.';
  return 'Cloud account request failed.';
}
