import type { ActionFrame, GameManifest, MultiplayerHooks } from '@ogm/contracts';

import {
  assertByteLength,
  decodeBase64,
  encodeBase64,
  NET_LIMITS,
  NetPayloadTooLargeError,
  packJson,
  unpackJson,
} from './codec.js';
import { HostChannel } from './host.js';
import { PeerChannel, type WireSnapshot } from './peer.js';
import { NET_STATE_CHANGES, RoleStore, type NetPlayer, type NetRole, type NetStateChanges } from './roles.js';

export interface GmNet {
  readonly role: NetRole;
  readonly localPlayerIndex: number;
  readonly players: ReadonlyArray<NetPlayer>;
  onPlayerJoined(callback: (playerIndex: number) => void): () => void;
  onPlayerLeft(callback: (playerIndex: number) => void): () => void;
  onInput(callback: (playerIndex: number, frame: ActionFrame) => void): () => void;
  sendEvent(event: unknown): void;
  onEvent(callback: (event: unknown) => void): () => void;
  readonly snapshotHz: 20;
  readonly interpolationDelayMs: 100;
}

export interface NetDiagnostics {
  dropped: number;
  eventGaps: number;
  outOfOrderSnapshots: number;
  stalls: number;
  oversized: number;
}

export interface NetControllerOptions {
  manifest: GameManifest;
  hooks: MultiplayerHooks;
  localPlayerIndex: number;
  send(type: 'net.input' | 'net.snapshot' | 'net.event', payload: unknown): void;
  acceptInput(frame: ActionFrame): void;
  syncPlayers(players: ReadonlyArray<NetPlayer>): void;
  setLocalPlayerIndex(playerIndex: number): void;
  recordEvent(kind: string, payload: unknown): void;
  now(): number;
  warn?(message: string): void;
}

export interface NetController {
  readonly net: GmNet;
  readonly role: NetRole;
  readonly diagnostics: Readonly<NetDiagnostics>;
  handleMessage(type: string, payload: unknown): void;
  handleLocalFrames(frames: ActionFrame[]): void;
  afterStep(tick: number): void;
  render(): void;
  dispose(): void;
}

export function createNetController(options: NetControllerOptions): NetController {
  const roles = new RoleStore(options.localPlayerIndex, options.hooks);
  const inputListeners = new Set<(playerIndex: number, frame: ActionFrame) => void>();
  const eventListeners = new Set<(event: unknown) => void>();
  const eventBuffer = new Map<number, unknown>();
  const warned = new Set<string>();
  const diagnostics: NetDiagnostics = {
    dropped: 0,
    eventGaps: 0,
    outOfOrderSnapshots: 0,
    stalls: 0,
    oversized: 0,
  };
  let expectedEventSequence = 1;
  let outgoingEventSequence = 0;
  let eventGapStartedAt: number | undefined;
  let disposed = false;

  const oversized = (kind: 'input' | 'snapshot' | 'event', error: unknown) => {
    diagnostics.dropped += 1;
    diagnostics.oversized += 1;
    if (warned.has(kind)) return;
    warned.add(kind);
    (options.warn ?? console.warn)(`gm.net refused oversized ${kind} payload: ${String(error)}`);
  };
  const emitEvent = (event: unknown) => {
    for (const listener of eventListeners) listener(structuredClone(event));
  };

  const host = new HostChannel({
    actions: options.manifest.inputs.actions,
    hooks: options.hooks,
    role: () => roles.role,
    localPlayerIndex: () => roles.localPlayerIndex,
    playerCount: () => roles.players.length,
    send: (type, payload) => options.send(type, payload),
    acceptInput: options.acceptInput,
    emitInput: (playerIndex, frame) => {
      for (const listener of inputListeners) listener(playerIndex, structuredClone(frame));
    },
    oversized,
  });
  const peer = new PeerChannel({
    actions: options.manifest.inputs.actions,
    hooks: options.hooks,
    role: () => roles.role,
    localPlayerIndex: () => roles.localPlayerIndex,
    send: (type, payload) => options.send(type, payload),
    now: options.now,
    droppedSnapshot: () => {
      diagnostics.dropped += 1;
      diagnostics.outOfOrderSnapshots += 1;
    },
    invalidSnapshot: () => {
      diagnostics.dropped += 1;
    },
    stalled: () => {
      diagnostics.stalls += 1;
      const event = { type: 'net.stalled' };
      emitEvent(event);
      options.recordEvent('net.stalled', event);
    },
    oversized,
  });

  const syncState = () => {
    options.setLocalPlayerIndex(roles.localPlayerIndex);
    options.syncPlayers(roles.players);
  };
  const stopStateSync = roles.onStateChange(syncState);
  syncState();

  const net: GmNet & NetStateChanges = {
    get role() {
      return roles.role;
    },
    get localPlayerIndex() {
      return roles.localPlayerIndex;
    },
    get players() {
      return roles.players;
    },
    snapshotHz: 20,
    interpolationDelayMs: 100,
    onPlayerJoined: (callback) => roles.onPlayerJoined(callback),
    onPlayerLeft: (callback) => roles.onPlayerLeft(callback),
    onInput: (callback) => subscribe(inputListeners, callback),
    onEvent: (callback) => subscribe(eventListeners, callback),
    sendEvent: (event) => {
      if (disposed) return;
      try {
        const bytes = packJson(event, NET_LIMITS.eventBytes, 'event');
        const data = encodeBase64(bytes);
        if (roles.players.length === 1) {
          const decoded = unpackJson(bytes);
          emitEvent(decoded);
          options.recordEvent('net.event', decoded);
          return;
        }
        options.send('net.event', { seq: ++outgoingEventSequence, data });
      } catch (error) {
        if (error instanceof NetPayloadTooLargeError) oversized('event', error);
        else throw error;
      }
    },
    [NET_STATE_CHANGES]: (callback) => roles.onStateChange(callback),
  };

  return {
    net,
    get role() {
      return roles.role;
    },
    diagnostics,
    handleMessage(type, payload) {
      if (disposed) return;
      if (type === 'net.players') {
        const message = payload as { local: number; players: NetPlayer[] };
        roles.updatePlayers(message.local, message.players);
      } else if (type === 'net.role') {
        const role = (payload as { role: NetRole }).role;
        roles.updateRole(role);
        if (role === 'peer') peer.enterPeer();
      } else if (type === 'net.input') {
        host.receiveInput((payload as { f: Parameters<HostChannel['receiveInput']>[0] }).f);
      } else if (type === 'net.snapshot') {
        peer.receiveSnapshot(payload as WireSnapshot);
      } else if (type === 'net.event') {
        receiveEvent(payload as { seq: number; data: string });
      }
    },
    handleLocalFrames: (frames) => peer.sendFrames(frames),
    afterStep: (tick) => host.afterStep(tick),
    render() {
      peer.render();
      advanceEventGap();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopStateSync();
      roles.dispose();
      inputListeners.clear();
      eventListeners.clear();
      eventBuffer.clear();
    },
  };

  function receiveEvent(message: { seq: number; data: string }): void {
    if (message.seq < expectedEventSequence || eventBuffer.has(message.seq)) return;
    try {
      const bytes = decodeBase64(message.data);
      assertByteLength(bytes, NET_LIMITS.eventBytes, 'event');
      eventBuffer.set(message.seq, unpackJson(bytes));
    } catch (error) {
      if (error instanceof NetPayloadTooLargeError) oversized('event', error);
      else diagnostics.dropped += 1;
      return;
    }

    deliverAvailableEvents();
  }

  function deliverAvailableEvents(): void {
    while (eventBuffer.has(expectedEventSequence)) {
      const event = eventBuffer.get(expectedEventSequence);
      eventBuffer.delete(expectedEventSequence);
      emitEvent(event);
      options.recordEvent('net.event', event);
      expectedEventSequence += 1;
    }
    eventGapStartedAt = eventBuffer.size === 0 ? undefined : (eventGapStartedAt ?? options.now());
  }

  function advanceEventGap(): void {
    if (eventGapStartedAt === undefined || options.now() - eventGapStartedAt < 2_000) return;
    const nextSequence = Math.min(...eventBuffer.keys());
    if (!Number.isFinite(nextSequence)) return;
    diagnostics.eventGaps += 1;
    expectedEventSequence = nextSequence;
    eventGapStartedAt = undefined;
    deliverAvailableEvents();
  }
}

function subscribe<T>(listeners: Set<T>, callback: T): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export { type NetPlayer, type NetRole } from './roles.js';
export { interpolateState } from './peer.js';
export { bindLocalPlayer, type LocalPlayerBindingOptions } from './bind.js';
