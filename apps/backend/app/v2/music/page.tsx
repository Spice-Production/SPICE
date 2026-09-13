'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, EmptyState, ErrorNote, PageHeader, Picker, TextField } from '@/components/ui';
import { type EngineTrack } from './engine';
import { MusicLibraryView, TrackRow } from './library';
import { QueueCard } from './queue';
import { LyricsView } from './lyrics';
import { DownloadButton, LikedArtistRail, RelatedRail, TasteRail } from './extras';
import { TogetherView, listenTogetherNeedsSeek, useTogether, type GuestSyncState, type TogetherSnapshot } from './together';
import { CommandPalette, useMusicCommands } from './palette';
import { useScrobble } from './scrobble';
import { ProfilesView } from './profiles';
import { usePlayer } from '../shell';
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
  const { token, library, engine, searchRequest } = usePlayer();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<MusicSource>('youtube');
  const [results, setResults] = useState<EngineTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [boostAsk, setBoostAsk] = useState<number | null>(null);
  const appliedSearchRef = useRef<string | null>(null);

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

  const runSearch = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const q = (override ?? query).trim();
    if (!q || searching) return;
    if (override !== undefined) setQuery(override);
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

  const applySearchRequest = useCallback(
    (q: string) => {
      if (!q.trim() || appliedSearchRef.current === q) return;
      appliedSearchRef.current = q;
      void runSearch(undefined, q);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('q')?.trim();
      if (q) applySearchRequest(q);
    } catch {
      /* no URL query: plain visit */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchRequest && searchRequest.scope === 'music') applySearchRequest(searchRequest.q);
  }, [searchRequest, applySearchRequest]);

  return (
    <>
      <style>{`
        .v2-np-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .v2-np-title { flex: 1; min-width: 200px; font-size: 0.88rem; font-weight: 650;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v2-capped { font-size: 0.72rem; color: #e89893; }
        .v2-heart { border: none; background: transparent; cursor: pointer; font-size: 1.05rem; flex: none;
          color: var(--spk-text-3, #6b6f7d); padding: 4px; }
        .v2-heart[data-on="true"] { color: var(--spk-accent, #fafafa); }
      `}</style>
      <>
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

        <div id="library" style={{ scrollMarginTop: 76 }}>
          <MusicLibraryView
            library={library}
            signedIn={token !== null}
            currentId={engine.current?.id ?? null}
            nowPlaying={engine.current}
            onPlay={(track, queue) => void engine.playTrack(track, queue)}
          />
        </div>

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
          <Card title="Now playing">
            <div className="v2-np-row">
              <span className="v2-np-title">
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLyricsOpen((prev) => !prev)}
                aria-expanded={lyricsOpen}
                aria-label="Toggle lyrics"
              >
                Lyrics
              </Button>
              <DownloadButton track={engine.current} />
            </div>
            {boostAsk !== null && (
              <div className="v2-np-row" style={{ marginTop: 8 }}>
                <span style={{ fontSize: '0.78rem' }}>Past 100% can damage hearing.</span>
                <Button size="sm" onClick={() => { engine.acceptBoost(); engine.setVolume(boostAsk); setBoostAsk(null); }}>
                  Enable boost
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBoostAsk(null)}>
                  Cancel
                </Button>
              </div>
            )}
            {lyricsOpen && <LyricsView track={engine.current} progressMs={engine.progressMs} />}
          </Card>
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
      </>
    </>
  );
}
