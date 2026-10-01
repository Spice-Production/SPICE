import { Platform } from 'react-native';

import {
  SpiceEngine,
  type EngineCrossfadeArgs,
  type EngineFeedback,
  type EngineHistoryEntry,
  type EnginePlaybackContext,
  type EnginePlayerState,
  type EngineRepeatMode,
} from '../../modules/spice-engine';
import type { RepeatMode, ResolvedPlayback, SearchProvider, StreamQuality, Track } from '../core/models';
import { makeTrack } from '../core/models';
import { parseTrackPriorities, updateTrackPriorityPayload } from '../core/priorities';
import { SoundCloudClient, applePlayableStream } from '../core/soundcloud';
import { prefs } from '../data/prefs';

export type PlayerState = {
  connected: boolean;
  mediaId: string;
  title: string;
  artist: string;
  artworkUrl: string;
  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  localCrossfadeSupported: boolean;
  error: string | null;
};

export const EMPTY_PLAYER_STATE: PlayerState = {
  connected: false,
  mediaId: '',
  title: '',
  artist: '',
  artworkUrl: '',
  isPlaying: false,
  isBuffering: false,
  positionMs: 0,
  durationMs: 0,
  volume: 100,
  shuffleEnabled: false,
  repeatMode: 'Off',
  localCrossfadeSupported: false,
  error: null,
};

export type PlaybackContext = {
  queue: Track[];
  queueIndex: number;
  quality: StreamQuality;
  crossfadeDurationMs: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  shuffleRoundTrackKeys: string[];
  shuffleRoundPlayCount: number;
  playbackHistory: string[];
  playbackHistoryCursor: number;
};

export type CrossfadeRequest = {
  trackKey: string;
  track: Track;
  streamUrl: string;
  queueIndex: number;
  crossfadeDurationMs: number;
  startsNewShuffleRound: boolean;
  countsAsShuffleDraw: boolean;
  historyCursorTarget: number | null;
};

export type EngineListeners = {
  onPlayerState(state: PlayerState): void;
  onPlaybackEnded(mediaId: string): void;
  onTrackRepeated(): void;
  onCrossfadeCompleted(trackKey: string): void;
  onCrossfadeFailed(trackKey: string): void;
  onRemoteCommand(command: 'next' | 'previous'): void;
};

const UNAVAILABLE = 'The SPICE native audio engine is not available in this build.';

// The Android engine also resolves streams and stores shuffle priorities, so its
// playback service can continue the queue without JS. The iOS engine only plays
// audio: the app keeps running while audio plays, so those stay in JS there.
const nativeResolves = typeof SpiceEngine?.search === 'function';
const nativePriorities = typeof SpiceEngine?.trackPriority === 'function';

const soundCloud = new SoundCloudClient(
  (url, init) => fetch(url, init),
  Platform.OS === 'ios' ? applePlayableStream : undefined,
);

const PRIORITY_PREF = 'engine_track_priorities';
let priorityCache: { payload: string; scores: Map<string, number> } | null = null;

function jsPriorities() {
  const payload = prefs.getString(PRIORITY_PREF, '[]');
  if (priorityCache?.payload !== payload) priorityCache = { payload, scores: parseTrackPriorities(payload) };
  return priorityCache;
}

function native() {
  if (!SpiceEngine) throw new Error(UNAVAILABLE);
  return SpiceEngine;
}

function toEngineTrack(track: Track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl,
    sourceId: track.sourceId,
    localUri: track.localUri,
  };
}

function fromEngineTrack(track: Parameters<typeof makeTrack>[0]): Track {
  return makeTrack(track);
}

function toPlayerState(state: EnginePlayerState): PlayerState {
  return { ...state, repeatMode: state.repeatMode as RepeatMode, error: state.error ?? null };
}

function toEngineContext(context: PlaybackContext): EnginePlaybackContext {
  return { ...context, queue: context.queue.map(toEngineTrack), repeatMode: context.repeatMode as EngineRepeatMode };
}

/** Thin, typed facade over the native SpiceEngine module. */
export const engine = {
  available: SpiceEngine !== null,

  subscribe(listeners: EngineListeners): () => void {
    if (!SpiceEngine) return () => undefined;
    const subscriptions = [
      SpiceEngine.addListener('onPlayerState', (state) => listeners.onPlayerState(toPlayerState(state))),
      SpiceEngine.addListener('onPlaybackEnded', (event) => listeners.onPlaybackEnded(event.mediaId)),
      SpiceEngine.addListener('onTrackRepeated', () => listeners.onTrackRepeated()),
      SpiceEngine.addListener('onCrossfadeCompleted', (event) => listeners.onCrossfadeCompleted(event.trackKey)),
      SpiceEngine.addListener('onCrossfadeFailed', (event) => listeners.onCrossfadeFailed(event.trackKey)),
      SpiceEngine.addListener('onRemoteCommand', (event) => listeners.onRemoteCommand(event.command)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  },

  async connect(): Promise<PlayerState> {
    if (!SpiceEngine) return EMPTY_PLAYER_STATE;
    return toPlayerState(await SpiceEngine.connect());
  },

  /** Search sources this build can reach; YouTube needs the Android engine's extractor. */
  searchProviders: (nativeResolves ? ['All', 'YouTube', 'SoundCloud'] : ['SoundCloud']) as readonly SearchProvider[],

  async search(query: string, limit: number, provider: SearchProvider): Promise<Track[]> {
    if (!nativeResolves) return provider === 'YouTube' ? [] : soundCloud.search(query.trim(), Math.min(Math.max(limit, 1), 30));
    return (await native().search(query, limit, provider)).map(fromEngineTrack);
  },

  async resolvePlayable(track: Track, quality: StreamQuality): Promise<ResolvedPlayback> {
    if (!nativeResolves) return soundCloud.resolvePlayable(track, quality);
    const playback = await native().resolvePlayable(toEngineTrack(track), quality);
    return { track: fromEngineTrack(playback.track), stream: playback.stream, usedFallback: playback.usedFallback };
  },

  play(track: Track, streamUrl: string, context: PlaybackContext | null): void {
    void native().play(toEngineTrack(track), streamUrl, context ? toEngineContext(context) : null);
  },
  toggle: () => void SpiceEngine?.toggle(),
  pause: () => void SpiceEngine?.pause(),
  seekTo: (positionMs: number) => void SpiceEngine?.seekTo(Math.max(0, positionMs)),
  seekBy: (deltaMs: number) => void SpiceEngine?.seekBy(deltaMs),
  setVolume: (volume: number) => void SpiceEngine?.setVolume(Math.round(volume)),
  setShuffle: (enabled: boolean) => void SpiceEngine?.setShuffle(enabled),
  setRepeatMode: (mode: RepeatMode) => void SpiceEngine?.setRepeatMode(mode),
  stop: () => void SpiceEngine?.stop(),
  clearError: () => void SpiceEngine?.clearError(),
  updatePlaybackContextSettings: (quality: StreamQuality, crossfadeDurationMs: number) =>
    void SpiceEngine?.updatePlaybackContextSettings(quality, crossfadeDurationMs),

  async prepareCrossfade(request: CrossfadeRequest): Promise<boolean> {
    if (!SpiceEngine) return false;
    const args: EngineCrossfadeArgs = {
      ...request,
      track: toEngineTrack(request.track),
      historyCursorTarget: request.historyCursorTarget ?? -1,
    };
    return SpiceEngine.prepareCrossfade(args);
  },
  async startPreparedCrossfade(durationMs: number): Promise<boolean> {
    return SpiceEngine ? SpiceEngine.startPreparedCrossfade(durationMs) : false;
  },
  cancelPreparedCrossfade: () => void SpiceEngine?.cancelPreparedCrossfade(),

  async restoredPlaybackContext(mediaId: string): Promise<PlaybackContext | null> {
    if (!SpiceEngine) return null;
    const context = await SpiceEngine.restoredPlaybackContext(mediaId);
    if (!context) return null;
    return {
      ...context,
      queue: context.queue.map(fromEngineTrack),
      quality: context.quality as StreamQuality,
      repeatMode: context.repeatMode as RepeatMode,
    };
  },

  trackPriority(trackKey: string): number {
    if (!nativePriorities) return jsPriorities().scores.get(trackKey) ?? 0;
    return native().trackPriority(trackKey);
  },
  recordTrackFeedback(trackKey: string, feedback: EngineFeedback): number {
    if (!nativePriorities) {
      const update = updateTrackPriorityPayload(jsPriorities().payload, trackKey, feedback);
      prefs.set(PRIORITY_PREF, update.payload);
      return update.updatedScore;
    }
    return native().recordTrackFeedback(trackKey, feedback);
  },
  trackPriorityPayload(): string {
    return nativePriorities ? native().trackPriorityPayload() : jsPriorities().payload;
  },
  replaceTrackPriorities(payload: string): void {
    if (nativePriorities) native().replaceTrackPriorities(payload);
    else prefs.set(PRIORITY_PREF, payload);
  },
  drainBackgroundHistory(): (Track & { playedAt: number })[] {
    if (!SpiceEngine || typeof SpiceEngine.drainBackgroundHistory !== 'function') return [];
    return SpiceEngine.drainBackgroundHistory().map((entry: EngineHistoryEntry) => ({
      ...fromEngineTrack(entry),
      playedAt: entry.playedAt,
    }));
  },
};
