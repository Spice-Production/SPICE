'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchAccountProfile, readAccountToken } from '../../watch-client';
import { appendListeningEvent, normalizeListeningEvents } from '../../listening-insights';
import { AppShell, Button, EmptyState, ErrorNote, PageHeader, Picker, ProfileButton, TextField } from '@/components/ui';
import { V2_NAV } from '../nav';
import { formatMs, useMusicEngine, type EngineTrack } from './engine';
import { MusicLibraryView, TrackRow, useMusicLibrary } from './library';
import { QueueCard } from './queue';
import { LyricsView } from './lyrics';
import { DownloadButton, LikedArtistRail, RelatedRail, TasteRail } from './extras';
import { TogetherView, listenTogetherNeedsSeek, useTogether, type GuestSyncState, type TogetherSnapshot } from './together';
import { CommandPalette, useMusicCommands } from './palette';
import { useScrobble } from './scrobble';
import { usePlaybackProfiles } from './playback';
import { ProfilesView } from './profiles';
import type { MusicSource } from './transport';

const SOURCES = [
  { value: 'youtube', label: 'YouTube Music' },
  { value: 'soundcloud', label: 'SoundCloud' },
];

/**
 * /v2/music — slice 1: search, resolve, play. Slice 2: account library
 * (likes, history, playlists) synced with the same replacement contract
 * as the original player and CLI. Slice 4: playback profiles with
 * crossfade, volume boost with consent, and theme accents.
 */
export default function V2MusicPage() {
  const playback = usePlaybackProfiles();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<MusicSource>('youtube');
  const [results, setResults] = useState<EngineTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [token] = useState<string | null>(() => readAccountToken());
  const [accountName, setAccountName] = useState<string | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [boostAsk, setBoostAsk] = useState<number | null>(null);

  const library = useMusicLibrary(token);
  const recordedRef = useRef<string | null>(null);

  const knownTrackIds = useMemo(() => {
    const ids = new Set<string>(library.likes);
    for (const item of library.history) ids.add(item.id);
    for (const playlist of library.playlists) {
      for (const item of playlist.tracks) ids.add(item.id);
    }
    return ids;
  }, [library.likes, library.history, library.playlists]);

  /**
   * Feed the on-device weekly recap: completed listens (30s+ counts as
   * meaningful, same unit as the original) persist under the same
   * per-profile key the home screen reads. First-seen tracks count as
   * discoveries.
   */
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

  const {
    order, current: currentTrack, status: playStatus, shuffle: shuffleOn,
    repeat: repeatMode, progressMs: progressNow, durationMs: durationNow,
    playTrack, seek, toggle: togglePlay,
  } = engine;

  const snapshot = useCallback((): TogetherSnapshot => {
    const index = currentTrack ? order.findIndex((item) => item.id === currentTrack.id) : 0;
    return {
      track: currentTrack,
      queue: order,
      queueIndex: Math.max(0, index),
      isPlaying: playStatus === 'playing',
      shuffle: shuffleOn,
      repeatMode,
      progressMs: progressNow,
      durationMs: durationNow,
    };
  }, [order, currentTrack, playStatus, shuffleOn, repeatMode, progressNow, durationNow]);

  const applyGuestSync = useCallback(
    (state: GuestSyncState) => {
      if (!state.currentTrack) return;
      const same = currentTrack?.id === state.currentTrack.id;
      if (!same) {
        void playTrack(state.currentTrack, state.queue.length > 0 ? state.queue : undefined).then(() => {
          if (listenTogetherNeedsSeek(0, state.targetProgressMs)) seek(state.targetProgressMs);
        });
        return;
      }
      if (listenTogetherNeedsSeek(progressNow / 1000, state.targetProgressMs)) {
        seek(state.targetProgressMs);
      }
      if (state.isPlaying && playStatus !== 'playing') togglePlay();
      else if (!state.isPlaying && playStatus === 'playing') togglePlay();
    },
    [currentTrack, playStatus, progressNow, playTrack, seek, togglePlay],
  );

  const together = useTogether(token, snapshot, applyGuestSync);
  const scrobble = useScrobble(token, engine.current, engine.status === 'playing');
  const commands = useMusicCommands({
    toggle: engine.toggle,
    next: engine.next,
    prev: engine.prev,
    toggleLyrics: () => setLyricsOpen((prev) => !prev),
  });

  function pullProfile(next: string) {
    fetchAccountProfile(next)
      .then((profile) => setAccountName(profile?.displayName ?? profile?.username ?? null))
      .catch(() => null);
  }

  useEffect(() => {
    if (token) pullProfile(token);
  }, [token]);

  useEffect(() => {
    const track = engine.current;
    if (track && engine.status === 'playing' && recordedRef.current !== track.id) {
      recordedRef.current = track.id;
      void library.recordHistory(track);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.current, engine.status]);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    setSearched(true);
    try {
      setResults(await engine.search(q, source));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const playAll = (track: EngineTrack) => {
    void engine.playTrack(track, results);
  };

  const trackLabel = (track: EngineTrack) => track.artists.map((a) => a.name).join(', ');

  return (
    <>
      <style>{`
        .v2-bar { position: sticky; bottom: 0; background: var(--spk-surface, #101014);
          border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          border-radius: var(--spk-radius-md, 12px); padding: 12px 16px;
          display: grid; gap: 8px; font-family: var(--spk-font, Inter, system-ui, sans-serif); }
        .v2-bar-row { display: flex; gap: 10px; align-items: center; }
        .v2-bar-title { flex: 1; min-width: 0; font-size: 0.85rem; font-weight: 650;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v2-bar-btn { border: 1px solid var(--spk-line, rgba(255,255,255,0.09)); background: transparent;
          color: var(--spk-text, #e8eaf0); border-radius: 8px; font-size: 0.85rem; font-weight: 700;
          width: 34px; height: 34px; cursor: pointer; flex: none; }
        .v2-bar-btn:hover { border-color: var(--spk-text-3, #6b6f7d); }
        .v2-bar-btn:disabled { opacity: 0.4; cursor: default; }
        .v2-seek { display: flex; gap: 10px; align-items: center; font-size: 0.74rem;
          color: var(--spk-text-3, #6b6f7d); }
        .v2-seek input[type="range"] { flex: 1; accent-color: var(--spk-accent, #8b93f8); }
        .v2-capped { font-size: 0.72rem; color: #e89893; }
        .v2-heart { border: none; background: transparent; cursor: pointer; font-size: 1.05rem; flex: none;
          color: var(--spk-text-3, #6b6f7d); padding: 4px; }
        .v2-heart[data-on="true"] { color: var(--spk-accent, #8b93f8); }
      `}</style>
      <AppShell
        items={V2_NAV}
        active="music"
        topbar={<ProfileButton name={accountName} signedIn={token !== null} />}
      >
        <PageHeader
          kicker="SPICE MUSIC"
          title="Search, play."
          lede="Live search and playback through your local runtime, with your synced library below. Press Ctrl+K for commands."
        />
        <CommandPalette commands={commands} />

        <form onSubmit={runSearch} style={{ display: 'grid', gap: 12 }} aria-label="Search music">
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label="Search music" placeholder="Artists, tracks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button type="submit" variant="primary" disabled={searching || !query.trim()}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <Picker label="Source" options={SOURCES} value={source} onChange={(value) => setSource(value as MusicSource)} />
        </form>

        {searchError && <ErrorNote message={searchError} />}
        {searched && results.length === 0 && !searching && !searchError && (
          <EmptyState message="No tracks found. Try another query or the other source." />
        )}

        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {results.map((track) => (
              <TrackRow
                key={`${track.sourceId ?? source}:${track.id}`}
                track={track}
                playing={engine.current?.id === track.id}
                liked={library.likes.has(track.id)}
                onPlay={() => playAll(track)}
                onToggleLike={token ? () => void library.toggleLike(track) : undefined}
              />
            ))}
          </div>
        )}

        <MusicLibraryView
          library={library}
          signedIn={token !== null}
          currentId={engine.current?.id ?? null}
          nowPlaying={engine.current}
          onPlay={(track, queue) => void engine.playTrack(track, queue)}
        />

        {engine.error && <ErrorNote message={engine.error} />}

        {engine.order.length > 0 && (
          <QueueCard
            order={engine.order}
            currentId={engine.current?.id ?? null}
            shuffle={engine.shuffle}
            repeat={engine.repeat}
            likedIds={library.likes}
            onPlayAt={(index) => engine.playAt(index)}
            onRemove={(trackId) => engine.removeFromQueue(trackId)}
            onClear={() => engine.clearQueue()}
            onToggleShuffle={() => engine.toggleShuffle()}
            onCycleRepeat={() => engine.cycleRepeat()}
            onToggleLike={token ? (track) => void library.toggleLike(track) : null}
          />
        )}

        {engine.current && (
          <div className="v2-bar" aria-label="Now playing">
            <div className="v2-bar-row">
              <button type="button" className="v2-bar-btn" onClick={() => engine.prev()} aria-label="Previous track">|◂</button>
              <button
                type="button"
                className="v2-bar-btn"
                onClick={() => engine.toggle()}
                disabled={engine.status === 'loading'}
                aria-label={engine.status === 'playing' ? 'Pause' : 'Play'}
              >
                {engine.status === 'playing' ? '❚❚' : '▶'}
              </button>
              <button type="button" className="v2-bar-btn" onClick={() => engine.next()} aria-label="Next track">▸|</button>
              <span className="v2-bar-title">
                {engine.status === 'loading' || engine.resolving ? 'Loading… ' : ''}
                {engine.current.title} — {trackLabel(engine.current)}
              </span>
              {token && (
                <button
                  type="button"
                  className="v2-heart"
                  data-on={library.likes.has(engine.current.id) ? 'true' : 'false'}
                  aria-label="Like this track"
                  onClick={() => void library.toggleLike(engine.current as EngineTrack)}
                >
                  {library.likes.has(engine.current.id) ? '♥' : '♡'}
                </button>
              )}
              {engine.capped && <span className="v2-capped">preview quality</span>}
              {scrobble.scrobbled && (
                <span style={{ fontSize: '0.72rem', color: '#8fd6a0' }}>✓ scrobbled</span>
              )}
              <button
                type="button"
                className="v2-bar-btn"
                style={{ width: 'auto', padding: '0 10px', fontSize: '0.75rem' }}
                onClick={() => setLyricsOpen((prev) => !prev)}
                aria-expanded={lyricsOpen}
                aria-label="Toggle lyrics"
              >
                Lyrics
              </button>
              <DownloadButton track={engine.current} />
            </div>
            <div className="v2-seek">
              <span>{formatMs(engine.progressMs)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(engine.durationMs, 1)}
                value={Math.min(engine.progressMs, Math.max(engine.durationMs, 1))}
                onChange={(e) => engine.seek(Number(e.target.value))}
                aria-label="Seek"
              />
              <span>{formatMs(engine.durationMs)}</span>
              <input
                type="range"
                min={0}
                max={200}
                value={Math.round(engine.volume)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v > 100 && !engine.boosterAccepted) setBoostAsk(v);
                  else engine.setVolume(v);
                }}
                aria-label="Volume"
                style={{ maxWidth: 90 }}
              />
            </div>
            {boostAsk !== null && (
              <div className="v2-seek">
                <span>Past 100% can damage hearing.</span>
                <Button size="sm" onClick={() => { engine.acceptBoost(); engine.setVolume(boostAsk); setBoostAsk(null); }}>
                  Enable boost
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBoostAsk(null)}>
                  Cancel
                </Button>
              </div>
            )}
            {lyricsOpen && <LyricsView track={engine.current} progressMs={engine.progressMs} />}
          </div>
        )}

        {token && <ProfilesView token={token} />}

        {engine.current && (
          <RelatedRail
            track={engine.current}
            currentId={engine.current.id}
            onPlay={(track, queue) => void engine.playTrack(track, queue)}
          />
        )}
        {token && (
          <LikedArtistRail
            likes={library.likeDetails}
            search={(q) => engine.search(q, 'youtube')}
            currentId={engine.current?.id ?? null}
            onPlay={(track, queue) => void engine.playTrack(track, queue)}
          />
        )}
        {token && (
          <TasteRail
            token={token}
            currentId={engine.current?.id ?? null}
            onPlay={(track, queue) => void engine.playTrack(track, queue)}
          />
        )}
        <TogetherView token={token} hook={together} />
      </AppShell>
    </>
  );
}
