'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { listenTogetherNeedsSeek, type ListenTogetherRepeatMode } from '../../listen-together-core';
import { Button, Card, EmptyState, ErrorNote, TextField } from '@/components/ui';
import type { EngineTrack } from './engine';

export interface TogetherSnapshot {
  track: EngineTrack | null;
  queue: EngineTrack[];
  queueIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeatMode: ListenTogetherRepeatMode;
  progressMs: number;
  durationMs: number;
}

export interface GuestSyncState {
  isActive: boolean;
  hostName: string;
  isPlaying: boolean;
  targetProgressMs: number;
  durationMs: number;
  currentTrack: EngineTrack | null;
  queue: EngineTrack[];
}

export type TogetherRole = 'idle' | 'host' | 'guest';

const HOST_PUBLISH_MS = 10_000;
const GUEST_POLL_MS = 15_000;

function toEngineTrack(value: unknown): EngineTrack | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as { id?: unknown; sourceId?: unknown; title?: unknown; artists?: unknown; artworkUrl?: unknown; durationMs?: unknown };
  if (typeof row.id !== 'string' || !row.id) return null;
  const artists = Array.isArray(row.artists)
    ? row.artists.map((a, i) => ({
      id: typeof (a as { id?: unknown }).id === 'string' ? (a as { id: string }).id : `together-${i}`,
      name: typeof (a as { name?: unknown }).name === 'string' ? (a as { name: string }).name : 'Unknown',
    }))
    : [];
  return {
    id: row.id,
    sourceId: typeof row.sourceId === 'string' ? row.sourceId : 'youtube_music',
    title: typeof row.title === 'string' && row.title ? row.title : 'Unknown track',
    artists,
    artworkUrl: typeof row.artworkUrl === 'string' ? row.artworkUrl : undefined,
    durationMs: typeof row.durationMs === 'number' ? row.durationMs : undefined,
  };
}

async function authed<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status}).`);
  return data;
}

/**
 * Listen together: host a session (publishes playback state + invites
 * by username) or join one (polls host state and follows along). Same
 * session/invite/sync endpoints and drift rule (1.5s) as the original.
 * Spice Connect remote (LAN/pairing/realtime) stays a separate turn.
 */
export function useTogether(
  token: string | null,
  snapshot: () => TogetherSnapshot,
  onGuestSync: (state: GuestSyncState) => void,
) {
  const [role, setRole] = useState<TogetherRole>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  const syncRef = useRef(onGuestSync);
  useEffect(() => {
    syncRef.current = onGuestSync;
  }, [onGuestSync]);

  const publish = useCallback(
    async (id: string) => {
      if (!token) return;
      const snap = snapshotRef.current();
      await authed('/api/listen-together/sync', token, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: id,
          currentTrack: snap.track,
          queue: snap.queue,
          queueIndex: snap.queueIndex,
          isPlaying: snap.isPlaying,
          shuffleEnabled: snap.shuffle,
          repeatMode: snap.repeatMode,
          progressMs: Math.floor(snap.progressMs),
          durationMs: Math.floor(snap.durationMs),
        }),
      });
    },
    [token],
  );

  const pollGuest = useCallback(
    async (id: string) => {
      if (!token) return;
      const data = await authed<{
        isActive?: boolean; hostName?: string; isPlaying?: boolean;
        targetProgressMs?: number; durationMs?: number;
        currentTrack?: unknown; queue?: unknown[];
      }>(`/api/listen-together/sync?sessionId=${encodeURIComponent(id)}`, token);
      if (typeof data.hostName === 'string') setHostName(data.hostName);
      syncRef.current({
        isActive: data.isActive === true,
        hostName: typeof data.hostName === 'string' ? data.hostName : 'Host',
        isPlaying: data.isPlaying === true,
        targetProgressMs: typeof data.targetProgressMs === 'number' ? data.targetProgressMs : 0,
        durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
        currentTrack: toEngineTrack(data.currentTrack),
        queue: Array.isArray(data.queue) ? data.queue.map(toEngineTrack).filter((t): t is EngineTrack => t !== null) : [],
      });
    },
    [token],
  );

  useEffect(() => {
    if (role === 'idle' || !sessionId) return;
    // Deferred past the sync boundary: the first publish/poll touches state.
    const starter = setTimeout(() => {
      if (role === 'host') void publish(sessionId).catch(() => null);
      else void pollGuest(sessionId).catch(() => null);
    }, 0);
    const interval = setInterval(
      () => {
        if (role === 'host') void publish(sessionId).catch(() => null);
        else void pollGuest(sessionId).catch(() => null);
      },
      role === 'host' ? HOST_PUBLISH_MS : GUEST_POLL_MS,
    );
    return () => {
      clearTimeout(starter);
      clearInterval(interval);
    };
  }, [role, sessionId, publish, pollGuest]);

  const startHosting = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await authed<{ session?: { id?: string } }>('/api/listen-together/session', token, {
        method: 'POST',
        body: JSON.stringify({ profileId: 'default' }),
      });
      const id = data.session?.id;
      if (!id) throw new Error('Could not start a session.');
      setSessionId(id);
      setRole('host');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a session.');
    } finally {
      setBusy(false);
    }
  };

  const stopHosting = async () => {
    if (!token) return;
    try {
      await authed('/api/listen-together/session', token, { method: 'DELETE' });
    } catch {
      /* session row expires on its own */
    }
    setSessionId(null);
    setRole('idle');
  };

  const join = async (id: string) => {
    const trimmed = id.trim();
    if (!token || !trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pollGuest(trimmed);
      setSessionId(trimmed);
      setRole('guest');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that session.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    setSessionId(null);
    setHostName(null);
    setRole('idle');
  };

  const invite = async (username: string) => {
    if (!token || !sessionId) return;
    await authed('/api/listen-together/invite', token, {
      method: 'POST',
      body: JSON.stringify({ username, sessionId }),
    });
  };

  return { role, sessionId, hostName, setHostName, error, busy, startHosting, stopHosting, join, leave, invite, publishNow: publish };
}

export function TogetherView({
  token, hook,
}: {
  token: string | null;
  hook: ReturnType<typeof useTogether>;
}) {
  const [joinId, setJoinId] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  if (!token) {
    return (
      <Card title="Listen together" extra="off">
        <EmptyState message="Sign in to host or join a listening session." />
      </Card>
    );
  }

  return (
    <Card title="Listen together" extra={hook.role === 'idle' ? 'off' : hook.role}>
      {hook.error && <ErrorNote message={hook.error} />}
      {hook.role === 'idle' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <Button variant="primary" onClick={() => void hook.startHosting()} disabled={hook.busy}>
              {hook.busy ? 'Starting…' : 'Host a session'}
            </Button>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void hook.join(joinId); }}
            style={{ display: 'flex', gap: 10, alignItems: 'end' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label="Join with session id" placeholder="Paste a session id…" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
            </div>
            <Button type="submit" disabled={hook.busy || !joinId.trim()}>Join</Button>
          </form>
        </div>
      )}
      {hook.role === 'host' && hook.sessionId && (
        <div style={{ display: 'grid', gap: 12 }}>
          <EmptyState message={`Hosting — share this id: ${hook.sessionId}`} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void hook.invite(inviteName).then(
                () => setInviteNote(`Invited ${inviteName}.`),
                (err: unknown) => setInviteNote(err instanceof Error ? err.message : 'Invite failed.'),
              );
              setInviteName('');
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'end' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label="Invite by username" placeholder="username" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </div>
            <Button type="submit" disabled={!inviteName.trim()}>Invite</Button>
          </form>
          {inviteNote && <EmptyState message={inviteNote} />}
          <div>
            <Button variant="ghost" onClick={() => void hook.stopHosting()}>
              End session
            </Button>
          </div>
        </div>
      )}
      {hook.role === 'guest' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <EmptyState message={`Following ${hook.hostName ?? 'the host'} — your player mirrors their track and position.`} />
          <div>
            <Button variant="ghost" onClick={hook.leave}>
              Leave session
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export { listenTogetherNeedsSeek };
