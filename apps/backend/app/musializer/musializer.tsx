'use client';

/**
 * Musializer's spectrum visualizer, driven by the audio the player is
 * actually producing. See analysis.ts for the port notes and attribution.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { analyze, buildGeometry, createGeometry, createMusializerState, FFT_SIZE } from './analysis';
import { audioTapSupported, createAudioTap } from './audio-tap';
import { createMusializerRenderer } from './renderer';
import s from './musializer.module.css';

/** Samples quieter than this count as silence when deciding to show the hint. */
const SIGNAL_FLOOR = 1e-4;
const NO_SIGNAL_AFTER_MS = 2500;

export function Musializer({
  audioElements,
  playing,
  fallback,
  className,
}: {
  /** Ref to the <audio> elements that may be playing (both crossfade slots). */
  audioElements: RefObject<ReadonlyArray<HTMLMediaElement | null>>;
  playing: boolean;
  /** Shown instead where the browser cannot capture element audio or lacks WebGL. */
  fallback: ReactNode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  const [unavailable, setUnavailable] = useState(() => !audioTapSupported());
  const [noSignal, setNoSignal] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createMusializerRenderer(canvas);
    const tap = renderer ? createAudioTap(() => audioElements.current) : null;
    if (!renderer || !tap) {
      renderer?.dispose();
      tap?.dispose();
      // Report on the next frame; this effect only wires up external systems.
      const reportFrame = requestAnimationFrame(() => setUnavailable(true));
      return () => cancelAnimationFrame(reportFrame);
    }

    const state = createMusializerState();
    const samples = new Float32Array(FFT_SIZE);
    const geometry = createGeometry(FFT_SIZE / 2);
    let lastFrame = performance.now();
    let lastSignal = lastFrame;
    let hintShown = false;
    let frame = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;

      tap.read(samples);
      let heard = false;
      for (let i = 0; i < FFT_SIZE; i += 64) {
        if (Math.abs(samples[i]) > SIGNAL_FLOOR) {
          heard = true;
          break;
        }
      }
      if (heard || !playingRef.current) lastSignal = now;
      const hint = now - lastSignal > NO_SIGNAL_AFTER_MS;
      if (hint !== hintShown) {
        hintShown = hint;
        setNoSignal(hint);
      }

      const bins = analyze(state, samples, dt);
      buildGeometry(state, bins, canvas.width, canvas.height, geometry);
      renderer.render(geometry, bins, canvas.width, canvas.height);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      tap.dispose();
      renderer.dispose();
    };
  }, [audioElements]);

  if (unavailable) return <>{fallback}</>;

  return (
    <div className={className ? `${s.frame} ${className}` : s.frame} aria-hidden="true">
      <canvas ref={canvasRef} className={s.canvas} />
      {/* Nothing to analyse (the track plays through the embedded video player). */}
      {noSignal ? <div className={s.standIn}>{fallback}</div> : null}
    </div>
  );
}
