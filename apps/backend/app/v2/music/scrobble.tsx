'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  beginProfileListenDelivery,
  createProfileListenDeliveryState,
  finishProfileListenDelivery,
  profileListenRetryDelayMs,
  type ProfileListenDeliveryState,
  type ProfileListenProvider,
  type ProfileListenType,
} from '@/lib/profile-listen-delivery';
import { profileScrobbleThresholdSeconds } from '../../spice-client-runtime';
import type { EngineTrack } from './engine';

const PROVIDERS: ProfileListenProvider[] = ['lastfm', 'listenbrainz'];

function trackPayload(track: EngineTrack) {
  return {
    title: track.title,
    artist: track.artists.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
    durationMs: track.durationMs,
    sourceId: track.sourceId ?? 'youtube_music',
    id: track.id,
  };
}

async function submitListen(
  token: string,
  type: ProfileListenType,
  track: EngineTrack,
  listenedAtSec?: number,
): Promise<Partial<Record<ProfileListenProvider, boolean>>> {
  const res = await fetch('/api/profile/listens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      type,
      track: trackPayload(track),
      providers: {},
      ...(listenedAtSec !== undefined ? { listenedAt: listenedAtSec } : {}),
    }),
  });
  if (!res.ok) return { lastfm: false, listenbrainz: false };
  const data = (await res.json().catch(() => ({}))) as {
    results?: Partial<Record<ProfileListenProvider, { ok?: boolean; skipped?: boolean }>>;
  };
  const out: Partial<Record<ProfileListenProvider, boolean>> = {};
  for (const provider of PROVIDERS) {
    const result = data.results?.[provider];
    // Skipped (unconnected provider) counts as resolved, not failure.
    out[provider] = result ? result.ok === true || result.skipped === true : false;
  }
  return out;
}

/**
 * Scrobble cycle for the current track: playing_now on start, scrobble
 * at half duration or four minutes (same threshold rule), with the
 * delivery state machine (attempts + backoff) around both submits.
 */
export function useScrobble(token: string | null, track: EngineTrack | null, playing: boolean) {
  const [scrobbled, setScrobbled] = useState(false);
  const cycleKey = token && track && playing ? `${token}:${track.sourceId ?? 'youtube_music'}:${track.id}` : null;
  const [seenCycle, setSeenCycle] = useState<string | null>(cycleKey);

  // Derived state: a new cycle (or its end) clears the marker.
  if (cycleKey !== seenCycle) {
    setSeenCycle(cycleKey);
    setScrobbled(false);
  }
  const cycleRef = useRef<{ key: string; state: ProfileListenDeliveryState; startedAtSec: number } | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thresholdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    if (thresholdRef.current) {
      clearTimeout(thresholdRef.current);
      thresholdRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimers();
    if (!token || !track || !playing) {
      cycleRef.current = null;
      return;
    }

    const key = `${track.sourceId ?? 'youtube_music'}:${track.id}`;
    const startedAtSec = Math.floor(Date.now() / 1000);
    const state = createProfileListenDeliveryState(key, startedAtSec);
    cycleRef.current = { key, state, startedAtSec };

    const attempt = (type: ProfileListenType) => {
      const cycle = cycleRef.current;
      if (!cycle || cycle.key !== key) return;
      const started = beginProfileListenDelivery(cycle.state, type, PROVIDERS, Date.now());
      if (started.length === 0) return;
      void submitListen(token, type, track, type === 'scrobble' ? cycle.startedAtSec : undefined)
        .then((results) => {
          const live = cycleRef.current;
          if (!live || live.key !== key) return;
          finishProfileListenDelivery(live.state, type, results, Date.now());
          if (type === 'scrobble' && started.every((p) => live.state.scrobble[p].sent)) setScrobbled(true);
          const retryMs = profileListenRetryDelayMs(live.state, type, PROVIDERS, Date.now());
          if (retryMs !== null) {
            retryRef.current = setTimeout(() => attempt(type), retryMs);
          }
        })
        .catch(() => {
          const live = cycleRef.current;
          if (!live || live.key !== key) return;
          finishProfileListenDelivery(live.state, type, { lastfm: false, listenbrainz: false }, Date.now());
        });
    };

    attempt('playing_now');
    const thresholdSec = profileScrobbleThresholdSeconds((track.durationMs ?? 0) / 1000);
    if (thresholdSec !== null) {
      thresholdRef.current = setTimeout(() => attempt('scrobble'), thresholdSec * 1000);
    }

    return () => {
      clearTimers();
    };
  }, [token, track, playing, clearTimers]);

  return { scrobbled };
}
