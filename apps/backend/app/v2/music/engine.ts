'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createCrossfadePlan,
  crossfadeGains,
  crossfadeStateAt,
  type CrossfadeCurve,
  type CrossfadePlan,
} from '../../crossfade';
import {
  normalizePlayerVolume,
  playerVolumeGain,
  shouldUsePlayerGainPath,
} from '@/lib/player-audio';
import { localGet, resolvePath, searchPath, sourceForTrack, type MusicSource } from './transport';

export interface EngineArtist {
  id: string;
  name: string;
}

export interface EngineTrack {
  id: string;
  title: string;
  artists: EngineArtist[];
  durationMs?: number;
  artworkUrl?: string;
  sourceId?: string;
}

export interface EngineStream {
  url: string;
  codec: string;
  bitrate: number;
  container: string;
  itag: number;
  capped?: boolean;
}

export type EngineStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type EngineRepeat = 'none' | 'all' | 'one';

const SHUFFLE_KEY = 'spice_is_shuffle';
const REPEAT_KEY = 'spice_repeat_mode';

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function readStoredFlag(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function readStoredRepeat(): EngineRepeat {
  try {
    const value = typeof window !== 'undefined' ? window.localStorage.getItem(REPEAT_KEY) : null;
    return value === 'none' || value === 'all' || value === 'one' ? value : 'all';
  } catch {
    return 'all';
  }
}

export interface EnginePlaybackSettings {
  crossfadeEnabled: boolean;
  crossfadeMs: number;
  curve: CrossfadeCurve;
}

const BOOST_KEY = 'spice_volume_booster_accepted';

/**
 * Best-variant pick mirroring the original sort: AAC/m4a first, then
 * bitrate. Capped (PO-token-less ~1 MB) variants are a last resort and
 * the caller is told so it can warn.
 */
export function pickBestStream(streams: EngineStream[]): { stream: EngineStream | null; capped: boolean } {
  if (streams.length === 0) return { stream: null, capped: false };
  const scored = streams.map((stream) => {
    const format = `${stream.codec} ${stream.container}`.toLowerCase();
    const aac = format.includes('mp4a') || format.includes('aac') || stream.container.toLowerCase() === 'm4a' ? 100 : 0;
    return { stream, score: (stream.capped ? 0 : 1000) + aac + stream.bitrate / 1000 };
  });
  scored.sort((a, b) => b.score - a.score);
  return { stream: scored[0].stream, capped: scored[0].stream.capped === true };
}

export function formatMs(value?: number): string {
  if (!value || value <= 0) return '0:00';
  const total = Math.floor(value / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Resolve a track to its best playable stream URL (shared by the player and downloads). */
export async function resolveTrackStream(track: EngineTrack): Promise<{ url: string; capped: boolean }> {
  const source = sourceForTrack(track.sourceId);
  const data = await localGet<{ streams?: EngineStream[] }>(resolvePath(source, track.id));
  const { stream, capped: isCapped } = pickBestStream(data.streams ?? []);
  if (!stream) throw new Error('No playable stream for this track.');
  return { url: stream.url, capped: isCapped };
}

interface Slot {
  el: HTMLAudioElement | null;
  gain: GainNode | null;
}

interface Prefetched {
  track: EngineTrack;
  url: string;
  capped: boolean;
}

/**
 * Slice-4 engine: dual audio slots with planned crossfades (same plan /
 * state / gain math as the original) plus the gain-node boost path past
 * volume 100 (same volume model + storage key). Manual skips and seeks
 * cut the fade; natural endings ride it.
 */
export function useMusicEngine(settings: EnginePlaybackSettings) {
  const slotsRef = useRef<Slot[]>([{ el: null, gain: null }, { el: null, gain: null }]);
  const ctxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(0);
  const queueRef = useRef<EngineTrack[]>([]);
  const orderRef = useRef<EngineTrack[]>([]);
  const planRef = useRef<CrossfadePlan | null>(null);
  const prefetchRef = useRef<Prefetched | null>(null);
  const incomingRef = useRef<EngineTrack | null>(null);
  const fadingRef = useRef(false);

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [current, setCurrent] = useState<EngineTrack | null>(null);
  const [queue, setQueue] = useState<EngineTrack[]>([]);
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolumeState] = useState(100);
  const [boosterAccepted, setBoosterAccepted] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(BOOST_KEY) === 'true';
    } catch {
      /* private mode: boost asks every visit */
      return false;
    }
  });
  const [shuffle, setShuffleState] = useState(() => readStoredFlag(SHUFFLE_KEY));
  const [repeat, setRepeatState] = useState<EngineRepeat>(() => readStoredRepeat());
  const [order, setOrder] = useState<EngineTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [resolving, setResolving] = useState(false);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const repeatRef = useRef(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  const applyOrder = useCallback((list: EngineTrack[], anchorId: string | null, shuffleOn: boolean) => {
    const anchor = anchorId ? list.find((item) => item.id === anchorId) : undefined;
    const rest = anchor ? list.filter((item) => item.id !== anchor.id) : [...list];
    const next = anchor ? [anchor, ...(shuffleOn ? shuffled(rest) : rest)] : shuffleOn ? shuffled(list) : [...list];
    orderRef.current = next;
    setOrder(next);
  }, []);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      slotsRef.current.forEach((slot) => {
        if (slot.el && !slot.gain) {
          const node = ctx.createGain();
          ctx.createMediaElementSource(slot.el).connect(node).connect(ctx.destination);
          slot.gain = node;
        }
      });
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const renderVolumes = useCallback((fadeA = 1, fadeB = 1) => {
    const master = playerVolumeGain(volumeRef.current);
    const gains = [fadeA * master, fadeB * master];
    const ctx = ctxRef.current;
    slotsRef.current.forEach((slot, i) => {
      if (!slot.el) return;
      if (ctx && slot.gain) {
        slot.el.volume = 1;
        slot.gain.gain.value = gains[i];
      } else {
        slot.el.volume = Math.min(1, gains[i]);
      }
    });
  }, []);

  const cancelFade = useCallback(() => {
    const incoming = 1 - activeRef.current;
    slotsRef.current[incoming].el?.pause();
    incomingRef.current = null;
    prefetchRef.current = null;
    fadingRef.current = false;
    planRef.current = null;
    renderVolumes();
  }, [renderVolumes]);

  const stopAll = useCallback(() => {
    slotsRef.current.forEach((slot) => {
      slot.el?.pause();
    });
    incomingRef.current = null;
    prefetchRef.current = null;
    fadingRef.current = false;
    planRef.current = null;
  }, []);

  const resolveTrackUrl = useCallback(async (track: EngineTrack): Promise<{ url: string; capped: boolean }> => {
    return resolveTrackStream(track);
  }, []);

  const startOnSlot = useCallback(async (slotIdx: number, url: string) => {
    const slot = slotsRef.current[slotIdx];
    if (!slot.el) return;
    slot.el.src = url;
    setProgressMs(0);
    await slot.el.play();
  }, []);

  const finalizeFade = useCallback(() => {
    const incoming = incomingRef.current;
    if (!incoming) return;
    const oldActive = activeRef.current;
    slotsRef.current[oldActive].el?.pause();
    activeRef.current = 1 - oldActive;
    incomingRef.current = null;
    prefetchRef.current = null;
    fadingRef.current = false;
    setCurrent(incoming);
    setStatus('playing');
    renderVolumes();
    const duration = incoming.durationMs ?? 0;
    planRef.current = settingsRef.current.crossfadeEnabled && duration > 0
      ? createCrossfadePlan({ trackDurationMs: duration, crossfadeDurationMs: settingsRef.current.crossfadeMs })
      : null;
  }, [renderVolumes]);

  const playTrack = useCallback(
    async (track: EngineTrack, nextQueue?: EngineTrack[]) => {
      if (nextQueue) {
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        applyOrder(nextQueue, track.id, shuffle);
      }
      stopAll();
      activeRef.current = 0;
      renderVolumes();
      setCurrent(track);
      setError(null);
      setCapped(false);
      setStatus('loading');
      setResolving(true);
      try {
        const { url, capped: isCapped } = await resolveTrackUrl(track);
        setCapped(isCapped);
        await startOnSlot(0, url);
        setStatus('playing');
        const duration = track.durationMs ?? 0;
        planRef.current = settingsRef.current.crossfadeEnabled && duration > 0
          ? createCrossfadePlan({ trackDurationMs: duration, crossfadeDurationMs: settingsRef.current.crossfadeMs })
          : null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not play this track.');
        setStatus('error');
      } finally {
        setResolving(false);
      }
    },
    [resolveTrackUrl, startOnSlot, stopAll, renderVolumes, applyOrder, shuffle],
  );

  const peekNext = useCallback(
    (fromId: string | null): EngineTrack | null => {
      const list = orderRef.current;
      if (list.length === 0) return null;
      if (!fromId) return list[0];
      const index = list.findIndex((item) => item.id === fromId);
      if (index < 0) return list[0] ?? null;
      return list[index + 1] ?? null;
    },
    [],
  );

  const replayCurrent = useCallback(() => {
    const el = slotsRef.current[activeRef.current].el;
    if (!el || !current) return;
    cancelFade();
    el.currentTime = 0;
    setProgressMs(0);
    void el.play().then(() => setStatus('playing')).catch(() => setStatus('error'));
  }, [current, cancelFade]);

  const autoAdvance = useCallback(() => {
    const mode = repeatRef.current;
    if (mode === 'one') {
      replayCurrent();
      return;
    }
    const list = orderRef.current;
    const atEnd = current ? list.findIndex((item) => item.id === current.id) >= list.length - 1 : true;
    if (mode === 'none' && atEnd) {
      cancelFade();
      setStatus('paused');
      return;
    }
    const next = current ? peekNext(current.id) : (list[0] ?? null);
    const target = next ?? list[0] ?? null;
    if (target) void playTrack(target);
  }, [current, peekNext, playTrack, replayCurrent, cancelFade]);

  const advance = useCallback(
    (delta: 1 | -1) => {
      const list = orderRef.current;
      if (!current || list.length === 0) return;
      const index = list.findIndex((item) => item.id === current.id);
      const at = index < 0 ? 0 : index;
      const next = list[(at + delta + list.length) % list.length];
      if (next) void playTrack(next);
    },
    [current, playTrack],
  );

  const toggleShuffle = useCallback(() => {
    const next = !shuffle;
    setShuffleState(next);
    try {
      window.localStorage.setItem(SHUFFLE_KEY, String(next));
    } catch {
      /* private mode: shuffle lasts the visit */
    }
    applyOrder(queueRef.current, current?.id ?? null, next);
  }, [shuffle, current, applyOrder]);

  const cycleRepeat = useCallback(() => {
    const order: EngineRepeat[] = ['none', 'all', 'one'];
    const next = order[(order.indexOf(repeat) + 1) % order.length];
    setRepeatState(next);
    try {
      window.localStorage.setItem(REPEAT_KEY, next);
    } catch {
      /* private mode: repeat lasts the visit */
    }
  }, [repeat]);

  const playAt = useCallback(
    (index: number) => {
      const target = orderRef.current[index];
      if (target) void playTrack(target);
    },
    [playTrack],
  );

  const removeFromQueue = useCallback(
    (trackId: string) => {
      const nextQueue = queueRef.current.filter((item) => item.id !== trackId);
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      if (current && current.id === trackId) {
        const anchor = orderRef.current.find((item) => item.id !== trackId) ?? nextQueue[0] ?? null;
        applyOrder(nextQueue, anchor?.id ?? null, shuffle);
        if (anchor) void playTrack(anchor);
        else {
          stopAll();
          setCurrent(null);
          setStatus('idle');
        }
        return;
      }
      applyOrder(nextQueue, current?.id ?? null, shuffle);
    },
    [current, shuffle, applyOrder, playTrack, stopAll],
  );

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueue([]);
    applyOrder([], null, shuffle);
    stopAll();
    setCurrent(null);
    setStatus('idle');
    setProgressMs(0);
  }, [shuffle, applyOrder, stopAll]);

  const handleTick = useCallback(
    (slotIdx: number) => {
      const slot = slotsRef.current[slotIdx];
      if (!slot.el || slotIdx !== activeRef.current) return;
      const el = slot.el;
      setProgressMs(Math.floor(el.currentTime * 1000));
      if (Number.isFinite(el.duration)) setDurationMs(Math.floor(el.duration * 1000));

      const plan = planRef.current;
      const cfg = settingsRef.current;
      // Repeat-one replays the same track: no prefetch, no fade.
      if (!plan || !cfg.crossfadeEnabled || !plan.enabled || repeatRef.current === 'one') return;
      const posMs = Math.floor(el.currentTime * 1000);
      const st = crossfadeStateAt(plan, posMs);

      if (st.shouldPreload && !prefetchRef.current && !incomingRef.current) {
        const target = current ? peekNext(current.id) : null;
        if (target && target.id !== current?.id) {
          void resolveTrackUrl(target)
            .then(({ url, capped: isCapped }) => {
              prefetchRef.current = { track: target, url, capped: isCapped };
            })
            .catch(() => {
              /* unresolvable next: the ending plays out as a hard cut */
            });
        }
      }

      if (st.phase === 'fading' && prefetchRef.current && !incomingRef.current) {
        const incoming = 1 - activeRef.current;
        incomingRef.current = prefetchRef.current.track;
        fadingRef.current = true;
        setCapped(prefetchRef.current.capped);
        void startOnSlot(incoming, prefetchRef.current.url).catch(() => {
          incomingRef.current = null;
          fadingRef.current = false;
          renderVolumes();
        });
      }

      if (fadingRef.current) {
        const gains = crossfadeGains(st.progress, cfg.curve);
        const outgoing = activeRef.current;
        renderVolumes(outgoing === 0 ? gains.outgoing : gains.incoming, outgoing === 0 ? gains.incoming : gains.outgoing);
      }

      if (st.phase === 'complete' && fadingRef.current) finalizeFade();
    },
    [current, finalizeFade, peekNext, renderVolumes, resolveTrackUrl, startOnSlot],
  );

  const handleEnded = useCallback(
    (slotIdx: number) => {
      if (slotIdx === activeRef.current && fadingRef.current && incomingRef.current) {
        finalizeFade();
        return;
      }
      if (slotIdx === activeRef.current) autoAdvance();
    },
    [autoAdvance, finalizeFade],
  );

  const tickRef = useRef(handleTick);
  useEffect(() => {
    tickRef.current = handleTick;
  }, [handleTick]);
  const endedRef = useRef(handleEnded);
  useEffect(() => {
    endedRef.current = handleEnded;
  }, [handleEnded]);

  useEffect(() => {
    const liveSlots = slotsRef.current;
    const slots = liveSlots.map((slot) => {
      const el = new Audio();
      el.preload = 'metadata';
      slot.el = el;
      const onTick = () => tickRef.current(slotsRef.current.findIndex((s) => s.el === el));
      const onMeta = () => {
        if (Number.isFinite(el.duration)) setDurationMs(Math.floor(el.duration * 1000));
      };
      const onEnded = () => endedRef.current(slotsRef.current.findIndex((s) => s.el === el));
      const onError = () => {
        setError('Playback failed for this track.');
        setStatus('error');
      };
      el.addEventListener('timeupdate', onTick);
      el.addEventListener('loadedmetadata', onMeta);
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onError);
      return { el, onTick, onMeta, onEnded, onError };
    });
    if (ctxRef.current) {
      slotsRef.current.forEach((slot) => {
        if (slot.el && !slot.gain && ctxRef.current) {
          const node = ctxRef.current.createGain();
          ctxRef.current.createMediaElementSource(slot.el).connect(node).connect(ctxRef.current.destination);
          slot.gain = node;
        }
      });
    }
    return () => {
      slots.forEach(({ el, onTick, onMeta, onEnded, onError }) => {
        el.pause();
        el.removeEventListener('timeupdate', onTick);
        el.removeEventListener('loadedmetadata', onMeta);
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onError);
      });
      liveSlots.forEach((slot) => {
        slot.el = null;
        slot.gain = null;
      });
    };
  }, []);

  const toggle = useCallback(() => {
    const el = slotsRef.current[activeRef.current].el;
    if (!el || !current) return;
    if (el.paused) {
      ensureCtx();
      void el.play().then(() => setStatus('playing')).catch(() => setStatus('error'));
    } else {
      el.pause();
      setStatus('paused');
    }
  }, [current, ensureCtx]);

  const seek = useCallback(
    (ms: number) => {
      cancelFade();
      const el = slotsRef.current[activeRef.current].el;
      if (!el) return;
      el.currentTime = Math.max(0, ms / 1000);
      setProgressMs(ms);
    },
    [cancelFade],
  );

  const setVolume = useCallback(
    (value: number) => {
      const normalized = normalizePlayerVolume(value, boosterAccepted) ?? 100;
      // Past 100 needs the boost gain path, which needs explicit consent.
      const safe = !boosterAccepted && normalized > 100 ? 100 : normalized;
      setVolumeState(safe);
      if (shouldUsePlayerGainPath(safe, boosterAccepted)) ensureCtx();
      renderVolumes();
    },
    [boosterAccepted, ensureCtx, renderVolumes],
  );

  const acceptBoost = useCallback(() => {
    setBoosterAccepted(true);
    try {
      window.localStorage.setItem(BOOST_KEY, 'true');
    } catch {
      /* private mode: boost lasts the visit */
    }
    ensureCtx();
    renderVolumes();
  }, [ensureCtx, renderVolumes]);

  const search = useCallback(async (q: string, source: MusicSource): Promise<EngineTrack[]> => {
    const data = await localGet<{ tracks?: EngineTrack[] }>(searchPath(source), { q, limit: 12 });
    return Array.isArray(data.tracks) ? data.tracks : [];
  }, []);

  return {
    status, current, queue, order, shuffle, repeat, progressMs, durationMs, volume, boosterAccepted, error, capped, resolving,
    search, playTrack, toggle, next: () => advance(1), prev: () => advance(-1),
    seek, setVolume, acceptBoost, toggleShuffle, cycleRepeat, playAt, removeFromQueue, clearQueue,
  };
}
