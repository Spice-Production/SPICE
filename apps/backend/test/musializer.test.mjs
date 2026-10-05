import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyze,
  buildGeometry,
  colorFromHSV,
  createGeometry,
  createMusializerState,
  fft,
  FFT_SIZE,
  FLOATS_PER_VERTEX,
  isSettled,
  VERTICES_PER_QUAD,
} from '../app/musializer/analysis.ts';

function sine(bin, amplitude = 1) {
  const samples = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) samples[i] = amplitude * Math.sin((2 * Math.PI * bin * i) / FFT_SIZE);
  return samples;
}

/** The logarithmic bin edges plug.c walks with 32-bit floats. */
function binEdges() {
  const step = Math.fround(1.06);
  const edges = [];
  for (let f = 1; Math.trunc(f) < FFT_SIZE / 2; f = Math.ceil(Math.fround(f * step))) edges.push(f);
  return edges;
}

test('the FFT puts a pure tone in its own bin', () => {
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  fft(sine(100), re, im, FFT_SIZE);
  let peak = 0;
  for (let q = 1; q < FFT_SIZE / 2; q += 1) {
    if (Math.hypot(re[q], im[q]) > Math.hypot(re[peak], im[peak])) peak = q;
  }
  assert.equal(peak, 100);
  assert.ok(Math.abs(Math.hypot(re[100], im[100]) - FFT_SIZE / 2) < 1);
  assert.ok(Math.hypot(re[300], im[300]) < 1e-2);
});

test('bin edges follow plug.c float rounding', () => {
  const edges = binEdges();
  // 50 * 1.06 is 53 in 32-bit floats; doubles would round it up to 54.
  assert.equal(edges[edges.indexOf(50) + 1], 53);
  assert.deepEqual(edges.slice(0, 6), [1, 2, 3, 4, 5, 6]);
  assert.ok(edges.at(-1) < FFT_SIZE / 2);
});

test('silence analyses to nothing and stays settled', () => {
  const state = createMusializerState();
  const bins = analyze(state, new Float32Array(FFT_SIZE), 1 / 60);
  assert.equal(bins, binEdges().length);
  assert.ok(isSettled(state, bins));
  assert.ok(state.outLog.subarray(0, bins).every((value) => value === 0));
});

test('a tone peaks in its logarithmic bin, normalised to one', () => {
  const state = createMusializerState();
  const bins = analyze(state, sine(440), 1 / 60);
  const edges = binEdges();
  const expected = edges.findLastIndex((edge) => edge <= 440);
  let peak = 0;
  for (let i = 0; i < bins; i += 1) if (state.outLog[i] > state.outLog[peak]) peak = i;
  assert.equal(peak, expected);
  assert.equal(state.outLog[peak], 1);
  assert.ok(!isSettled(state, bins));
});

test('smoothing and smear chase the spectrum at plug.c rates', () => {
  const state = createMusializerState();
  const samples = sine(440);
  const dt = 1 / 60;
  const bins = analyze(state, samples, dt);
  const peak = binEdges().findLastIndex((edge) => edge <= 440);
  assert.ok(Math.abs(state.outSmooth[peak] - 8 * dt) < 1e-6);
  assert.ok(Math.abs(state.outSmear[peak] - 8 * dt * 3 * dt) < 1e-6);
  for (let i = 0; i < 600; i += 1) analyze(state, samples, dt);
  assert.ok(state.outSmooth[peak] > 0.99 && state.outSmooth[peak] <= 1);
  assert.ok(state.outSmear[peak] > 0.99 && state.outSmear[peak] <= state.outSmooth[peak] + 1e-6);

  // A stalled frame is clamped so the bars cannot overshoot.
  const stalled = createMusializerState();
  analyze(stalled, samples, 5);
  assert.ok(stalled.outSmooth[peak] <= 1);
  assert.ok(bins > 0);
});

test('colours match raylib ColorFromHSV', () => {
  assert.deepEqual(colorFromHSV(0, 0.75, 1), [255, 63, 63]);
  assert.deepEqual(colorFromHSV(120, 0.75, 1), [63, 255, 63]);
  assert.deepEqual(colorFromHSV(240, 0.75, 1), [63, 63, 255]);
  assert.deepEqual(colorFromHSV(60, 1, 1), [255, 255, 0]);
});

test('geometry lays out bars, smears, and circles as fft_render does', () => {
  const state = createMusializerState();
  const bins = 4;
  state.outSmooth.set([0, 0.25, 1, 0.5]);
  state.outSmear.set([0, 0.5, 0.5, 0.5]);
  const geometry = createGeometry(bins);
  const width = 400;
  const height = 300;
  buildGeometry(state, bins, width, height, geometry);

  const quad = (buffer, index) => {
    const start = index * VERTICES_PER_QUAD * FLOATS_PER_VERTEX;
    const vertices = [];
    for (let v = 0; v < VERTICES_PER_QUAD; v += 1) {
      vertices.push(Array.from(buffer.subarray(start + v * FLOATS_PER_VERTEX, start + (v + 1) * FLOATS_PER_VERTEX)));
    }
    const xs = vertices.map((vertex) => vertex[0]);
    const ys = vertices.map((vertex) => vertex[1]);
    const vs = vertices.map((vertex) => vertex[3]);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      vTop: vertices.find((vertex) => vertex[1] === Math.min(...ys))[3],
      vBottom: vertices.find((vertex) => vertex[1] === Math.max(...ys))[3],
      vs,
      color: vertices[0].slice(4, 8),
    };
  };
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-3, `${actual} != ${expected}`);
  const cell = width / bins;

  // Full-height bar: two thirds of the boundary, a third of a cell thick.
  const bar = quad(geometry.bars, 2);
  close(bar.top, height - (height * 2) / 3);
  close(bar.bottom, height);
  close(bar.right - bar.left, cell / 3);
  close((bar.left + bar.right) / 2, 2 * cell + cell / 2);

  // Rising bar (smooth above smear): lower half of the glow, bright at the top.
  const rising = quad(geometry.smears, 2);
  close(rising.top, height - (height * 2) / 3);
  close(rising.bottom, height - ((height * 2) / 3) * 0.5);
  close(rising.right - rising.left, cell * 3);
  assert.deepEqual([rising.vTop, rising.vBottom], [0.5, 1]);

  // Falling bar (smooth below smear): upper half, bright at the bar's tip.
  const falling = quad(geometry.smears, 1);
  close(falling.top, height - ((height * 2) / 3) * 0.5);
  close(falling.bottom, height - ((height * 2) / 3) * 0.25);
  assert.deepEqual([falling.vTop, falling.vBottom], [0, 0.5]);

  // Circle: centred on the bar's tip, radius six cells times sqrt(t).
  const circle = quad(geometry.circles, 3);
  const radius = cell * 6 * Math.sqrt(0.5);
  close(circle.right - circle.left, 2 * radius);
  close((circle.top + circle.bottom) / 2, height - ((height * 2) / 3) * 0.5);

  // Hue runs across the bins; alpha is opaque.
  assert.deepEqual(quad(geometry.bars, 0).color.map((c) => Math.round(c * 255)), [255, 63, 63, 255]);
});
