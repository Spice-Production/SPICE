'use client';

/* eslint-disable @next/next/no-img-element -- TMDB poster URLs are not configured for next/image. */

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, loadPreferredProvider, savePreferredProvider, streamProviders } from '@/lib/movie-provider';

import {
  fetchAccountProfile,
  formatReleaseDate,
  isFreshRelease,
  watchPageHref,
  type AccountProfile,
  type WatchState,
} from '../../watch-client';
import { ScrollContainerContext } from '../context';
import { Icon, SpiceMark, type IconName } from '../icons';
import { useSpiceUiV2 } from '../preference-client';
import { Alert, Avatar, Button, Field, IconButton, Input, Popover, Select, Separator, cn, useIsMobile } from '../primitives';
import { clearSpiceSession, readAccountEmail, signInToSpice } from './session';
import s from './watch.module.css';

const MUSIC_HOME = 'https://music.spice-app.xyz/';

export interface WatchSessionProps {
  token: string | null;
  watchState?: WatchState | null;
  onSignedIn: (token: string) => void;
  onSignOut: () => void;
}

export interface WatchSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  placeholder: string;
}

const NAV: { id: 'movies' | 'shows'; label: string; href: string; icon: IconName }[] = [
  { id: 'movies', label: 'Movies', href: '/movie', icon: 'film' },
  { id: 'shows', label: 'TV Series', href: '/shows', icon: 'tv' },
];

/** Spice Movies frame in the new interface: sidebar, topbar, content panel. */
export function WatchShell({
  active,
  session,
  search,
  back,
  children,
}: {
  active: 'movies' | 'shows';
  session: WatchSessionProps;
  search?: WatchSearchProps;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className={s.shell}>
      {!isMobile ? (
        <aside className={s.sidebar} aria-label="Spice Movies">
          <Link href="/movie" className={s.brand}>
            <SpiceMark size={26} />
            <span className={s.brandText}>SPICE</span>
            <span className={s.brandTag}>Movies</span>
          </Link>
          <nav className={s.nav} aria-label="Browse">
            {NAV.map((item) => (
              <Link key={item.id} href={item.href} className={s.navItem} aria-current={item.id === active ? 'page' : undefined}>
                <Icon name={item.icon} size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={s.sidebarFoot}>
            <a href={MUSIC_HOME} className={s.navItem}>
              <Icon name="music" size={16} />
              SPICE Music
            </a>
          </div>
        </aside>
      ) : null}

      <div className={s.main}>
        <header className={s.topbar}>
          {back ? (
            <Link href={back.href} className={s.back} aria-label={`Back to ${back.label}`}>
              <Icon name="arrowLeft" size={16} />
              <span className={s.backLabel}>{back.label}</span>
            </Link>
          ) : null}
          {search ? <TopbarSearch search={search} /> : <span className={s.topbarSpacer} />}
          <div className={s.topbarActions}>
            {session.token ? <ReleaseBell watchState={session.watchState ?? null} /> : null}
            <ProfileMenu session={session} />
          </div>
        </header>
        <ScrollContainerContext.Provider value={mainRef}>
          <main ref={mainRef} className={s.content}>
            {children}
          </main>
        </ScrollContainerContext.Provider>
      </div>

      {isMobile ? (
        <nav className={s.mobileNav} aria-label="Browse">
          {NAV.map((item) => (
            <Link key={item.id} href={item.href} className={s.mobileNavItem} aria-current={item.id === active ? 'page' : undefined}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
          <a href={MUSIC_HOME} className={s.mobileNavItem}>
            <Icon name="music" size={20} />
            <span>Music</span>
          </a>
        </nav>
      ) : null}
    </div>
  );
}

function TopbarSearch({ search }: { search: WatchSearchProps }) {
  return (
    <form
      className={s.search}
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        search.onSubmit();
      }}
    >
      <Input
        icon="search"
        value={search.query}
        onChange={(event) => search.onQueryChange(event.target.value)}
        placeholder={search.placeholder}
        aria-label={search.placeholder.replace('…', '')}
        trailing={
          search.loading ? (
            <Icon name="loader" size={14} className={s.spin} />
          ) : search.query ? (
            <IconButton icon="x" label="Clear search" size="xs" onClick={() => search.onQueryChange('')} />
          ) : null
        }
      />
    </form>
  );
}

/**
 * Titles on your list that came out in the last 30 days and aren't filed as
 * done, derived from the synced state (same rule as the classic bell).
 */
function ReleaseBell({ watchState }: { watchState: WatchState | null }) {
  const fresh = (watchState?.watchlist ?? []).filter((entry) => isFreshRelease(entry));
  return (
    <Popover
      align="end"
      width={320}
      label="New releases from your list"
      trigger={(props) => (
        <IconButton
          {...props}
          icon="bell"
          label={fresh.length > 0 ? `${fresh.length} new releases from your list` : 'No new releases from your list'}
          badge={fresh.length > 0 ? (fresh.length > 9 ? '9+' : fresh.length) : undefined}
        />
      )}
    >
      <div className={s.menuPanel}>
        <p className={s.menuEyebrow}>Out now · from your list</p>
        {fresh.length === 0 ? (
          <p className={s.menuMuted}>All caught up — nothing on your list dropped recently.</p>
        ) : (
          <div className={s.releaseList}>
            {fresh.map((entry) => (
              <a key={`${entry.kind}:${entry.tmdbId}`} href={watchPageHref(entry)} className={s.releaseItem}>
                {entry.posterUrl ? <img src={entry.posterUrl} alt="" className={s.releasePoster} /> : <span className={s.releasePoster} />}
                <span className={s.releaseText}>
                  <span className={s.releaseTitle}>{entry.title}</span>
                  <span className={s.releaseDate}>{formatReleaseDate(entry.releaseDate) ?? 'Recently released'}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}

function ProfileMenu({ session }: { session: WatchSessionProps }) {
  const { token, onSignedIn, onSignOut } = session;
  const ui = useSpiceUiV2();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [source, setSource] = useState(() => loadPreferredProvider(DEFAULT_STREAM_PROVIDER_ID));
  const email = token ? readAccountEmail() : null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchAccountProfile(token)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => {
        /* avatar is decorative: the initial covers failures */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const shownProfile = token ? profile : null;
  const displayName = shownProfile?.displayName ?? shownProfile?.username ?? null;
  const name = displayName ?? email ?? 'SPICE';

  return (
    <Popover
      align="end"
      width={300}
      label={token ? 'Account' : 'Sign in'}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className={s.avatarButton}
          aria-label={token ? `Account${displayName ? ` (${displayName})` : ''}` : 'Sign in'}
          title={token ? (displayName ?? email ?? 'Account') : 'Sign in'}
        >
          {token ? (
            <Avatar key={shownProfile?.avatarUrl ?? 'none'} src={shownProfile?.avatarUrl} name={name} size={32} gradient="var(--sx-accent-gradient)" />
          ) : (
            <span className={s.avatarEmpty}>
              <Icon name="user" size={16} />
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className={s.menuPanel}>
          {!token ? (
            <>
              <p className={s.menuMuted}>Sign in with your SPICE account to sync your list everywhere.</p>
              <WatchSignInForm
                onSignedIn={(next) => {
                  close();
                  onSignedIn(next);
                }}
              />
            </>
          ) : (
            <>
              <div className={s.identity}>
                <Avatar key={shownProfile?.avatarUrl ?? 'none'} src={shownProfile?.avatarUrl} name={name} size={40} gradient="var(--sx-accent-gradient)" />
                <div className={s.identityText}>
                  <span className={s.identityName}>{displayName ?? 'SPICE account'}</span>
                  {email && displayName ? <span className={s.identityEmail}>{email}</span> : null}
                </div>
              </div>
              <Field label="Default source" htmlFor="watch-default-source">
                <Select
                  id="watch-default-source"
                  size="sm"
                  value={source}
                  options={streamProviders().map((provider) => ({ value: provider.id, label: provider.label }))}
                  onChange={(id) => {
                    savePreferredProvider(id);
                    setSource(id);
                  }}
                />
              </Field>
              <a href={MUSIC_HOME} className={s.menuLink}>
                <Icon name="music" size={15} />
                Open SPICE Music
              </a>
            </>
          )}
          <Separator />
          <button
            type="button"
            className={s.menuLink}
            onClick={() => {
              close();
              ui.setEnabled(false);
            }}
          >
            <Icon name="sparkles" size={15} />
            Switch to classic interface
          </button>
          {token ? (
            <Button
              variant="outline"
              size="sm"
              icon="logOut"
              onClick={() => {
                clearSpiceSession();
                close();
                onSignOut();
              }}
            >
              Sign out
            </Button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

export function WatchSignInForm({ onSignedIn, compact }: { onSignedIn: (token: string) => void; compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signInToSpice(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn(s.signIn, compact && s.signInCompact)} aria-label="Sign in to sync your list">
      <Input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} size="sm" aria-label="Email" />
      <Input
        type="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        size="sm"
        aria-label="Password"
      />
      <Button type="submit" size="sm" loading={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {error ? (
        <Alert variant="danger" className={s.signInError}>
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
