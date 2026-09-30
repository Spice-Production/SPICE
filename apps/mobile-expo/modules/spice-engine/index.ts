import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type EngineTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUrl: string;
  sourceId: string;
  localUri: string;
};

export type EngineStream = {
  url: string;
  container: string;
  bitrate: number;
  protocol: string;
  contentType: string;
  expiresAt: string;
};

export type EngineResolvedPlayback = {
  track: EngineTrack;
  stream: EngineStream;
  usedFallback: boolean;
};

export type EngineRepeatMode = 'Off' | 'All' | 'One';
export type EngineQuality = 'High' | 'Standard' | 'DataSaver';
export type EngineSearchProvider = 'All' | 'YouTube' | 'SoundCloud';
export type EngineFeedback = 'Completed' | 'EarlySkip' | 'LateSkip';

export type EnginePlayerState = {
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
  repeatMode: EngineRepeatMode;
  localCrossfadeSupported: boolean;
  error: string | null;
};

export type EnginePlaybackContext = {
  queue: EngineTrack[];
  queueIndex: number;
  quality: EngineQuality;
  crossfadeDurationMs: number;
  repeatMode: EngineRepeatMode;
  shuffleEnabled: boolean;
  shuffleRoundTrackKeys: string[];
  shuffleRoundPlayCount: number;
  playbackHistory: string[];
  playbackHistoryCursor: number;
};

export type EngineCrossfadeArgs = {
  trackKey: string;
  track: EngineTrack;
  streamUrl: string;
  queueIndex: number;
  crossfadeDurationMs: number;
  startsNewShuffleRound: boolean;
  countsAsShuffleDraw: boolean;
  historyCursorTarget: number;
};

export type EngineHistoryEntry = EngineTrack & { playedAt: number };

type SpiceEngineEvents = {
  onPlayerState(state: EnginePlayerState): void;
  onPlaybackEnded(event: { mediaId: string }): void;
  onTrackRepeated(event: Record<string, never>): void;
  onCrossfadeCompleted(event: { trackKey: string }): void;
  onCrossfadeFailed(event: { trackKey: string }): void;
};

declare class SpiceEngineModule extends NativeModule<SpiceEngineEvents> {
  search(query: string, limit: number, provider: EngineSearchProvider): Promise<EngineTrack[]>;
  resolvePlayable(track: EngineTrack, quality: EngineQuality): Promise<EngineResolvedPlayback>;
  connect(): Promise<EnginePlayerState>;
  play(track: EngineTrack, streamUrl: string, context: EnginePlaybackContext | null): Promise<void>;
  toggle(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  seekBy(deltaMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: EngineRepeatMode): Promise<void>;
  stop(): Promise<void>;
  clearError(): Promise<void>;
  updatePlaybackContextSettings(quality: EngineQuality, crossfadeDurationMs: number): Promise<void>;
  prepareCrossfade(args: EngineCrossfadeArgs): Promise<boolean>;
  startPreparedCrossfade(durationMs: number): Promise<boolean>;
  cancelPreparedCrossfade(): Promise<void>;
  restoredPlaybackContext(mediaId: string): Promise<EnginePlaybackContext | null>;
  trackPriority(trackKey: string): number;
  trackPriorities(trackKeys: string[]): Record<string, number>;
  recordTrackFeedback(trackKey: string, feedback: EngineFeedback): number;
  trackPriorityPayload(): string;
  replaceTrackPriorities(payload: string): void;
  drainBackgroundHistory(): EngineHistoryEntry[];
}

/** Null on platforms without the native engine (iOS until its engine lands, tests). */
export const SpiceEngine = requireOptionalNativeModule<SpiceEngineModule>('SpiceEngine');
