'use client';

import { useId, useState } from 'react';

import { useSpiceUi } from '../../context';
import { Icon, type IconName } from '../../icons';
import { Alert, Button, Field, IconButton, Input, Tabs } from '../../primitives';
import s from '../account.module.css';
import { digitsOnly, sanitizeUsername } from './shared';

type AuthMode = 'login' | 'register';

const AUTH_TABS = [
  { value: 'login' as const, label: 'Sign in' },
  { value: 'register' as const, label: 'Create account' },
];

const BENEFITS: ReadonlyArray<{ icon: IconName; title: string; text: string }> = [
  { icon: 'listMusic', title: 'Playlists', text: 'Your custom playlists follow you to every device.' },
  { icon: 'heart', title: 'Liked songs', text: 'Likes stay in sync wherever you listen.' },
  { icon: 'history', title: 'Listening history', text: 'History merges into a secure backend database.' },
];

/** Signed-out state: sign in, create an account, verify email, or reset a password. */
export function AuthPanel() {
  const m = useSpiceUi();
  const showVerification = Boolean(m.emailVerification);
  const showForgot = !showVerification && m.authMode === 'login' && m.authForgotMode;

  return (
    <div className={s.authLayout}>
      {/* The form comes first in reading order: left on wide screens, on top on narrow ones. */}
      <div className={s.authCard}>
        {m.dbError ? (
          <Alert variant="warning" title="Database configuration pending" className={s.authNotice}>
            Configure the backend cloud database connection and run migrations to unlock cloud accounts on your machine.
          </Alert>
        ) : null}
        {showVerification ? <VerificationForm /> : showForgot ? <ForgotPasswordForm /> : <SignInForm />}
      </div>
      <div className={s.authIntro}>
        <p className={s.authLead}>
          Connect your SPICE account to synchronize your custom playlists, liked tracks, and listening history with a secure backend
          database.
        </p>
        <ul className={s.benefits}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className={s.benefit}>
              <span className={s.benefitIcon}>
                <Icon name={benefit.icon} size={16} />
              </span>
              <span className={s.benefitText}>
                <span className={s.benefitTitle}>{benefit.title}</span>
                <span className={s.benefitDescription}>{benefit.text}</span>
              </span>
            </li>
          ))}
        </ul>
        {!m.dbError ? (
          <Alert variant="info" icon="database" title="Cloud account service">
            New registrations require the six-digit code delivered to the account email before sync and account features are enabled.
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function AuthError() {
  const m = useSpiceUi();
  if (!m.authError) return null;
  return <Alert variant="danger">{m.authError}</Alert>;
}

function SignInForm() {
  const m = useSpiceUi();
  const emailId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isLogin = m.authMode === 'login';

  const changeMode = (mode: AuthMode) => {
    if (mode === m.authMode) return;
    m.setAuthMode(mode);
    m.setAuthError(null);
    m.setEmailVerification(null);
  };

  return (
    <form className={s.authForm} onSubmit={m.handleAuthSubmit}>
      <Tabs label="Account access" items={AUTH_TABS} value={m.authMode} onValueChange={changeMode} fullWidth />
      <div className={s.authHeading}>
        <h3 className={s.authTitle}>{isLogin ? 'Welcome back' : 'Create your SPICE account'}</h3>
        <p className={s.authSubtitle}>
          {isLogin ? 'Sign in to sync this profile with your account.' : 'Pick a username. We will email you a code to confirm.'}
        </p>
      </div>

      <AuthError />

      <Field label="Email" htmlFor={emailId}>
        <Input
          id={emailId}
          type="email"
          placeholder="Email address"
          value={m.authEmail}
          onChange={(event) => m.setAuthEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      {!isLogin ? (
        <Field label="Spicer username" htmlFor={usernameId} description="3-20 characters: letters, numbers, and underscores.">
          <Input
            id={usernameId}
            type="text"
            icon="atSign"
            placeholder="sound_lover"
            value={m.authUsername}
            onChange={(event) => m.setAuthUsername(sanitizeUsername(event.target.value))}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
      ) : null}

      <div className={s.fieldStack}>
        <div className={s.labelRow}>
          <label htmlFor={passwordId} className={s.fieldLabel}>
            Password
          </label>
          {isLogin ? (
            <button
              type="button"
              className={s.inlineLink}
              onClick={() => {
                m.setAuthForgotMode(true);
                m.setAuthForgotSent(false);
                m.setAuthError(null);
              }}
            >
              Forgot password?
            </button>
          ) : null}
        </div>
        <Input
          id={passwordId}
          type={showPassword ? 'text' : 'password'}
          placeholder="Password (min 6 chars)"
          value={m.authPassword}
          onChange={(event) => m.setAuthPassword(event.target.value)}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          required
          trailing={
            <IconButton
              icon={showPassword ? 'eyeOff' : 'eye'}
              label={showPassword ? 'Hide password' : 'Show password'}
              size="xs"
              className={s.trailingButton}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            />
          }
        />
      </div>

      <Button type="submit" block loading={m.authLoading}>
        {m.authLoading ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
      </Button>

      <p className={s.authSwitch}>
        {isLogin ? 'New to SPICE?' : 'Already have an account?'}{' '}
        <button type="button" className={s.inlineLink} onClick={() => changeMode(isLogin ? 'register' : 'login')}>
          {isLogin ? 'Create an account' : 'Sign in instead'}
        </button>
      </p>
    </form>
  );
}

function VerificationForm() {
  const m = useSpiceUi();
  const codeId = useId();
  const verification = m.emailVerification;
  if (!verification) return null;

  return (
    <form className={s.authForm} onSubmit={m.handleEmailVerificationSubmit}>
      <div className={s.authHeading}>
        <span className={s.authBadgeIcon}>
          <Icon name="mail" size={18} />
        </span>
        <h3 className={s.authTitle}>Check your email</h3>
        <p className={s.authSubtitle}>
          We sent a six-digit code to <strong className={s.strong}>{verification.email}</strong>. The code expires after 10 minutes.
        </p>
      </div>

      <AuthError />

      <Field label="Verification code" htmlFor={codeId}>
        <Input
          id={codeId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          aria-label="Six-digit email verification code"
          placeholder="000000"
          value={m.emailVerificationCode}
          onChange={(event) => m.setEmailVerificationCode(digitsOnly(event.target.value, 6))}
          className={s.codeInput}
          size="lg"
          autoFocus
          required
        />
      </Field>

      <Button type="submit" block loading={m.authLoading} disabled={m.emailVerificationCode.length !== 6}>
        {m.authLoading ? 'Please wait...' : 'Verify and sign in'}
      </Button>
      <div className={s.authSecondary}>
        <Button variant="outline" block disabled={m.authLoading} icon="refresh" onClick={() => void m.resendEmailVerification()}>
          Resend code
        </Button>
        <Button
          variant="ghost"
          block
          disabled={m.authLoading}
          onClick={() => {
            m.setEmailVerification(null);
            m.setEmailVerificationCode('');
            m.setAuthError(null);
          }}
        >
          Start registration again
        </Button>
      </div>
    </form>
  );
}

function ForgotPasswordForm() {
  const m = useSpiceUi();
  const emailId = useId();
  const back = () => {
    m.setAuthForgotMode(false);
    m.setAuthForgotSent(false);
    m.setAuthError(null);
  };

  return (
    <form className={s.authForm} onSubmit={m.handleForgotSubmit}>
      <div className={s.authHeading}>
        <span className={s.authBadgeIcon}>
          <Icon name={m.authForgotSent ? 'mail' : 'key'} size={18} />
        </span>
        <h3 className={s.authTitle}>{m.authForgotSent ? 'Check your inbox' : 'Reset your password'}</h3>
        <p className={s.authSubtitle} role={m.authForgotSent ? 'status' : undefined}>
          {m.authForgotSent
            ? 'If that address has an account, a reset link is on its way. Check your inbox.'
            : 'Enter your account email and we will send a reset link.'}
        </p>
      </div>

      <AuthError />

      {!m.authForgotSent ? (
        <>
          <Field label="Email" htmlFor={emailId}>
            <Input
              id={emailId}
              type="email"
              placeholder="Email address"
              value={m.authEmail}
              onChange={(event) => m.setAuthEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </Field>
          <Button type="submit" block loading={m.authLoading}>
            {m.authLoading ? 'Please wait...' : 'Send reset link'}
          </Button>
        </>
      ) : null}

      <Button variant={m.authForgotSent ? 'outline' : 'ghost'} block icon="arrowLeft" onClick={back}>
        Back to sign in
      </Button>
    </form>
  );
}
