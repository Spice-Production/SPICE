'use client';

import { useEffect, useState } from 'react';

import { SPICE_MEDIA_CORE_VERSION } from '@/lib/release-notifications';
import { Button, Card, EmptyState, ErrorNote, Shelf, pushToast } from '@/components/ui';
import { resolveTrackStream, type EngineTrack } from './engine';
import { TrackRow } from './library';
import { NAMESPACE_HEADERS } from './transport';

function sanitizeFileName(track: EngineTrack): string {
  const artist = track.artists.map((a) => a.name).filter(Boolean).join(', ');
  // Same illegal-character set as the original player; built via the
  // constructor so bundlers never reinterpret the escapes.
  const illegal = new RegExp('[<>:\"/\\\\|?*\\x00-\\x1F]', 'gu');
  const base = `${artist} - ${track.title}`.replace(illegal, '').replace(/\s+/gu, ' ').trim();
  return `${(base || 'spice-song').slice(0, 90)}.mp3`;
}

/**
 * Browser download: resolve the best stream, fetch its bytes, and save
 * via an object URL — the same web path as the original (the desktop
 * offline-library bridge stays a desktop-shell concern).
 */
export function DownloadButton({ track }: { track: EngineTrack }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await resolveTrackStream(track);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = sanitizeFileName(track);
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      pushToast(`Downloaded “${track.title}”.`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <Button size="sm" variant="quiet" onClick={() => void download()} disabled={busy}>
        {busy ? 'Preparing…' : 'Download'}
      </Button>
      {error && <span style={{ fontSize: '0.74rem', color: '#e89893' }}>{error}</span>}
    </span>
  );
}

/**
 * Related rail: tracks related to the current one via the local
 * related endpoint (YouTube-sourced tracks; SoundCloud has no
 * equivalent endpoint, so the rail stays hidden there).
 */
export function RelatedRail({
  track, currentId, onPlay,
}: {
  track: EngineTrack;
  currentId: string | null;
  onPlay: (track: EngineTrack, queue?: EngineTrack[]) => void;
}) {
  const [related, setRelated] = useState<EngineTrack[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (track.sourceId !== undefined && track.sourceId !== 'youtube_music' && track.sourceId !== 'youtube_video') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/local/yt/related/${encodeURIComponent(track.id)}`, { headers: NAMESPACE_HEADERS });
        const data = (await res.json().catch(() => ({}))) as { tracks?: EngineTrack[] };
        if (!res.ok) throw new Error('related failed');
        if (!cancelled) {
          setRelated(Array.isArray(data.tracks) ? data.tracks.slice(0, 10) : []);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track]);

  if (track.sourceId !== undefined && track.sourceId !== 'youtube_music' && track.sourceId !== 'youtube_video') return null;
  if (failed || related.length === 0) return null;

  return (
    <Shelf title="Related to this track">
      {related.map((item) => (
        <div key={item.id} style={{ width: 280, flex: 'none' }}>
          <TrackRow track={item} playing={currentId === item.id} onPlay={() => onPlay(item, related)} />
        </div>
      ))}
    </Shelf>
  );
}

/**
 * Liked-artist rail: searches the most-liked artist for more to play.
 * A small, honest slice of taste — full affinity graphs stay in slice 6+.
 */
export function LikedArtistRail({
  likes, search, currentId, onPlay,
}: {
  likes: Record<string, EngineTrack>;
  search: (q: string) => Promise<EngineTrack[]>;
  currentId: string | null;
  onPlay: (track: EngineTrack, queue?: EngineTrack[]) => void;
}) {
  const [rows, setRows] = useState<EngineTrack[]>([]);
  const [seenArtist, setSeenArtist] = useState<string | null>(null);

  const counts = Object.values(likes).flatMap((t) => t.artists.map((a) => a.name));
  const top = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0] ?? null;

  // Derived state: a new top artist drops the old rows.
  if (top !== seenArtist) {
    setSeenArtist(top);
    setRows([]);
  }

  useEffect(() => {
    if (!top) return;
    let cancelled = false;
    void search(top)
      .then((tracks) => {
        if (!cancelled) setRows(tracks.slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  if (!top || rows.length === 0) return null;

  return (
    <Shelf title={`More ${top}`}>
      {rows.map((item) => (
        <div key={item.id} style={{ width: 280, flex: 'none' }}>
          <TrackRow track={item} playing={currentId === item.id} onPlay={() => onPlay(item, rows)} />
        </div>
      ))}
    </Shelf>
  );
}

/**
 * Listeners-like-you rail: tracks kept by taste neighbors, excluding
 * anything already known. Same endpoint and privacy posture (aggregate
 * identities + counts only) as the original recommendations.
 */
export function TasteRail({
  token, currentId, onPlay,
}: {
  token: string;
  currentId: string | null;
  onPlay: (track: EngineTrack, queue?: EngineTrack[]) => void;
}) {
  const [rows, setRows] = useState<EngineTrack[]>([]);
  const [meta, setMeta] = useState<{ neighbors: number; reason: string | null }>({ neighbors: 0, reason: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/listeners/like-you', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          tracks?: { trackId: string; sourceId?: string; title?: string; artists?: { id?: string; name?: string }[]; artworkUrl?: string | null; durationMs?: number | null }[];
          neighborCount?: number;
          reason?: string;
        };
        if (!res.ok) throw new Error('taste failed');
        if (cancelled) return;
        const tracks = (Array.isArray(data.tracks) ? data.tracks : [])
          .filter((t) => t.trackId && t.title)
          .map((t) => ({
            id: t.trackId,
            sourceId: t.sourceId ?? 'youtube_music',
            title: t.title as string,
            artists: (t.artists ?? []).map((a, i) => ({ id: a.id ?? `taste-${i}`, name: a.name ?? 'Unknown' })),
            artworkUrl: t.artworkUrl ?? undefined,
            durationMs: t.durationMs ?? undefined,
          }));
        setRows(tracks.slice(0, 10));
        setMeta({ neighbors: data.neighborCount ?? 0, reason: data.reason ?? null });
      } catch {
        if (!cancelled) {
          setRows([]);
          setMeta({ neighbors: 0, reason: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (rows.length === 0) {
    if (!meta.reason) return null;
    return <EmptyState message={meta.reason} />;
  }

  return (
    <Shelf title="Listeners like you" action={meta.neighbors > 0 ? `${meta.neighbors} neighbors` : undefined}>
      {rows.map((item) => (
        <div key={`${item.sourceId}:${item.id}`} style={{ width: 280, flex: 'none' }}>
          <TrackRow track={item} playing={currentId === item.id} onPlay={() => onPlay(item, rows)} />
        </div>
      ))}
    </Shelf>
  );
}

/**
 * Runtime diagnostics: lane reachability, namespace gate, versions, and
 * the persisted keys the rebuilt surfaces depend on.
 */
export function DiagnosticsCard() {
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ping = async () => {
    setBusy(true);
    setPingError(null);
    try {
      const started = Date.now();
      const res = await fetch('/api/local/yt/search?q=Top%20Hits&limit=1', { headers: NAMESPACE_HEADERS });
      if (!res.ok) throw new Error(`search probe failed (${res.status})`);
      setPingMs(Date.now() - started);
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Probe failed.');
    } finally {
      setBusy(false);
    }
  };

  let storedKeys = 0;
  try {
    for (const key of ['spice_cloud_token', 'spice_cloud_profile_id', 'spice-stream-provider', 'spice_volume_booster_accepted']) {
      if (window.localStorage.getItem(key) !== null) storedKeys += 1;
    }
  } catch {
    storedKeys = -1;
  }

  return (
    <Card title="Runtime diagnostics" extra={`media core v${SPICE_MEDIA_CORE_VERSION}`}>
      <div style={{ display: 'grid', gap: 10, fontSize: '0.85rem', color: 'var(--spk-text-2, #a3a7b5)' }}>
        <div>Local lane: http://127.0.0.1:3939 · namespace header on every media call.</div>
        <div>
          Stored keys: {storedKeys < 0 ? 'storage unavailable' : `${storedKeys} of 4 present`} (token, profile, provider, boost).
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant="quiet" onClick={() => void ping()} disabled={busy}>
            {busy ? 'Probing…' : 'Probe local runtime'}
          </Button>
          {pingMs !== null && <span>Search round-trip: {pingMs} ms.</span>}
        </div>
        {pingError && <ErrorNote message={pingError} />}
        {pingMs === null && !pingError && <EmptyState message="The probe hits the same search path the player uses." />}
      </div>
    </Card>
  );
}
