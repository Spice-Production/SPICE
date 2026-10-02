// Same-network Spice Connect: a WebRTC data channel between two devices,
// negotiated through cloud commands. Ported from the Kotlin client's
// SpiceConnectLanProtocol and SpiceConnectLanTransport. The WebRTC objects are
// injected so the transport runs under Node tests with a fake pair.

import type { Json } from './json.ts';
import type { RemoteCommand, RemoteDevice } from './models.ts';
import { parseRemoteCommands, parseRemoteDevice, repeatModeToRemote, trackToRemoteJson } from './parsers.ts';

export const LAN_PROTOCOL_VERSION = 1;
export const LAN_SIGNAL_COMMAND = 'lan_signal';
export const LAN_CHANNEL_LABEL = 'spice-connect-lan';
export const LAN_CHANNEL_PROTOCOL = 'spice-connect-lan-v1';
export const LAN_MAX_MESSAGE_BYTES = 512 * 1024;
export const LAN_MAX_PEERS = 8;
export const LAN_NEGOTIATION_TIMEOUT_MS = 15_000;
export const LAN_PEER_TIMEOUT_MS = 45_000;
export const LAN_HEARTBEAT_INTERVAL_MS = 15_000;
const ICE_GATHERING_TIMEOUT_MS = 3_000;
const MAX_SDP_LENGTH = 128 * 1024;

const SESSION_PATTERN = /^[a-zA-Z0-9:_-]+$/;
const RECEIVABLE_COMMANDS = new Set([
  'play', 'pause', 'toggle', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat', 'play_track',
  'play_queue_index', 'set_like', 'add_to_playlist', 'download', 'handoff', 'handoff_prepare', 'handoff_ready',
  'handoff_commit', 'handoff_complete', 'handoff_cancel', 'connect',
]);
/** Commands worth sending directly; the rest stay on the durable cloud queue. */
const SENDABLE_COMMANDS = new Set([
  'play', 'pause', 'toggle', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat', 'play_track', 'handoff',
  'handoff_prepare', 'handoff_ready', 'handoff_commit', 'handoff_complete', 'handoff_cancel', 'connect',
]);

export type LanSignal = { kind: 'request' | 'offer' | 'answer'; sessionId: string; sdp: string };

export type LanEnvelope =
  | { type: 'hello'; deviceId: string }
  | { type: 'command'; command: RemoteCommand }
  | { type: 'state'; state: RemoteDevice }
  | { type: 'ping' | 'pong'; sentAt: number };

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeLanDeviceId(value: string): string {
  return value.trim().slice(0, 120);
}

export function normalizeLanSessionId(value: string): string {
  const normalized = value.trim().slice(0, 160);
  return normalized && SESSION_PATTERN.test(normalized) ? normalized : '';
}

/** The lexically smaller device id makes the offer, so both sides agree who starts. */
export function isLanOfferer(localDeviceId: string, peerDeviceId: string): boolean {
  return normalizeLanDeviceId(localDeviceId) < normalizeLanDeviceId(peerDeviceId);
}

export function lanTimestamp(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString();
}

export function parseLanTimestamp(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(normalized)) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function lanSignalToJson(signal: LanSignal): Json {
  const payload: Json = { version: LAN_PROTOCOL_VERSION, kind: signal.kind, sessionId: signal.sessionId };
  if (signal.kind !== 'request' && signal.sdp) payload.description = { type: signal.kind, sdp: signal.sdp };
  return payload;
}

export function parseLanSignal(raw: string | Json): LanSignal | null {
  let payload: Json | null;
  try {
    payload = typeof raw === 'string' ? object(JSON.parse(raw)) : raw;
  } catch {
    return null;
  }
  if (!payload || payload.version !== LAN_PROTOCOL_VERSION) return null;
  const kind = text(payload.kind).trim();
  const sessionId = normalizeLanSessionId(text(payload.sessionId));
  if (!sessionId) return null;
  if (kind === 'request') return { kind, sessionId, sdp: '' };
  if (kind !== 'offer' && kind !== 'answer') return null;
  const description = object(payload.description);
  const sdp = text(description?.sdp);
  if (!description || text(description.type).trim() !== kind || !sdp || sdp.length > MAX_SDP_LENGTH) return null;
  return { kind, sessionId, sdp };
}

export function normalizeLanState(payload: Json): RemoteDevice | null {
  const deviceId = normalizeLanDeviceId(text(payload.deviceId));
  if (!deviceId) return null;
  const queue = Array.isArray(payload.queue) ? payload.queue.slice(0, 80) : [];
  const updatedAt = text(payload.updatedAt);
  return parseRemoteDevice({
    deviceId,
    displayName: text(payload.displayName).trim().slice(0, 80) || 'Spice Connect Device',
    currentTrack: object(payload.currentTrack),
    queue,
    queueIndex: Math.max(0, Math.trunc(finite(payload.queueIndex, 0))),
    isPlaying: payload.isPlaying === true,
    shuffleEnabled: payload.shuffleEnabled === true,
    repeatMode: text(payload.repeatMode),
    progress: clamp(finite(payload.progress, 0), 0, 86_400),
    duration: clamp(finite(payload.duration, 0), 0, 86_400),
    volume: clamp(Math.trunc(finite(payload.volume, 70)), 0, 100),
    updatedAt: parseLanTimestamp(updatedAt) !== null ? updatedAt : lanTimestamp(),
    isOnline: true,
  });
}

/** Advances a playing device's progress to `nowMs` before it is sent. */
export function projectLanState(state: RemoteDevice, nowMs: number): RemoteDevice {
  const updatedAtMs = parseLanTimestamp(state.updatedAt);
  const elapsedMs = state.isPlaying && updatedAtMs !== null ? clamp(nowMs - updatedAtMs, 0, 120_000) : 0;
  let progressMs = Math.max(0, state.progressMs + elapsedMs);
  if (state.durationMs > 0) progressMs = Math.min(progressMs, state.durationMs);
  return { ...state, progressMs, updatedAt: lanTimestamp(nowMs), isOnline: true };
}

export function lanStateToJson(state: RemoteDevice, nowMs: number = Date.now()): Json {
  const projected = projectLanState(state, nowMs);
  return {
    deviceId: normalizeLanDeviceId(projected.deviceId),
    displayName: projected.displayName.trim().slice(0, 80) || 'Spice Connect Device',
    currentTrack: projected.currentTrack ? trackToRemoteJson(projected.currentTrack) : null,
    queue: projected.queue.slice(0, 80).map(trackToRemoteJson),
    queueIndex: clamp(projected.queueIndex, 0, Math.max(projected.queue.length - 1, 0)),
    isPlaying: projected.isPlaying,
    shuffleEnabled: projected.shuffleEnabled,
    repeatMode: repeatModeToRemote(projected.repeatMode),
    progress: Math.max(0, projected.progressMs) / 1000,
    duration: Math.max(0, projected.durationMs) / 1000,
    volume: clamp(projected.volume, 0, 100),
    updatedAt: projected.updatedAt,
  };
}

/** Validates a data-channel message; anything not from the expected peer and session is dropped. */
export function parseLanEnvelope(
  payload: Json,
  expectedPeerDeviceId: string,
  localDeviceId: string,
  expectedSessionId: string,
): LanEnvelope | null {
  if (payload.version !== LAN_PROTOCOL_VERSION) return null;
  if (normalizeLanSessionId(text(payload.sessionId)) !== expectedSessionId) return null;
  const peer = normalizeLanDeviceId(expectedPeerDeviceId);
  const local = normalizeLanDeviceId(localDeviceId);
  const type = text(payload.type);

  if (type === 'hello') {
    return normalizeLanDeviceId(text(payload.deviceId)) === peer ? { type, deviceId: peer } : null;
  }
  if (type === 'command') {
    const item = object(payload.command);
    if (!item) return null;
    const id = text(item.id).trim().slice(0, 200);
    const sourceDeviceId = normalizeLanDeviceId(text(item.sourceDeviceId));
    const command = text(item.command).trim();
    if (
      !id ||
      sourceDeviceId !== peer ||
      normalizeLanDeviceId(text(item.targetDeviceId)) !== local ||
      !RECEIVABLE_COMMANDS.has(command) ||
      parseLanTimestamp(text(item.createdAt)) === null
    ) {
      return null;
    }
    const normalized = { ...item, id, sourceDeviceId, command, payload: object(item.payload) ?? {} };
    const parsed = parseRemoteCommands({ commands: [normalized] });
    return parsed.length === 1 ? { type, command: parsed[0]! } : null;
  }
  if (type === 'state') {
    const statePayload = object(payload.state);
    const state = statePayload ? normalizeLanState(statePayload) : null;
    return state && state.deviceId === peer ? { type, state } : null;
  }
  if (type === 'ping' || type === 'pong') {
    return typeof payload.sentAt === 'number' && Number.isFinite(payload.sentAt)
      ? { type, sentAt: Math.trunc(payload.sentAt) }
      : null;
  }
  return null;
}

// --- Transport ---------------------------------------------------------------

/** The subset of RTCDataChannel the transport uses. */
export type LanDataChannel = {
  readonly label: string;
  readonly readyState: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
};

/** The subset of RTCPeerConnection the transport uses. */
export type LanPeerConnection = {
  readonly iceGatheringState: string;
  readonly connectionState?: string;
  readonly localDescription: { type: string; sdp: string } | null;
  readonly remoteDescription: { type: string; sdp: string } | null;
  onicegatheringstatechange: (() => void) | null;
  onconnectionstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: LanDataChannel }) => void) | null;
  createDataChannel(label: string, options: { ordered: boolean; protocol: string }): LanDataChannel;
  createOffer(): Promise<{ type: string; sdp: string }>;
  createAnswer(): Promise<{ type: string; sdp: string }>;
  setLocalDescription(description: { type: string; sdp: string }): Promise<void>;
  setRemoteDescription(description: { type: string; sdp: string }): Promise<void>;
  close(): void;
};

export type LanTransportOptions = {
  localDeviceId: string;
  /** No STUN or TURN servers: this transport is same-network only by design. */
  createPeerConnection: () => LanPeerConnection;
  sendSignal: (targetDeviceId: string, signal: LanSignal) => Promise<boolean>;
  onCommand: (command: RemoteCommand) => void;
  onState: (peerDeviceId: string, state: RemoteDevice) => void;
  onPeersChanged?: (connectedPeerDeviceIds: string[]) => void;
  onDiagnostic?: (message: string) => void;
  now?: () => number;
  createSessionId: () => string;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
};

type Peer = {
  peerDeviceId: string;
  sessionId: string;
  connection: LanPeerConnection;
  createdAt: number;
  channel: LanDataChannel | null;
  verified: boolean;
  lastSeenAt: number;
};

export class LanTransport {
  private readonly options: LanTransportOptions;
  private readonly localDeviceId: string;
  private readonly peers = new Map<string, Peer>();
  private readonly pendingRequests = new Map<string, { sessionId: string; createdAt: number }>();
  private readonly heartbeatHandle: unknown;
  private latestLocalState: RemoteDevice | null = null;
  private disposed = false;

  constructor(options: LanTransportOptions) {
    this.options = options;
    this.localDeviceId = normalizeLanDeviceId(options.localDeviceId);
    if (!this.localDeviceId) throw new Error('A local Spice Connect device id is required.');
    const schedule = options.setInterval ?? ((callback, ms) => setInterval(callback, ms));
    this.heartbeatHandle = schedule(() => this.heartbeat(), LAN_HEARTBEAT_INTERVAL_MS);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  connectedPeerDeviceIds(): string[] {
    return [...this.peers.values()].filter((peer) => this.isReady(peer)).map((peer) => peer.peerDeviceId).sort();
  }

  async ensureConnection(peerDeviceIdValue: string): Promise<void> {
    const peerDeviceId = normalizeLanDeviceId(peerDeviceIdValue);
    if (this.disposed || !peerDeviceId || peerDeviceId === this.localDeviceId) return;
    const now = this.now();
    const existing = this.peers.get(peerDeviceId);
    if (existing && (this.isReady(existing) || now - existing.createdAt < LAN_NEGOTIATION_TIMEOUT_MS)) return;
    if (existing) this.closePeer(peerDeviceId, existing.sessionId);

    const pending = this.pendingRequests.get(peerDeviceId);
    if (pending && now - pending.createdAt < LAN_NEGOTIATION_TIMEOUT_MS) return;
    const sessionId = normalizeLanSessionId(this.options.createSessionId());
    if (!sessionId) return;
    if (isLanOfferer(this.localDeviceId, peerDeviceId)) {
      await this.createOffer(peerDeviceId, sessionId);
      return;
    }
    this.pendingRequests.set(peerDeviceId, { sessionId, createdAt: now });
    const sent = await this.signal(peerDeviceId, { kind: 'request', sessionId, sdp: '' });
    if (!sent) this.pendingRequests.delete(peerDeviceId);
  }

  async handleSignal(sourceDeviceIdValue: string, rawSignal: string | Json): Promise<boolean> {
    const sourceDeviceId = normalizeLanDeviceId(sourceDeviceIdValue);
    const signal = parseLanSignal(rawSignal);
    if (this.disposed || !sourceDeviceId || sourceDeviceId === this.localDeviceId || !signal) return false;

    if (signal.kind === 'request') {
      if (!isLanOfferer(this.localDeviceId, sourceDeviceId)) return false;
      const existing = this.peers.get(sourceDeviceId);
      if (existing && this.isReady(existing)) return true;
      return this.createOffer(sourceDeviceId, signal.sessionId);
    }

    if (signal.kind === 'offer') {
      if (isLanOfferer(this.localDeviceId, sourceDeviceId)) return false;
      this.pendingRequests.delete(sourceDeviceId);
      this.closePeer(sourceDeviceId);
      let peer: Peer;
      try {
        peer = this.createPeer(sourceDeviceId, signal.sessionId, false);
      } catch (error) {
        this.diagnostic(`LAN peer creation failed for ${sourceDeviceId}`, error);
        return false;
      }
      try {
        await peer.connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await peer.connection.setLocalDescription(await peer.connection.createAnswer());
        await this.waitForIceGathering(peer);
        const local = peer.connection.localDescription;
        if (!this.isCurrent(peer) || !local) return false;
        const sent = await this.signal(sourceDeviceId, { kind: 'answer', sessionId: signal.sessionId, sdp: local.sdp });
        if (!sent) this.closePeer(sourceDeviceId, signal.sessionId);
        return sent;
      } catch (error) {
        this.diagnostic(`LAN answer failed for ${sourceDeviceId}`, error);
        this.closePeer(sourceDeviceId, signal.sessionId);
        return false;
      }
    }

    const peer = this.peers.get(sourceDeviceId);
    if (!peer || peer.sessionId !== signal.sessionId || peer.connection.remoteDescription) return false;
    try {
      await peer.connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      return true;
    } catch (error) {
      this.diagnostic(`LAN offer completion failed for ${sourceDeviceId}`, error);
      this.closePeer(sourceDeviceId, signal.sessionId);
      return false;
    }
  }

  /** True when the command went out directly; false means use the cloud. */
  sendCommand(targetDeviceIdValue: string, command: string, payload: Json = {}): boolean {
    const targetDeviceId = normalizeLanDeviceId(targetDeviceIdValue);
    if (!SENDABLE_COMMANDS.has(command)) return false;
    const peer = this.peers.get(targetDeviceId);
    if (!peer || !this.isReady(peer)) {
      void this.ensureConnection(targetDeviceId);
      return false;
    }
    return this.sendEnvelope(peer, {
      type: 'command',
      command: {
        id: `lan:${peer.sessionId}:${this.options.createSessionId()}`,
        sourceDeviceId: this.localDeviceId,
        targetDeviceId,
        command,
        payload: { ...payload },
        createdAt: lanTimestamp(this.now()),
      },
    });
  }

  broadcastState(state: RemoteDevice): number {
    if (normalizeLanDeviceId(state.deviceId) !== this.localDeviceId) return 0;
    this.latestLocalState = { ...state, updatedAt: lanTimestamp(this.now()) };
    let sent = 0;
    for (const peer of this.peers.values()) if (this.sendState(peer)) sent += 1;
    return sent;
  }

  disconnect(peerDeviceIdValue: string): void {
    const peerDeviceId = normalizeLanDeviceId(peerDeviceIdValue);
    if (!peerDeviceId) return;
    this.pendingRequests.delete(peerDeviceId);
    this.closePeer(peerDeviceId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    (this.options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>)))(this.heartbeatHandle);
    for (const peer of [...this.peers.values()]) this.closePeer(peer.peerDeviceId, peer.sessionId, true);
    this.pendingRequests.clear();
  }

  private async signal(target: string, signal: LanSignal): Promise<boolean> {
    try {
      return await this.options.sendSignal(target, signal);
    } catch (error) {
      this.diagnostic(`LAN signal failed for ${target}`, error);
      return false;
    }
  }

  private async createOffer(peerDeviceId: string, sessionId: string): Promise<boolean> {
    this.pendingRequests.delete(peerDeviceId);
    this.closePeer(peerDeviceId);
    let peer: Peer;
    try {
      peer = this.createPeer(peerDeviceId, sessionId, true);
    } catch (error) {
      this.diagnostic(`LAN peer creation failed for ${peerDeviceId}`, error);
      return false;
    }
    try {
      await peer.connection.setLocalDescription(await peer.connection.createOffer());
      await this.waitForIceGathering(peer);
      const local = peer.connection.localDescription;
      if (!this.isCurrent(peer) || !local) return false;
      const sent = await this.signal(peerDeviceId, { kind: 'offer', sessionId, sdp: local.sdp });
      if (!sent) this.closePeer(peerDeviceId, sessionId);
      return sent;
    } catch (error) {
      this.diagnostic(`LAN offer failed for ${peerDeviceId}`, error);
      this.closePeer(peerDeviceId, sessionId);
      return false;
    }
  }

  private createPeer(peerDeviceId: string, sessionId: string, initiator: boolean): Peer {
    if (!this.peers.has(peerDeviceId) && this.peers.size >= LAN_MAX_PEERS) {
      const oldest = [...this.peers.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.closePeer(oldest.peerDeviceId, oldest.sessionId);
    }
    const connection = this.options.createPeerConnection();
    const now = this.now();
    const peer: Peer = { peerDeviceId, sessionId, connection, createdAt: now, channel: null, verified: false, lastSeenAt: now };
    this.peers.set(peerDeviceId, peer);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.closePeer(peerDeviceId, sessionId);
      }
    };
    connection.ondatachannel = (event) => {
      if (this.isCurrent(peer)) this.attachChannel(peer, event.channel);
      else event.channel.close();
    };
    if (initiator) {
      this.attachChannel(peer, connection.createDataChannel(LAN_CHANNEL_LABEL, { ordered: true, protocol: LAN_CHANNEL_PROTOCOL }));
    }
    return peer;
  }

  private attachChannel(peer: Peer, channel: LanDataChannel): void {
    if (!this.isCurrent(peer) || channel.label !== LAN_CHANNEL_LABEL) {
      channel.close();
      return;
    }
    if (peer.channel && peer.channel !== channel) peer.channel.close();
    peer.channel = channel;
    const greet = () => {
      if (this.isCurrent(peer) && peer.channel === channel) {
        this.sendEnvelope(peer, { type: 'hello', deviceId: this.localDeviceId }, false);
      }
    };
    channel.onopen = greet;
    channel.onclose = () => {
      if (this.isCurrent(peer) && peer.channel === channel) this.closePeer(peer.peerDeviceId, peer.sessionId);
    };
    channel.onmessage = (event) => {
      if (typeof event.data === 'string' && event.data.length <= LAN_MAX_MESSAGE_BYTES) this.handleMessage(peer, event.data);
    };
    if (channel.readyState === 'open') greet();
  }

  private handleMessage(peer: Peer, data: string): void {
    if (!this.isCurrent(peer)) return;
    let payload: Json | null;
    try {
      payload = object(JSON.parse(data));
    } catch {
      return;
    }
    const envelope = payload ? parseLanEnvelope(payload, peer.peerDeviceId, this.localDeviceId, peer.sessionId) : null;
    if (!envelope) return;
    peer.lastSeenAt = this.now();
    if (envelope.type === 'hello') {
      if (!peer.verified) {
        peer.verified = true;
        this.notifyPeersChanged();
        this.sendState(peer);
      }
      return;
    }
    if (!peer.verified) return;
    if (envelope.type === 'command') this.options.onCommand(envelope.command);
    else if (envelope.type === 'state') this.options.onState(peer.peerDeviceId, envelope.state);
    else if (envelope.type === 'ping') this.sendEnvelope(peer, { type: 'pong', sentAt: envelope.sentAt });
  }

  private sendState(peer: Peer): boolean {
    if (!this.latestLocalState || !this.isReady(peer)) return false;
    return this.sendEnvelope(peer, { type: 'state', state: lanStateToJson(this.latestLocalState, this.now()) });
  }

  private sendEnvelope(peer: Peer, body: Json, requireVerified = true): boolean {
    const channel = peer.channel;
    if (!channel || channel.readyState !== 'open' || (requireVerified && !peer.verified)) return false;
    try {
      const serialized = JSON.stringify({ version: LAN_PROTOCOL_VERSION, sessionId: peer.sessionId, ...body });
      if (serialized.length > LAN_MAX_MESSAGE_BYTES) return false;
      channel.send(serialized);
      return true;
    } catch (error) {
      this.diagnostic(`LAN data-channel send failed for ${peer.peerDeviceId}`, error);
      this.closePeer(peer.peerDeviceId, peer.sessionId);
      return false;
    }
  }

  private heartbeat(): void {
    const now = this.now();
    for (const peer of [...this.peers.values()]) {
      const ready = this.isReady(peer);
      if ((now - peer.createdAt >= LAN_NEGOTIATION_TIMEOUT_MS && !ready) || now - peer.lastSeenAt >= LAN_PEER_TIMEOUT_MS) {
        this.closePeer(peer.peerDeviceId, peer.sessionId);
      } else if (ready) {
        this.sendEnvelope(peer, { type: 'ping', sentAt: now });
        this.sendState(peer);
      }
    }
    for (const [peerDeviceId, request] of [...this.pendingRequests]) {
      if (now - request.createdAt >= LAN_NEGOTIATION_TIMEOUT_MS) this.pendingRequests.delete(peerDeviceId);
    }
  }

  /** Candidates travel inside the SDP, so wait briefly for gathering to finish. */
  private waitForIceGathering(peer: Peer): Promise<void> {
    if (peer.connection.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);
      peer.connection.onicegatheringstatechange = () => {
        if (peer.connection.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }

  private isCurrent(peer: Peer): boolean {
    return !this.disposed && this.peers.get(peer.peerDeviceId) === peer;
  }

  private isReady(peer: Peer): boolean {
    return peer.verified && peer.channel?.readyState === 'open';
  }

  private closePeer(peerDeviceId: string, expectedSessionId?: string, force = false): void {
    const peer = this.peers.get(peerDeviceId);
    if (!peer || (expectedSessionId !== undefined && peer.sessionId !== expectedSessionId)) return;
    // A remotely closed channel already reads as closed, so go by verification.
    const wasReady = peer.verified;
    this.peers.delete(peerDeviceId);
    const channel = peer.channel;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Already closed.
      }
    }
    try {
      peer.connection.close();
    } catch {
      // Already closed.
    }
    if (wasReady && !force) this.notifyPeersChanged();
  }

  private notifyPeersChanged(): void {
    this.options.onPeersChanged?.(this.connectedPeerDeviceIds());
  }

  private diagnostic(message: string, error?: unknown): void {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
    this.options.onDiagnostic?.(`${message}${detail}`);
  }
}
