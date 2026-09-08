'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DEFAULT_STREAM_PROVIDER_ID, loadPreferredProvider, savePreferredProvider, streamProviders } from '@/lib/movie-provider';

import { FilmIcon, MusicIcon, TvIcon, UserIcon } from './media-icons';
import MediaSignIn from './media-signin';
import { fetchAccountProfile, type AccountProfile } from './watch-client';

const MUSIC_HOME = 'https://music.spice-app.xyz/';

/**
 * Shared frame for the browse surfaces (movies, shows, later anime): a
 * slim sidebar on desktop that collapses to a top strip on phones, a
 * topbar with the profile menu on the right, and the page below it.
 * The profile menu mirrors the music player's account box: sign-in when
 * signed out, email + default watch source + sign-out when signed in.
 */
export default function MediaChrome({
  active,
  section,
  token,
  onSignedIn,
  onSignOut,
  children,
}: {
  active: 'movies' | 'shows';
  section: string;
  token: string | null;
  onSignedIn: (token: string) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="media-shell">
      <style>{`
        .media-shell { display: flex; min-height: 100vh; background: #050509; color: var(--text-primary, #f1f5f9); font-family: var(--font-geist-sans), Inter, sans-serif; }
        .media-side { width: 232px; flex: none; border-right: 1px solid rgba(255,255,255,0.08); padding: 20px 14px; display: flex; flex-direction: column; gap: 6px; position: sticky; top: 0; height: 100vh; }
        .media-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .media-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: rgba(5,5,9,0.9); backdrop-filter: blur(12px); z-index: 30; }
        .media-navlink { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; text-decoration: none; color: #cbd5e1; font-weight: 600; font-size: 0.92rem; }
        .media-navlink:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .media-navlink[data-on="true"] { background: rgba(124,58,237,0.2); color: #fff; }
        @media (max-width: 900px) {
          .media-shell { flex-direction: column; }
          .media-side { width: auto; height: auto; position: static; flex-direction: row; align-items: center; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); padding: 10px 14px; overflow-x: auto; }
          .media-side .side-foot { display: none; }
          .media-top { position: static; }
        }
      `}</style>
      <aside className="media-side" aria-label="Browse">
        <Link href="/movie" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#fff', padding: '4px 12px 16px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spice-movies-icon.svg" alt="Spice Movies" width={30} height={30} style={{ borderRadius: '9px', display: 'block' }} />
          <span style={{ fontWeight: 800, letterSpacing: '0.02em' }}>SPICE</span>
        </Link>
        <Link className="media-navlink" data-on={active === 'movies'} href="/movie">
          <FilmIcon size={17} /> Movies
        </Link>
        <Link className="media-navlink" data-on={active === 'shows'} href="/shows">
          <TvIcon size={17} /> TV Series
        </Link>
        <div className="side-foot" style={{ marginTop: 'auto', display: 'grid', gap: '6px' }}>
          <a className="media-navlink" href={MUSIC_HOME} style={{ fontSize: '0.85rem' }}>
            <MusicIcon size={16} /> SPICE Music
          </a>
        </div>
      </aside>
      <div className="media-main">
        <header className="media-top">
          <span style={{ color: '#c084fc', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.1em' }}>{section}</span>
          <ProfileMenu token={token} onSignedIn={onSignedIn} onSignOut={onSignOut} />
        </header>
        {children}
      </div>
    </div>
  );
}

function readAccountEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('spice_cloud_user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { email?: unknown };
    return typeof user.email === 'string' ? user.email : null;
  } catch {
    return null;
  }
}

function ProfileMenu({
  token,
  onSignedIn,
  onSignOut,
}: {
  token: string | null;
  onSignedIn: (token: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(() => loadPreferredProvider(DEFAULT_STREAM_PROVIDER_ID));
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const email = token ? readAccountEmail() : null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchAccountProfile(token)
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => {
        /* avatar is decorative: the initial letter covers failures */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const displayName = profile?.displayName ?? profile?.username ?? null;
  const initial = ((displayName ?? email ?? 'S').trim().charAt(0).toUpperCase() || 'S');

  function signOut() {
    try {
      window.localStorage.removeItem('spice_cloud_token');
      window.localStorage.removeItem('spice_cloud_user');
      window.localStorage.removeItem('spice_cloud_profile_id');
    } catch {
      /* storage unavailable: state still clears */
    }
    setOpen(false);
    onSignOut();
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={token ? `Account${displayName ? ` (${displayName})` : ''}` : 'Sign in'}
        aria-expanded={open}
        title={token ? (displayName ?? email ?? 'Account') : 'Sign in'}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '999px',
          border: token ? '2px solid #7c3aed' : '1px solid rgba(255,255,255,0.25)',
          background: token && !profile?.avatarUrl ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontWeight: 800,
          fontSize: '1rem',
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
        }}
      >
        {token ? (
          profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" width={38} height={38} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            initial
          )
        ) : (
          <UserIcon size={19} />
        )}
      </button>
      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 10px)',
              width: '290px',
              background: '#121218',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '14px',
              boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
              padding: '14px',
              zIndex: 41,
              display: 'grid',
              gap: '10px',
            }}
          >
            {!token ? (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
                  Sign in with your SPICE account to sync your list everywhere.
                </p>
                <MediaSignIn
                  onSignedIn={(next) => {
                    setOpen(false);
                    onSignedIn(next);
                  }}
                />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" width={40} height={40} style={{ width: '40px', height: '40px', borderRadius: '999px', objectFit: 'cover', flex: 'none' }} />
                  ) : (
                    <span style={{ width: '40px', height: '40px', borderRadius: '999px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', display: 'grid', placeItems: 'center', fontWeight: 800, flex: 'none' }}>
                      {initial}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName ?? 'SPICE account'}
                    </p>
                    {email && displayName && (
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Default source</span>
                  <SourcePicker current={source} onPick={(id) => setSource(id)} />
                </div>
                <a href={MUSIC_HOME} style={{ color: '#c084fc', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MusicIcon size={15} /> Open SPICE Music
                </a>
                <button
                  type="button"
                  onClick={signOut}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '10px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    padding: '8px 10px',
                    textAlign: 'left',
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Default-source picker as real buttons instead of a native select element.
 * Native option popups ignore the dark theme (white box, washed-out rows),
 * so this renders the same list inside the themed menu.
 */
function SourcePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const providers = streamProviders();
  const active = providers.find((provider) => provider.id === current) ?? providers[0];

  function pick(id: string) {
    savePreferredProvider(id);
    onPick(id);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Default source: ${active?.label ?? current}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '10px',
          color: '#e2e8f0',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          padding: '8px 10px',
        }}
      >
        <span>{active?.label ?? current}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div aria-hidden onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 42, background: 'transparent' }} />
          <div
            role="listbox"
            aria-label="Default source"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 'calc(100% + 6px)',
              background: '#1b1b24',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '10px',
              boxShadow: '0 14px 36px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              zIndex: 43,
              padding: '4px',
              display: 'grid',
              gap: '2px',
            }}
          >
            {providers.map((provider) => {
              const selected = provider.id === active?.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(provider.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    background: selected ? 'rgba(124,58,237,0.28)' : 'transparent',
                    border: 'none',
                    borderRadius: '7px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: selected ? 700 : 500,
                    padding: '8px 10px',
                    textAlign: 'left',
                  }}
                >
                  <span>{provider.label}</span>
                  {selected && <span aria-hidden style={{ color: '#c084fc' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
