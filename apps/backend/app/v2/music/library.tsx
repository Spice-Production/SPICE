'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button, Dialog, EmptyState, ErrorNote, Picker, TextField } from '@/components/ui';
import type { EngineTrack } from './engine';

export interface LibraryPlaylist {
  id: string;
  title: string;
  tracks: EngineTrack[];
  shared?: boolean;
}

type LibraryTab = 'likes' | 'history' | 'playlists';

const PROFILE_KEY = 'spice_cloud_profile_id';

function profileId(): string {
  try {
    return window.localStorage.getItem(PROFILE_KEY) ?? 'default';
  } catch {
    return 'default';
  }
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function cloudGet<T>(path: string, token: string): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('profileId', profileId());
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message || `Sync failed (${res.status}).`);
  return data;
}

async function cloudPost(path: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ ...body as Record<string, unknown>, profileId: profileId() }) });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(data.message || `Sync failed (${res.status}).`);
}

/**
 * Slice-2 library: likes, history, and playlists synced to the SPICE
 * account. Same replacement (not delta) contract as the original and
 * the CLI: every mutation does read → modify → POST the full array,
 * deduped by track id.
 */
export function useMusicLibrary(token: string | null) {
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [likeDetails, setLikeDetails] = useState<Record<string, EngineTrack>>({});
  const [history, setHistory] = useState<EngineTrack[]>([]);
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState(token);

  // Derived state: a different token means a different library.
  if (token !== activeToken) {
    setActiveToken(token);
    setLikes(new Set());
    setLikeDetails({});
    setHistory([]);
    setPlaylists([]);
    setLoaded(false);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [likeData, historyData, playlistData] = await Promise.all([
          cloudGet<{ likedTracks?: string[]; likedTrackDetails?: Record<string, EngineTrack> }>('/api/sync/likes', token),
          cloudGet<{ history?: EngineTrack[] }>('/api/sync/history', token),
          cloudGet<{ playlists?: LibraryPlaylist[] }>('/api/sync/playlists', token),
        ]);
        if (cancelled) return;
        setLikes(new Set(likeData.likedTracks ?? []));
        setLikeDetails(likeData.likedTrackDetails ?? {});
        setHistory(Array.isArray(historyData.history) ? historyData.history : []);
        setPlaylists(Array.isArray(playlistData.playlists) ? playlistData.playlists : []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Library sync failed.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleLike = useCallback(
    async (track: EngineTrack) => {
      if (!token) return;
      const next = new Set(likes);
      const details = { ...likeDetails };
      if (next.has(track.id)) {
        next.delete(track.id);
        delete details[track.id];
      } else {
        next.add(track.id);
        details[track.id] = track;
      }
      setLikes(next);
      setLikeDetails(details);
      try {
        await cloudPost('/api/sync/likes', token, { likedTracks: [...next], likedTrackDetails: details });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not sync likes.');
      }
    },
    [token, likes, likeDetails],
  );

  const recordHistory = useCallback(
    async (track: EngineTrack) => {
      if (!token) return;
      const entry = { ...track, playedAt: new Date().toISOString() } as EngineTrack & { playedAt: string };
      const next = [entry, ...history.filter((item) => item.id !== track.id)].slice(0, 50);
      setHistory(next);
      try {
        await cloudPost('/api/sync/history', token, { history: next });
      } catch {
        /* history is best-effort; the shelf refreshes next visit */
      }
    },
    [token, history],
  );

  const pushPlaylists = useCallback(
    async (next: LibraryPlaylist[]) => {
      if (!token) return;
      setPlaylists(next);
      try {
        await cloudPost('/api/sync/playlists', token, {
          playlists: next.filter((pl) => !pl.shared),
          includeSnapshots: false,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not sync playlists.');
      }
    },
    [token],
  );

  const createPlaylist = useCallback(
    (title: string) => {
      const name = title.trim();
      if (!name) return;
      const fresh: LibraryPlaylist = {
        id: `pl_${Date.now().toString(36)}`,
        title: name,
        tracks: [],
      };
      void pushPlaylists([...playlists, fresh]);
    },
    [playlists, pushPlaylists],
  );

  const addToPlaylist = useCallback(
    (playlistId: string, track: EngineTrack) => {
      const next = playlists.map((pl) =>
        pl.id === playlistId && !pl.tracks.some((item) => item.id === track.id)
          ? { ...pl, tracks: [...pl.tracks, track] }
          : pl,
      );
      void pushPlaylists(next);
    },
    [playlists, pushPlaylists],
  );

  const removeFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      void pushPlaylists(
        playlists.map((pl) => (pl.id === playlistId ? { ...pl, tracks: pl.tracks.filter((item) => item.id !== trackId) } : pl)),
      );
    },
    [playlists, pushPlaylists],
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      // Deletion is replacement without the playlist — the server drops
      // rows for ids absent from the payload.
      void pushPlaylists(playlists.filter((pl) => pl.id !== playlistId));
    },
    [playlists, pushPlaylists],
  );

  return {
    likes, likeDetails, history, playlists, loaded, error,
    toggleLike, recordHistory, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist,
  };
}

export type MusicLibrary = ReturnType<typeof useMusicLibrary>;

export function TrackRow({
  track,
  playing,
  liked,
  onPlay,
  onToggleLike,
  extra,
}: {
  track: EngineTrack;
  playing?: boolean;
  liked?: boolean;
  onPlay: () => void;
  onToggleLike?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        .v2-track { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left;
          background: var(--spk-surface, #101014); border: 1px solid var(--spk-line, rgba(255,255,255,0.09));
          border-radius: var(--spk-radius-md, 12px); padding: 10px 12px; cursor: pointer; color: inherit; font: inherit; }
        .v2-track:hover { border-color: var(--spk-text-3, #6b6f7d); }
        .v2-track[data-on="true"] { border-color: var(--spk-accent, #fafafa); }
        .v2-track-art { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex: none;
          background: var(--spk-surface-2, #17171d); }
        .v2-track-fallback { width: 44px; height: 44px; border-radius: 8px; flex: none; display: grid;
          place-items: center; background: var(--spk-surface-2, #17171d);
          color: var(--spk-text-3, #6b6f7d); font-weight: 700; }
        .v2-track-meta { flex: 1; min-width: 0; }
        .v2-track-title { font-size: 0.88rem; font-weight: 650; color: var(--spk-text, #e8eaf0);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .v2-track-sub { font-size: 0.76rem; color: var(--spk-text-3, #6b6f7d); margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
        .v2-track-dur { font-size: 0.78rem; color: var(--spk-text-3, #6b6f7d); flex: none; }
        .v2-heart { border: none; background: transparent; cursor: pointer; font-size: 1rem; flex: none;
          color: var(--spk-text-3, #6b6f7d); padding: 4px; }
        .v2-heart[data-on="true"] { color: var(--spk-accent, #fafafa); }
      `}</style>
      <div data-on={playing ? 'true' : 'false'} className="v2-track" role="button" tabIndex={0}
        onClick={onPlay} onKeyDown={(e) => { if (e.key === 'Enter') onPlay(); }}>
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" loading="lazy" className="v2-track-art" />
        ) : (
          <span className="v2-track-fallback" aria-hidden="true">{track.title.charAt(0)}</span>
        )}
        <span className="v2-track-meta">
          <span className="v2-track-title">{track.title}</span>
          <span className="v2-track-sub">{track.artists.map((a) => a.name).join(', ')}</span>
        </span>
        {track.durationMs ? (
          <span className="v2-track-dur">
            {`${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}`}
          </span>
        ) : null}
        {onToggleLike && (
          <button
            type="button"
            className="v2-heart"
            data-on={liked ? 'true' : 'false'}
            aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
            aria-pressed={liked}
            onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
          >
            {liked ? '♥' : '♡'}
          </button>
        )}
        {extra}
      </div>
    </>
  );
}

/**
 * Library section for the music page: likes, history, and playlists
 * behind a Picker. Signed out it asks for sign-in instead of showing
 * dead shelves.
 */
export function MusicLibraryView({
  library, signedIn, currentId, nowPlaying, onPlay,
}: {
  library: MusicLibrary;
  signedIn: boolean;
  currentId: string | null;
  nowPlaying: EngineTrack | null;
  onPlay: (track: EngineTrack, queue?: EngineTrack[]) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>('likes');
  const [newName, setNewName] = useState('');
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!signedIn) {
    return <EmptyState message="Sign in above to sync likes, history, and playlists." />;
  }
  if (!library.loaded) {
    return <EmptyState message="Loading your library…" />;
  }

  const likedTracks = [...library.likes]
    .map((id) => library.likeDetails[id])
    .filter((track): track is EngineTrack => Boolean(track));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Picker
        label="Library"
        options={[
          { value: 'likes', label: `Likes (${likedTracks.length})` },
          { value: 'history', label: `History (${library.history.length})` },
          { value: 'playlists', label: `Playlists (${library.playlists.length})` },
        ]}
        value={tab}
        onChange={(value) => setTab(value as LibraryTab)}
      />
      {library.error && <ErrorNote message={library.error} />}

      {tab === 'likes' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {likedTracks.length === 0 && <EmptyState message="Nothing liked yet — tap the heart on any track." />}
          {likedTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              playing={currentId === track.id}
              liked
              onPlay={() => onPlay(track, likedTracks)}
              onToggleLike={() => void library.toggleLike(track)}
            />
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {library.history.length === 0 && <EmptyState message="Plays you finish show up here." />}
          {library.history.map((track, i) => (
            <TrackRow
              key={`${track.id}:${i}`}
              track={track}
              playing={currentId === track.id}
              liked={library.likes.has(track.id)}
              onPlay={() => onPlay(track, library.history)}
              onToggleLike={() => void library.toggleLike(track)}
            />
          ))}
        </div>
      )}

      {tab === 'playlists' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <form
            onSubmit={(e) => { e.preventDefault(); library.createPlaylist(newName); setNewName(''); }}
            style={{ display: 'flex', gap: 10, alignItems: 'end' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label="New playlist" placeholder="Name it…" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <Button type="submit" disabled={!newName.trim()}>Create</Button>
          </form>
          {library.playlists.length === 0 && <EmptyState message="No playlists yet — create one above." />}
          {library.playlists.map((pl) => (
            <div key={pl.id} style={{
              border: '1px solid var(--spk-line, rgba(255,255,255,0.09))',
              borderRadius: 'var(--spk-radius-md, 12px)', padding: 12, display: 'grid', gap: 8,
              background: 'var(--spk-surface, #101014)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <strong style={{ flex: 1, fontSize: '0.9rem' }}>{pl.title}</strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--spk-text-3, #6b6f7d)' }}>
                  {pl.tracks.length} tracks{pl.shared ? ' · shared' : ''}
                </span>
                {!pl.shared && (
                  <Button size="sm" variant="ghost" onClick={() => setOpenPlaylist(openPlaylist === pl.id ? null : pl.id)}>
                    {openPlaylist === pl.id ? 'Hide' : 'Open'}
                  </Button>
                )}
                {!pl.shared && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(pl.id)}>Delete</Button>
                )}
              </div>
              {openPlaylist === pl.id && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {!pl.shared && nowPlaying && (
                    <div>
                      <Button size="sm" variant="quiet" onClick={() => library.addToPlaylist(pl.id, nowPlaying)}>
                        + Add now playing
                      </Button>
                    </div>
                  )}
                  {pl.tracks.length === 0 && <EmptyState message="Empty — use “Add now playing” while a track plays." />}
                  {pl.tracks.map((track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      playing={currentId === track.id}
                      onPlay={() => onPlay(track, pl.tracks)}
                      extra={
                        <Button size="sm" variant="ghost" onClick={() => library.removeFromPlaylist(pl.id, track.id)}>
                          Remove
                        </Button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete playlist?"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (confirmDelete) library.deletePlaylist(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <>“{library.playlists.find((pl) => pl.id === confirmDelete)?.title}” and its track list will be removed from your account. This cannot be undone.</>
        )}
      </Dialog>
    </div>
  );
}
