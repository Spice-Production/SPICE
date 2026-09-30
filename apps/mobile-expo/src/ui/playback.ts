import { useEffect, useState } from 'react';

import { projectedProgressMs } from '../core/connect';
import type { RemoteDevice, Track } from '../core/models';
import type { PlayerState } from '../engine/engine';
import { useSpice } from './context';

export type ActivePlayback = {
  remote: boolean;
  device: RemoteDevice | null;
  track: Track | null;
  player: PlayerState;
  queue: Track[];
  queueIndex: number;
  resolving: boolean;
};

function remotePlayerState(device: RemoteDevice, nowMs: number): PlayerState {
  return {
    connected: true,
    mediaId: device.currentTrack?.id ?? '',
    title: device.currentTrack?.title ?? '',
    artist: device.currentTrack?.artist ?? '',
    artworkUrl: device.currentTrack?.artworkUrl ?? '',
    isPlaying: device.isPlaying,
    isBuffering: false,
    positionMs: projectedProgressMs(device.progressMs, device.durationMs, device.isPlaying, device.observedAtMs, nowMs),
    durationMs: device.durationMs,
    volume: device.volume,
    shuffleEnabled: device.shuffleEnabled,
    repeatMode: device.repeatMode,
    localCrossfadeSupported: false,
    error: null,
  };
}

/** The playback the controls act on: this phone, or the selected Spice Connect receiver. */
export function useActivePlayback(): ActivePlayback {
  const local = useSpice((state) => ({
    selectedId: state.selectedPlaybackDeviceId,
    devices: state.remoteDevices,
    currentTrack: state.currentTrack,
    player: state.player,
    queue: state.playbackQueue,
    queueIndex: state.queueIndex,
    resolvingTrackId: state.resolvingTrackId,
  }));
  const device = local.selectedId ? local.devices.find((entry) => entry.deviceId === local.selectedId) ?? null : null;
  const [now, setNow] = useState(() => Date.now());
  // Ticks only while the receiver plays; a stale clock just projects zero elapsed time.
  useEffect(() => {
    if (!device?.isPlaying) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [device?.deviceId, device?.isPlaying, device?.observedAtMs, device?.progressMs]);

  if (local.selectedId) {
    return {
      remote: true,
      device,
      track: device?.currentTrack ?? null,
      player: device ? remotePlayerState(device, now) : { ...local.player, isPlaying: false, positionMs: 0, durationMs: 0 },
      queue: device?.queue ?? [],
      queueIndex: device?.queueIndex ?? -1,
      resolving: false,
    };
  }
  return {
    remote: false,
    device: null,
    track: local.currentTrack,
    player: local.player,
    queue: local.queue,
    queueIndex: local.queueIndex,
    resolving: local.resolvingTrackId !== null,
  };
}
