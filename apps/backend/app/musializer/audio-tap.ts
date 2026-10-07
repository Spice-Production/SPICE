/**
 * Reads the raw samples the player's <audio> elements are playing, for the
 * visualizer's own FFT.
 *
 * The tap listens through `captureStream()`, which hands over a copy of the
 * element's audio and leaves normal playback (and the volume-boost graph)
 * untouched. Routing the elements through `createMediaElementSource` instead
 * would move playback itself into an AudioContext for the rest of the session.
 */

import { FFT_SIZE } from './analysis';

type CapturableMedia = HTMLMediaElement & { captureStream?: () => MediaStream };

type Binding = { stream: MediaStream; trackId: string; node: MediaStreamAudioSourceNode | null };

// One captured stream per element for the page's lifetime; taps come and go.
const capturedStreams = new WeakMap<HTMLMediaElement, MediaStream>();

/**
 * Firefox only has `mozCaptureStream`, which silences the element it captures,
 * and Safari has no media-element capture, so those browsers get no tap.
 */
export function audioTapSupported(): boolean {
  if (typeof window === 'undefined' || typeof HTMLMediaElement === 'undefined') return false;
  const hasContext = typeof window.AudioContext !== 'undefined';
  return hasContext && typeof (HTMLMediaElement.prototype as CapturableMedia).captureStream === 'function';
}

export type AudioTap = {
  /** Fills `target` (FFT_SIZE samples) with the latest left-channel audio. */
  read(target: Float32Array<ArrayBuffer>): void;
  dispose(): void;
};

export function createAudioTap(getElements: () => ReadonlyArray<HTMLMediaElement | null>): AudioTap | null {
  if (!audioTapSupported()) return null;

  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }

  // Sources mix into one bus; Musializer analyses the left channel only.
  const bus = context.createGain();
  const splitter = context.createChannelSplitter(2);
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  // A muted path to the output keeps every browser pulling the graph.
  const silence = context.createGain();
  silence.gain.value = 0;
  bus.connect(splitter);
  splitter.connect(analyser, 0);
  analyser.connect(silence);
  silence.connect(context.destination);

  const bindings = new Map<HTMLMediaElement, Binding>();

  const bind = (element: HTMLMediaElement) => {
    let stream = capturedStreams.get(element);
    if (!stream) {
      try {
        stream = (element as CapturableMedia).captureStream?.();
      } catch {
        stream = undefined;
      }
      if (!stream) return;
      capturedStreams.set(element, stream);
    }
    let binding = bindings.get(element);
    if (!binding) {
      binding = { stream, trackId: '', node: null };
      bindings.set(element, binding);
    }
    // Loading another song adds a new audio track to the stream, while the
    // previous one stays "live" but silent. The newest live track carries sound.
    const track = stream.getAudioTracks().findLast((candidate) => candidate.readyState === 'live');
    const trackId = track?.id ?? '';
    if (trackId === binding.trackId) return;
    binding.node?.disconnect();
    binding.node = null;
    binding.trackId = trackId;
    if (!track) return;
    try {
      binding.node = context.createMediaStreamSource(new MediaStream([track]));
      binding.node.connect(bus);
    } catch {
      binding.trackId = '';
    }
  };

  return {
    read(target) {
      for (const element of getElements()) {
        if (element) bind(element);
      }
      // Created outside a user gesture the context starts suspended.
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      analyser.getFloatTimeDomainData(target);
    },
    dispose() {
      for (const binding of bindings.values()) binding.node?.disconnect();
      bindings.clear();
      void context.close().catch(() => undefined);
    },
  };
}
