import {
  gameToHostSchema,
  LIMITS,
  type ClientMessage,
  type Envelope,
  type ServerMessage,
} from '@ogm/contracts/browser';

import type { DesignBridge, WatcherSync } from './watcher-sync';
import type { RoomStore, RoomStoreApi } from './room-store';

export type ForwardingRoomClient = {
  send(message: ClientMessage): void;
  subscribe(listener: (message: ServerMessage) => void): () => void;
};

export type BridgeForwardingOptions = {
  bridge: DesignBridge;
  client: ForwardingRoomClient;
  store: RoomStoreApi;
  watcher?: Pick<WatcherSync, 'reapply'>;
};

export type BridgeForwarding = {
  handleGameMessage(envelope: Envelope<string, unknown>): void;
  detach(): void;
};

let envelopeSequence = 0;
const encoder = new TextEncoder();

export function attachBridgeForwarding(options: BridgeForwardingOptions): BridgeForwarding {
  const { bridge, client, store, watcher } = options;
  const warned = new Set<'input' | 'snapshot' | 'event'>();
  const sendBridge = (t: string, payload: unknown) => {
    envelopeSequence += 1;
    bridge.send({ v: 1, id: `room-net-${envelopeSequence}`, t, payload });
  };
  const warnOnce = (type: 'input' | 'snapshot' | 'event') => {
    if (warned.has(type)) return;
    warned.add(type);
    console.warn(`Dropped oversized or invalid game net.${type} message`);
  };

  const forwardState = (next: RoomStore, previous?: RoomStore) => {
    if (next.role !== undefined && next.role !== previous?.role) sendBridge('net.role', { role: next.role });
    if (next.phase !== undefined && next.phase !== previous?.phase) {
      sendBridge('phase', { phase: next.phase });
      if (next.phase === 'pausedForHost' || next.phase === 'ended') sendBridge('lifecycle.pause', {});
      if (next.phase === 'playing') sendBridge('lifecycle.resume', {});
    }
    if (next.you !== undefined && (next.you !== previous?.you || !sameMembers(next.members, previous?.members))) {
      sendBridge('net.players', {
        local: next.you.playerIndex,
        players: Object.values(next.members)
          .map(({ playerIndex, name, connected }) => ({ playerIndex, name, connected }))
          .sort((left, right) => left.playerIndex - right.playerIndex),
      });
    }
  };

  const removeMessages = client.subscribe((message) => {
    const role = store.getState().role;
    switch (message.t) {
      case 'input': {
        if (role !== 'host') return;
        const { seq, tick, axes, buttons, playerIndex } = message.f;
        sendBridge('net.input', { f: { seq, tick, axes, buttons, playerIndex } });
        return;
      }
      case 'snapshot':
        if (role === 'peer') {
          sendBridge('net.snapshot', { seq: message.seq, tick: message.tick, data: bytesToBase64(message.data) });
        }
        return;
      case 'event':
        if (role === 'peer') sendBridge('net.event', { seq: message.seq, data: bytesToBase64(message.data) });
        return;
      default:
        return;
    }
  });
  const removeStore = store.subscribe((next, previous) => forwardState(next, previous));
  forwardState(store.getState());

  return {
    handleGameMessage(envelope) {
      if (
        (envelope.t === 'net.snapshot' || envelope.t === 'net.event') &&
        isOversizedBinary(envelope.payload, envelope.t === 'net.snapshot' ? LIMITS.snapshotBytes : LIMITS.eventBytes)
      ) {
        warnOnce(envelope.t === 'net.snapshot' ? 'snapshot' : 'event');
        return;
      }
      const parsed = gameToHostSchema.safeParse(envelope);
      if (!parsed.success) return;
      const message = parsed.data;
      const role = store.getState().role;
      switch (message.t) {
        case 'ready': {
          const draft = store.getState().draft;
          if (draft !== undefined) client.send({ t: 'draft.ready', buildId: draft.buildId });
          watcher?.reapply?.();
          return;
        }
        case 'net.input':
          if (role !== 'peer') return;
          if (encoder.encode(JSON.stringify(message.payload.f)).byteLength > LIMITS.inputBytes) {
            warnOnce('input');
            return;
          }
          client.send({ t: 'input', f: message.payload.f });
          return;
        case 'net.snapshot':
          if (role !== 'host') return;
          client.send({
            t: 'snapshot',
            seq: message.payload.seq,
            tick: message.payload.tick,
            data: base64ToBytes(message.payload.data),
          });
          return;
        case 'net.event':
          if (role !== 'host') return;
          client.send({ t: 'event', seq: message.payload.seq, data: base64ToBytes(message.payload.data) });
          return;
        default:
          return;
      }
    },
    detach() {
      removeMessages();
      removeStore();
    },
  };
}

export function bytesToBase64(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isOversizedBinary(payload: unknown, limit: number): boolean {
  if (payload === null || typeof payload !== 'object') return false;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'string') return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding > limit;
}

function sameMembers(next: RoomStore['members'], previous?: RoomStore['members']): boolean {
  if (previous === undefined) return false;
  const nextMembers = Object.values(next);
  const previousMembers = Object.values(previous);
  if (nextMembers.length !== previousMembers.length) return false;
  return nextMembers.every((member) => {
    const before = previous[member.userId];
    return (
      before !== undefined &&
      before.name === member.name &&
      before.playerIndex === member.playerIndex &&
      before.connected === member.connected
    );
  });
}
