/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAN_CHANNEL_LABEL,
  LanTransport,
  isLanOfferer,
  lanSignalToJson,
  lanStateToJson,
  lanTimestamp,
  normalizeLanSessionId,
  parseLanEnvelope,
  parseLanSignal,
  parseLanTimestamp,
  projectLanState,
  type LanDataChannel,
  type LanPeerConnection,
  type LanSignal,
} from '../lan.ts';
import { makeTrack, type RemoteCommand, type RemoteDevice } from '../models.ts';

function device(deviceId: string, overrides: Partial<RemoteDevice> = {}): RemoteDevice {
  return {
    deviceId,
    displayName: 'Phone',
    currentTrack: makeTrack({ id: 't1', title: 'Song', artist: 'Band', durationMs: 200_000 }),
    queue: [],
    queueIndex: 0,
    isPlaying: true,
    shuffleEnabled: false,
    repeatMode: 'Off',
    progressMs: 10_000,
    durationMs: 200_000,
    volume: 70,
    updatedAt: lanTimestamp(1_000_000),
    lastSeenSeconds: 0,
    rememberedUntil: '',
    isOnline: true,
    observedAtMs: 0,
    ...overrides,
  };
}

// --- A fake WebRTC pair: an offer's SDP names its connection, and applying the
// matching answer opens both data channels. ----------------------------------

class FakeChannel implements LanDataChannel {
  readyState = 'connecting';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  other: FakeChannel | null = null;
  readonly label: string;
  constructor(label: string) {
    this.label = label;
  }
  send(data: string) {
    if (this.readyState !== 'open') throw new Error('channel closed');
    const other = this.other;
    queueMicrotask(() => other?.onmessage?.({ data }));
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    const other = this.other;
    this.other = null;
    this.onclose?.();
    other?.close();
  }
}

const registry = new Map<string, FakeConnection>();
let connectionCount = 0;

class FakeConnection implements LanPeerConnection {
  readonly id = `pc${(connectionCount += 1)}`;
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: LanDataChannel }) => void) | null = null;
  channel: FakeChannel | null = null;
  constructor() {
    registry.set(this.id, this);
  }
  createDataChannel(label: string) {
    this.channel = new FakeChannel(label);
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: this.id };
  }
  async createAnswer() {
    return { type: 'answer', sdp: this.id };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remoteDescription = description;
    if (description.type !== 'answer') return;
    const answerer = registry.get(description.sdp);
    if (!answerer || !this.channel) throw new Error('unknown answer');
    const remote = new FakeChannel(this.channel.label);
    remote.other = this.channel;
    this.channel.other = remote;
    answerer.ondatachannel?.({ channel: remote });
    remote.open();
    this.channel.open();
  }
  close() {
    this.connectionState = 'closed';
    this.channel?.close();
  }
}

type Harness = {
  transport: LanTransport;
  commands: RemoteCommand[];
  states: RemoteDevice[];
  peers: string[][];
  sent: { target: string; signal: LanSignal }[];
};

function pair(idA: string, idB: string) {
  const sides = new Map<string, Harness>();
  let session = 0;
  const make = (id: string): Harness => {
    const harness: Harness = { commands: [], states: [], peers: [], sent: [], transport: null as unknown as LanTransport };
    harness.transport = new LanTransport({
      localDeviceId: id,
      createPeerConnection: () => new FakeConnection(),
      sendSignal: async (target, signal) => {
        harness.sent.push({ target, signal });
        // Signals travel as JSON through the cloud command queue.
        queueMicrotask(() => void sides.get(target)?.transport.handleSignal(id, JSON.stringify(lanSignalToJson(signal))));
        return true;
      },
      onCommand: (command) => harness.commands.push(command),
      onState: (_, state) => harness.states.push(state),
      onPeersChanged: (connected) => harness.peers.push(connected),
      createSessionId: () => `s${(session += 1)}`,
      setInterval: () => 0,
      clearInterval: () => undefined,
    });
    sides.set(id, harness);
    return harness;
  };
  return { a: make(idA), b: make(idB) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('signals round-trip and reject malformed payloads', () => {
  const offer: LanSignal = { kind: 'offer', sessionId: 'abc-1', sdp: 'v=0' };
  assert.deepEqual(parseLanSignal(JSON.stringify(lanSignalToJson(offer))), offer);
  assert.deepEqual(parseLanSignal(lanSignalToJson({ kind: 'request', sessionId: 'abc', sdp: '' })), { kind: 'request', sessionId: 'abc', sdp: '' });
  assert.equal(parseLanSignal({ version: 2, kind: 'request', sessionId: 'abc' }), null);
  assert.equal(parseLanSignal({ version: 1, kind: 'offer', sessionId: 'abc', description: { type: 'answer', sdp: 'x' } }), null);
  assert.equal(parseLanSignal({ version: 1, kind: 'request', sessionId: 'bad id!' }), null);
  assert.equal(parseLanSignal('not json'), null);
  assert.equal(normalizeLanSessionId(' a:b_c-1 '), 'a:b_c-1');
});

test('timestamps are strict UTC and the smaller device id offers', () => {
  assert.equal(parseLanTimestamp(lanTimestamp(1_700_000_000_123)), 1_700_000_000_123);
  assert.equal(parseLanTimestamp('2026-01-01T00:00:00Z'), Date.UTC(2026, 0, 1));
  assert.equal(parseLanTimestamp('2026-01-01 00:00:00'), null);
  assert.equal(isLanOfferer('alpha', 'beta'), true);
  assert.equal(isLanOfferer('beta', 'alpha'), false);
});

test('state projection advances a playing device and caps at its duration', () => {
  const state = device('d1');
  assert.equal(projectLanState(state, 1_005_000).progressMs, 15_000);
  assert.equal(projectLanState({ ...state, isPlaying: false }, 1_005_000).progressMs, 10_000);
  assert.equal(projectLanState({ ...state, progressMs: 199_000 }, 1_060_000).progressMs, 200_000);
  const json = lanStateToJson(state, 1_005_000);
  assert.equal(json.progress, 15);
  assert.equal(json.duration, 200);
});

test('envelopes from the wrong peer, session, or target are dropped', () => {
  const command = {
    id: 'c1',
    sourceDeviceId: 'peer',
    targetDeviceId: 'me',
    command: 'seek',
    payload: { progress: 12 },
    createdAt: lanTimestamp(),
  };
  const envelope = (overrides: Record<string, unknown> = {}, commandOverrides: Record<string, unknown> = {}) =>
    parseLanEnvelope({ version: 1, sessionId: 's1', type: 'command', command: { ...command, ...commandOverrides }, ...overrides }, 'peer', 'me', 's1');
  const parsed = envelope();
  assert.equal(parsed?.type, 'command');
  assert.equal(parsed?.type === 'command' ? parsed.command.seekPositionMs : null, 12_000);
  assert.equal(envelope({ sessionId: 's2' }), null);
  assert.equal(envelope({}, { sourceDeviceId: 'intruder' }), null);
  assert.equal(envelope({}, { targetDeviceId: 'someone-else' }), null);
  assert.equal(envelope({}, { command: 'lan_signal' }), null);
  assert.equal(parseLanEnvelope({ version: 1, sessionId: 's1', type: 'hello', deviceId: 'intruder' }, 'peer', 'me', 's1'), null);
  assert.deepEqual(parseLanEnvelope({ version: 1, sessionId: 's1', type: 'ping', sentAt: 5 }, 'peer', 'me', 's1'), { type: 'ping', sentAt: 5 });
});

test('the offerer connects, both sides verify, and commands and state flow directly', async () => {
  const { a, b } = pair('alpha', 'beta');
  a.transport.broadcastState(device('alpha'));
  await a.transport.ensureConnection('beta');
  await settle();
  assert.deepEqual(a.sent.map((entry) => entry.signal.kind), ['offer']);
  assert.deepEqual(b.sent.map((entry) => entry.signal.kind), ['answer']);
  assert.deepEqual(a.transport.connectedPeerDeviceIds(), ['beta']);
  assert.deepEqual(b.transport.connectedPeerDeviceIds(), ['alpha']);
  assert.deepEqual(b.peers.at(-1), ['alpha']);
  assert.equal(b.states.at(-1)?.deviceId, 'alpha');

  assert.equal(a.transport.sendCommand('beta', 'seek', { progress: 30 }), true);
  assert.equal(a.transport.sendCommand('beta', 'download', {}), false);
  await settle();
  assert.equal(b.commands.length, 1);
  assert.equal(b.commands[0]!.command, 'seek');
  assert.equal(b.commands[0]!.sourceDeviceId, 'alpha');
  assert.equal(b.commands[0]!.seekPositionMs, 30_000);

  a.transport.dispose();
  await settle();
  assert.deepEqual(b.transport.connectedPeerDeviceIds(), []);
  assert.deepEqual(b.peers.at(-1), []);
  b.transport.dispose();
});

test('the non-offerer asks the offerer to start, and unready peers fall back to the cloud', async () => {
  const { a, b } = pair('alpha', 'beta');
  assert.equal(b.transport.sendCommand('alpha', 'pause'), false);
  await settle();
  assert.deepEqual(b.sent.map((entry) => entry.signal.kind), ['request', 'answer']);
  assert.deepEqual(a.sent.map((entry) => entry.signal.kind), ['offer']);
  assert.deepEqual(b.transport.connectedPeerDeviceIds(), ['alpha']);
  assert.equal(b.transport.sendCommand('alpha', 'pause'), true);
  await settle();
  assert.equal(a.commands[0]?.command, 'pause');
  // A second ensure on a live link sends nothing new.
  await b.transport.ensureConnection('alpha');
  assert.equal(b.sent.length, 2);
  b.transport.disconnect('alpha');
  await settle();
  assert.deepEqual(a.transport.connectedPeerDeviceIds(), []);
  a.transport.dispose();
  b.transport.dispose();
  assert.equal(LAN_CHANNEL_LABEL, 'spice-connect-lan');
});
