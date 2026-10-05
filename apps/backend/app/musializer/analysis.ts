/**
 * Spectrum analysis and frame geometry of Musializer, ported one-to-one to
 * TypeScript from `src/plug.c` (fft, fft_analyze, fft_render).
 *
 * Musializer — Copyright 2023 Alexey Kutepov <reximkut@gmail.com> and
 * Musializer Contributors, MIT License. https://github.com/tsoding/musializer
 *
 * Everything here is pure so it runs under Node tests; the WebGL renderer and
 * the audio capture live next to this file.
 */

export const FFT_SIZE = 1 << 13;

/** Background the visualizer is drawn on (`COLOR_BACKGROUND`, 0x151515FF). */
export const BACKGROUND_RGB: readonly [number, number, number] = [0x15, 0x15, 0x15];

// plug.c computes the bin edges in 32-bit floats; `ceilf(f*step)` lands on a
// different integer in doubles at exact boundaries (50 * 1.06), so match it.
const STEP = Math.fround(1.06);
const SMOOTHNESS = 8;
const SMEARNESS = 3;
/** Frames longer than this (a throttled tab) would overshoot the smoothing. */
const MAX_FRAME_SECONDS = 0.1;

const SATURATION = 0.75;
const VALUE = 1.0;

export type MusializerState = {
  inWin: Float32Array;
  outRe: Float32Array;
  outIm: Float32Array;
  outLog: Float32Array;
  outSmooth: Float32Array;
  outSmear: Float32Array;
};

export function createMusializerState(): MusializerState {
  return {
    inWin: new Float32Array(FFT_SIZE),
    outRe: new Float32Array(FFT_SIZE),
    outIm: new Float32Array(FFT_SIZE),
    outLog: new Float32Array(FFT_SIZE),
    outSmooth: new Float32Array(FFT_SIZE),
    outSmear: new Float32Array(FFT_SIZE),
  };
}

/** Iterative radix-2 FFT of a real signal (cp-algorithms, as in plug.c). */
export function fft(input: Float32Array, re: Float32Array, im: Float32Array, n: number): void {
  for (let i = 0; i < n; i += 1) {
    re[i] = input[i];
    im[i] = 0;
  }

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j += 1) {
        const a = i + j;
        const b = a + half;
        const vRe = re[b] * wRe - im[b] * wIm;
        const vIm = re[b] * wIm + im[b] * wRe;
        const uRe = re[a];
        const uIm = im[a];
        re[a] = uRe + vRe;
        im[a] = uIm + vIm;
        re[b] = uRe - vRe;
        im[b] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

/**
 * One analysis step over the latest FFT_SIZE samples of the left channel.
 * Returns `m`, the number of logarithmic bins now held in the state.
 */
export function analyze(state: MusializerState, inRaw: Float32Array, dt: number): number {
  // Apply the Hann Window on the Input - https://en.wikipedia.org/wiki/Hann_function
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const t = i / (FFT_SIZE - 1);
    const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
    state.inWin[i] = inRaw[i] * hann;
  }

  fft(state.inWin, state.outRe, state.outIm, FFT_SIZE);

  // "Squash" into the Logarithmic Scale
  const lowf = 1;
  let m = 0;
  let maxAmp = 1;
  for (let f = lowf; Math.trunc(f) < FFT_SIZE / 2; f = Math.ceil(Math.fround(f * STEP))) {
    const f1 = Math.ceil(Math.fround(f * STEP));
    let a = 0;
    for (let q = Math.trunc(f); q < FFT_SIZE / 2 && q < Math.trunc(f1); q += 1) {
      const real = state.outRe[q];
      const imag = state.outIm[q];
      const b = Math.log(real * real + imag * imag);
      if (b > a) a = b;
    }
    if (maxAmp < a) maxAmp = a;
    state.outLog[m] = a;
    m += 1;
  }

  // Normalize Frequencies to 0..1 range
  for (let i = 0; i < m; i += 1) {
    state.outLog[i] /= maxAmp;
  }

  // Smooth out and smear the values
  const step = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS);
  for (let i = 0; i < m; i += 1) {
    state.outSmooth[i] += (state.outLog[i] - state.outSmooth[i]) * SMOOTHNESS * step;
    state.outSmear[i] += (state.outSmooth[i] - state.outSmear[i]) * SMEARNESS * step;
  }

  return m;
}

/** True once every bar has fallen back to rest (`fft_settled`). */
export function isSettled(state: MusializerState, m: number): boolean {
  const eps = 1e-3;
  for (let i = 0; i < m; i += 1) {
    if (state.outSmooth[i] > eps || state.outSmear[i] > eps) return false;
  }
  return true;
}

/** raylib's ColorFromHSV, 8-bit channels. `hue` is in degrees. */
export function colorFromHSV(hue: number, saturation: number, value: number): [number, number, number] {
  const channel = (offset: number) => {
    let k = (offset + hue / 60) % 6;
    const t = 4 - k;
    k = t < k ? t : k;
    k = k < 1 ? k : 1;
    k = k > 0 ? k : 0;
    return Math.trunc((value - value * saturation * k) * 255);
  };
  return [channel(5), channel(3), channel(1)];
}

/** Interleaved quads: x, y, u, v, r, g, b, a (pixels, texture coords, 0..1 colour). */
export const FLOATS_PER_VERTEX = 8;
export const VERTICES_PER_QUAD = 6;

export type MusializerGeometry = {
  /** Solid bars (`DrawLineEx`). */
  bars: Float32Array;
  /** Trails between the smeared and the smoothed height (circle shader, radius 0.3, power 3). */
  smears: Float32Array;
  /** Glowing caps (circle shader, radius 0.07, power 5). */
  circles: Float32Array;
};

export function createGeometry(maxBins: number): MusializerGeometry {
  const size = maxBins * VERTICES_PER_QUAD * FLOATS_PER_VERTEX;
  return { bars: new Float32Array(size), smears: new Float32Array(size), circles: new Float32Array(size) };
}

function writeQuad(
  out: Float32Array,
  index: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v0: number,
  v1: number,
  color: readonly [number, number, number],
): void {
  const r = color[0] / 255;
  const g = color[1] / 255;
  const b = color[2] / 255;
  let offset = index * VERTICES_PER_QUAD * FLOATS_PER_VERTEX;
  const put = (x: number, y: number, u: number, v: number) => {
    out[offset] = x;
    out[offset + 1] = y;
    out[offset + 2] = u;
    out[offset + 3] = v;
    out[offset + 4] = r;
    out[offset + 5] = g;
    out[offset + 6] = b;
    out[offset + 7] = 1;
    offset += FLOATS_PER_VERTEX;
  };
  put(x0, y0, 0, v0);
  put(x0, y1, 0, v1);
  put(x1, y1, 1, v1);
  put(x0, y0, 0, v0);
  put(x1, y1, 1, v1);
  put(x1, y0, 1, v0);
}

/**
 * The quads `fft_render` draws for a boundary at the origin, `width` by
 * `height` pixels with y growing downward. Returns the bin count written.
 */
export function buildGeometry(state: MusializerState, m: number, width: number, height: number, out: MusializerGeometry): number {
  // The width of a single bar
  const cellWidth = width / m;

  for (let i = 0; i < m; i += 1) {
    const color = colorFromHSV((i / m) * 360, SATURATION, VALUE);
    const x = i * cellWidth + cellWidth / 2;

    // Display the Bars
    const t = state.outSmooth[i];
    const top = height - ((height * 2) / 3) * t;
    const thick = (cellWidth / 3) * Math.sqrt(Math.max(t, 0));
    writeQuad(out.bars, i, x - thick / 2, top, x + thick / 2, height, 0, 1, color);

    // Display the Smears
    const startY = height - ((height * 2) / 3) * state.outSmear[i];
    const smearRadius = cellWidth * 3 * Math.sqrt(Math.max(t, 0));
    if (top >= startY) {
      // Falling bar: the upper half of the glow, brightest at the bar's tip.
      writeQuad(out.smears, i, x - smearRadius / 2, startY, x + smearRadius / 2, top, 0, 0.5, color);
    } else {
      writeQuad(out.smears, i, x - smearRadius / 2, top, x + smearRadius / 2, startY, 0.5, 1, color);
    }

    // Display the Circles
    const radius = cellWidth * 6 * Math.sqrt(Math.max(t, 0));
    writeQuad(out.circles, i, x - radius, top - radius, x + radius, top + radius, 0, 1, color);
  }

  return m;
}
