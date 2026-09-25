'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { appendListeningEvent, normalizeListeningEvents } from '../listening-insights';
import { fetchAccountProfile, readAccountToken } from '../watch-client';
import { AppShell, ProfileButton } from '@/components/ui';
import { V2_NAV } from './nav';
import { V2Icon } from './icons';
import { formatMs, useMusicEngine, type EngineTrack } from './music/engine';
import { useMusicLibrary } from './music/library';
import { usePlaybackProfiles } from './music/playback';

interface PlayerShape {
  token: string | null;
  accountName: string | null;
  library: ReturnType<typeof useMusicLibrary>;
  playback: ReturnType<typeof usePlaybackProfiles>;
  engine: ReturnType<typeof useMusicEngine>;
  searchRequest: { scope: SearchScope; q: string; n: number } | null;
  requestSearch: (scope: SearchScope, q: string) => void;
}

export type SearchScope = 'music' | 'movies' | 'shows';

const PlayerCtx = createContext<PlayerShape | null>(null);

/** Shared player state for every /v2 surface (audio keeps playing across pages). */
export function usePlayer(): PlayerShape {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [token] = useState<string | null>(() => readAccountToken());
  const [accountName, setAccountName] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState<{ scope: SearchScope; q: string; n: number } | null>(null);
  const library = useMusicLibrary(token);
  const playback = usePlaybackProfiles();
  const recordedRef = useRef<string | null>(null);

  const knownTrackIds = useMemo(() => {
    const ids = new Set<string>(library.likes);
    for (const item of library.history) ids.add(item.id);
    for (const playlist of library.playlists) {
      for (const item of playlist.tracks) ids.add(item.id);
    }
    return ids;
  }, [library.likes, library.history, library.playlists]);

  const recordCompleted = useCallback(
    (track: EngineTrack, listenedMs: number) => {
      if (listenedMs < 30_000) return;
      try {
        const profile = window.localStorage.getItem('spice_cloud_profile_id') || 'default';
        const key = `spice_listening_events:${profile}`;
        const raw = window.localStorage.getItem(key);
        const next = appendListeningEvent(
          normalizeListeningEvents(raw ? JSON.parse(raw) : []),
          {
            trackId: track.id,
            sourceId: track.sourceId ?? 'youtube_music',
            title: track.title,
            artistNames: track.artists.map((artist) => artist.name),
            listenedMs,
            completedAt: Date.now(),
            discovered: !knownTrackIds.has(track.id),
          },
        );
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode: the recap lasts the visit */
      }
    },
    [knownTrackIds],
  );

  const engine = useMusicEngine({
    crossfadeEnabled: playback.active.crossfade.enabled,
    crossfadeMs: playback.active.crossfade.durationMs,
    curve: playback.active.crossfade.curve,
    onTrackCompleted: recordCompleted,
  });

  useEffect(() => {
    if (!token) return;
    fetchAccountProfile(token)
      .then((profile) => setAccountName(profile?.displayName ?? profile?.username ?? null))
      .catch(() => null);
  }, [token]);

  useEffect(() => {
    const track = engine.current;
    if (track && engine.status === 'playing' && recordedRef.current !== track.id) {
      recordedRef.current = track.id;
      void library.recordHistory(track);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.current, engine.status]);

  const requestSearch = useCallback((scope: SearchScope, q: string) => {
    setSearchRequest({ scope, q, n: Date.now() });
  }, []);

  const value = useMemo(
    () => ({ token, accountName, library, playback, engine, searchRequest, requestSearch }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, accountName, searchRequest, requestSearch],
  );

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

function activeFor(pathname: string, hash: string): string {
  if (pathname.startsWith('/v2/movie')) return 'movies';
  if (pathname.startsWith('/v2/shows')) return 'shows';
  if (pathname.startsWith('/v2/anime')) return 'anime';
  if (pathname === '/v2/music') return hash === '#library' ? 'library' : 'search';
  return 'music';
}

/** Which library the top search feeds on this route (null hides it). */
function scopeFor(pathname: string): SearchScope | null {
  if (pathname.startsWith('/v2/movie')) return 'movies';
  if (pathname.startsWith('/v2/shows')) return 'shows';
  if (pathname === '/' || pathname === '/v2' || pathname.startsWith('/v2/music')) return 'music';
  return null;
}

const SCOPE_META: Record<SearchScope, { placeholder: string; target: string }> = {
  music: { placeholder: 'Search YouTube + SoundCloud…', target: '/v2/music' },
  movies: { placeholder: 'Search movies…', target: '/v2/movie' },
  shows: { placeholder: 'Search series…', target: '/v2/shows' },
};

const SIDEBAR_KEY = 'spice_sidebar_collapsed';

/**
 * The persistent frame: sidebar (nav + playlists), global search topbar,
 * page content, and the always-on player bar. Plain anchors stay client
 * navigations, so audio survives page changes.
 */
export function V2Shell({ children }: { children: ReactNode }) {
  const { token, accountName, library, requestSearch } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hash, setHash] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        /* private mode: expanded lasts the visit */
      }
      return next;
    });
  };

  const scope = scopeFor(pathname);
  const meta = scope ? SCOPE_META[scope] : null;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query || !scope || !meta) return;
    if (pathname === meta.target) {
      requestSearch(scope, query);
    } else {
      router.push(`${meta.target}?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <>
      <style>{`
        .v2-topsearch { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; }
        .v2-topsearch input { flex: 1; min-width: 0; height: 38px; padding: 0 12px;
          background: var(--spk-surface, #111114); border: 1px solid var(--spk-line, #26262c);
          border-radius: var(--spk-radius-sm, 6px); color: var(--spk-text, #fafafa); font-size: 0.875rem; }
        .v2-topsearch input::placeholder { color: var(--spk-text-3, #71717a); }
        .v2-topsearch input:focus { outline: none; border-color: var(--spk-accent, #fafafa); box-shadow: var(--spk-ring); }
        .v2-playerbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
          background: var(--spk-surface, #111114); border-top: 1px solid var(--spk-line, #26262c);
          display: flex; align-items: center; gap: 14px; padding: 10px 18px;
          font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-playerbar-art { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex: none;
          background: var(--spk-surface-2, #18181d); }
        .v2-playerbar-meta { min-width: 0; width: 220px; flex: none; }
        .v2-playerbar-title { font-size: 0.85rem; font-weight: 650; color: var(--spk-text, #fafafa);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v2-playerbar-sub { font-size: 0.76rem; color: var(--spk-text-2, #a1a1aa);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v2-playerbar-btns { display: flex; align-items: center; gap: 6px; flex: none; }
        .v2-playerbar-btn { width: 36px; height: 36px; border-radius: 9999px; cursor: pointer;
          border: 1px solid var(--spk-line, #26262c); background: transparent; color: var(--spk-text, #fafafa);
          font-size: 0.9rem; display: grid; place-items: center; }
        .v2-playerbar-btn:hover:not(:disabled) { border-color: var(--spk-text-3, #71717a); }
        .v2-playerbar-btn:disabled { opacity: 0.35; cursor: default; }
        .v2-playerbar-on { border-color: var(--spk-accent, #fafafa) !important; }
        .v2-playerbar-btn[data-main="true"] { background: var(--spk-accent, #fafafa);
          color: var(--spk-accent-ink, #09090b); border-color: transparent; width: 40px; height: 40px; }
        .v2-playerbar-seek { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0;
          font-size: 0.74rem; color: var(--spk-text-3, #71717a); font-variant-numeric: tabular-nums; }
        .v2-playerbar-seek input[type="range"] { flex: 1; accent-color: var(--spk-accent, #fafafa); }
        .v2-playerbar-vol { display: flex; align-items: center; gap: 8px; flex: none; width: 130px; }
        .v2-playerbar-vol input[type="range"] { width: 100%; accent-color: var(--spk-accent, #fafafa); }
        .v2-gearbtn { display: grid; place-items: center; width: 38px; height: 38px; flex: none;
          border-radius: var(--spk-radius-full, 9999px); border: 1px solid transparent;
          color: var(--spk-text-2, #a1a1aa); }
        .v2-gearbtn:hover { color: var(--spk-text, #fafafa); border-color: var(--spk-line, #26262c);
          background: var(--spk-surface, #111114); }
        @media (max-width: 900px) {
          .v2-playerbar-meta { width: 130px; }
          .v2-playerbar-vol { display: none; }
        }
      `}</style>
      <AppShell
        items={V2_NAV.map((item) => ({ ...item, icon: <V2Icon name={item.id} /> }))}
        active={activeFor(pathname, hash)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        topbar={
          <>
            {meta && (
              <form className="v2-topsearch" onSubmit={submitSearch} role="search" aria-label={meta.placeholder}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={meta.placeholder}
                  aria-label={meta.placeholder}
                />
              </form>
            )}
            <ProfileButton name={accountName} signedIn={token !== null} />
          </>
        }
        sidebarExtra={
          token && library.playlists.length > 0 ? (
            <div className="spk-side-extra">
              <div className="spk-side-h">
                <span>Playlists</span>
                <a className="spk-side-add" href="/v2/music#library" title="New playlist" aria-label="New playlist">
                  +
                </a>
              </div>
              {library.playlists.map((playlist) => (
                <a key={playlist.id} className="spk-playlink" href="/v2/music#library" title={playlist.title}>
                  <V2Icon name="library" />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {playlist.title}
                  </span>
                </a>
              ))}
            </div>
          ) : undefined
        }
      >
        {children}
      </AppShell>
      <PlayerBar />
    </>
  );
}

function PlayerBar() {
  const { token, library, engine } = usePlayer();
  const track = engine.current;
  const playing = engine.status === 'playing';
  const artists = track ? track.artists.map((artist) => artist.name).join(', ') : '';
  const liked = track && token ? library.likes.has(track.id) : false;

  return (
    <div className="v2-playerbar" aria-label="Now playing">
      {track?.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="v2-playerbar-art" src={track.artworkUrl} alt="" />
      ) : (
        <span className="v2-playerbar-art" aria-hidden />
      )}
      <div className="v2-playerbar-meta">
        <div className="v2-playerbar-title">{track ? track.title : 'Nothing playing'}</div>
        <div className="v2-playerbar-sub">{track ? artists || 'SPICE Player' : 'Pick a track to start'}</div>
      </div>
      <div className="v2-playerbar-btns">
        <button className="v2-playerbar-btn" onClick={() => engine.prev()} disabled={!track} aria-label="Previous">
          |◀
        </button>
        <button
          className="v2-playerbar-btn"
          data-main="true"
          onClick={() => engine.toggle()}
          disabled={!track}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="v2-playerbar-btn" onClick={() => engine.next()} disabled={!track} aria-label="Next">
          ▶|
        </button>
        <button
          className={`v2-playerbar-btn${engine.shuffle ? ' v2-playerbar-on' : ''}`}
          onClick={() => engine.toggleShuffle()}
          disabled={!track}
          aria-label="Toggle shuffle"
          aria-pressed={engine.shuffle}
          title="Shuffle"
        >
          ⇄
        </button>
        <button
          className={`v2-playerbar-btn${engine.repeat !== 'none' ? ' v2-playerbar-on' : ''}`}
          onClick={() => engine.cycleRepeat()}
          disabled={!track}
          aria-label={`Repeat: ${engine.repeat}`}
          title={`Repeat: ${engine.repeat}`}
        >
          {engine.repeat === 'one' ? '¹' : '↻'}
        </button>
        {token && (
          <button
            className={`v2-playerbar-btn${liked ? ' v2-playerbar-on' : ''}`}
            onClick={() => { if (track) void library.toggleLike(track); }}
            disabled={!track}
            aria-label="Like this track"
            title="Like"
          >
            {liked ? '♥' : '♡'}
          </button>
        )}
      </div>
      <div className="v2-playerbar-seek">
        <span>{formatMs(engine.progressMs)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, engine.durationMs)}
          value={Math.min(engine.progressMs, Math.max(1, engine.durationMs))}
          onChange={(e) => engine.seek(Number(e.target.value))}
          disabled={!track}
          aria-label="Seek"
        />
        <span>{formatMs(engine.durationMs)}</span>
      </div>
      <div className="v2-playerbar-vol">
        <input
          type="range"
          min={0}
          max={200}
          value={engine.volume}
          onChange={(e) => engine.setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
