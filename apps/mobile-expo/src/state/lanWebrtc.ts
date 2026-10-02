import { RTCPeerConnection } from 'react-native-webrtc';

import type { LanDataChannel, LanPeerConnection } from '../core/lan';

type Listenable = { addEventListener(type: string, listener: (event: never) => void): void };

/** react-native-webrtc only dispatches events, so map them onto handler properties. */
function adaptChannel(channel: unknown): LanDataChannel {
  const native = channel as Listenable & { label: string; readyState: string; send(data: string): void; close(): void };
  const adapted: LanDataChannel = {
    get label() {
      return native.label;
    },
    get readyState() {
      return native.readyState;
    },
    onopen: null,
    onclose: null,
    onmessage: null,
    send: (data) => native.send(data),
    close: () => native.close(),
  };
  native.addEventListener('open', () => adapted.onopen?.());
  native.addEventListener('close', () => adapted.onclose?.());
  native.addEventListener('message', (event: { data: unknown }) => adapted.onmessage?.(event));
  return adapted;
}

/**
 * A peer connection with no ICE servers: only host candidates are gathered, so
 * a link forms only between devices on the same network.
 */
export function createLanPeerConnection(): LanPeerConnection {
  const native = new RTCPeerConnection({ iceServers: [] });
  const events = native as unknown as Listenable;
  const adapted: LanPeerConnection = {
    get iceGatheringState() {
      return native.iceGatheringState;
    },
    get connectionState() {
      return native.connectionState;
    },
    get localDescription() {
      const description = native.localDescription;
      return description ? { type: String(description.type), sdp: description.sdp } : null;
    },
    get remoteDescription() {
      const description = native.remoteDescription;
      return description ? { type: String(description.type), sdp: description.sdp } : null;
    },
    onicegatheringstatechange: null,
    onconnectionstatechange: null,
    ondatachannel: null,
    createDataChannel: (label, options) => adaptChannel(native.createDataChannel(label, options)),
    createOffer: async () => {
      const offer = await native.createOffer({});
      return { type: 'offer', sdp: String(offer.sdp) };
    },
    createAnswer: async () => {
      const answer = await native.createAnswer();
      return { type: 'answer', sdp: String(answer.sdp) };
    },
    setLocalDescription: async (description) => {
      await native.setLocalDescription(description as { type: 'offer' | 'answer'; sdp: string });
    },
    setRemoteDescription: async (description) => {
      await native.setRemoteDescription(description as { type: 'offer' | 'answer'; sdp: string });
    },
    close: () => native.close(),
  };
  events.addEventListener('icegatheringstatechange', () => adapted.onicegatheringstatechange?.());
  events.addEventListener('connectionstatechange', () => adapted.onconnectionstatechange?.());
  events.addEventListener('datachannel', (event: { channel: unknown }) =>
    adapted.ondatachannel?.({ channel: adaptChannel(event.channel) }),
  );
  return adapted;
}
