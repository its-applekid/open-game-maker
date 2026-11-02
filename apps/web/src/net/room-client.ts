import { Client as ColyseusClient } from '@colyseus/sdk';
import {
  ClientMessageSchema,
  JoinRejectionSchema,
  LIMITS,
  PROTOCOL_VERSION,
  RoomStateSchema,
  ServerMessageSchema,
  type ClientMessage,
  type JoinOptions,
  type RoomPin,
  type ServerMessage,
} from '@ogm/contracts/browser';

import { api } from '../lib/api/client';
import { useRoom, type RoomStoreApi } from './room-store';

type Signal<Listener extends (...args: never[]) => unknown> = {
  (listener: Listener): unknown;
  remove(listener: Listener): void;
};

export type RoomTransport = {
  sessionId: string;
  reconnectionToken: string;
  reconnection?: { enabled: boolean };
  onStateChange: Signal<(state: unknown) => void>;
  onLeave: Signal<(code: number, reason?: string) => void>;
  onMessage(type: '*', listener: (type: string | number, payload: unknown) => void): () => void;
  send(type: string, payload?: unknown): void;
  leave(consented?: boolean): Promise<unknown>;
};

export type ClientTransport = {
  joinById(roomId: string, options: JoinOptions): Promise<RoomTransport>;
  reconnect(reconnectionToken: string): Promise<RoomTransport>;
};

export type RoomGrant = {
  grant: string;
  pin: RoomPin;
  expiresAt: number;
};

export type JoinRoom = RoomGrant & { roomId: string };
export type ServerMessageListener = (message: ServerMessage) => void;

export type RoomClientOptions = {
  roomsUrl: string;
  store?: RoomStoreApi;
  fetchGrant?: (roomId: string) => Promise<RoomGrant>;
  clientFactory?: (roomsUrl: string) => ClientTransport;
  now?: () => number;
};

const encoder = new TextEncoder();
const reconnectDelays = [0, 500, 1_000, 2_000, 4_000];
const receivedLimit = 2_000;

export class RoomClient {
  readonly store: RoomStoreApi;

  private readonly transport: ClientTransport;
  private readonly fetchGrant: (roomId: string) => Promise<RoomGrant>;
  private readonly now: () => number;
  private readonly listeners = new Set<ServerMessageListener>();
  private readonly receivedMessages: ServerMessage[] = [];
  private readonly warned = new Set<ClientMessage['t']>();
  private room?: RoomTransport;
  private credentials?: JoinRoom;
  private roomCleanup: Array<() => void> = [];
  private grantTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private refreshInFlight?: { operationId: number; promise: Promise<boolean> };
  private consentedLeave = false;
  private reconnectingOperationId?: number;
  private welcomed = false;
  private operationId = 0;

  constructor(options: RoomClientOptions) {
    this.store = options.store ?? useRoom;
    this.transport =
      options.clientFactory?.(options.roomsUrl) ?? (new ColyseusClient(options.roomsUrl) as unknown as ClientTransport);
    this.fetchGrant = options.fetchGrant ?? fetchRoomGrant;
    this.now = options.now ?? Date.now;
    this.store.getState().bind(this);
  }

  async join(input: JoinRoom): Promise<void> {
    const operationId = ++this.operationId;
    const previousRoom = this.room;
    this.consentedLeave = true;
    this.clearTimers();
    this.detachRoom();
    this.consentedLeave = false;
    this.credentials = input;
    this.store.getState().connection('connecting');
    if (previousRoom !== undefined) await discardRoom(previousRoom);
    if (!this.isCurrent(operationId)) return;
    this.scheduleGrantRefresh(input.expiresAt, operationId);
    await this.joinCurrent(false, operationId);
  }

  send(message: ClientMessage): void {
    if (this.room === undefined) return;
    const parsed = ClientMessageSchema.safeParse(message);
    if (!parsed.success || exceedsClientLimit(message)) {
      this.warnOnce(message.t);
      return;
    }
    const { t, ...payload } = parsed.data;
    this.room.send(t, payload);
  }

  subscribe(listener: ServerMessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  received(): ServerMessage[] {
    return [...this.receivedMessages];
  }

  async leave(consented = true): Promise<void> {
    if (!consented) {
      this.consentedLeave = false;
      if (this.room !== undefined) await this.room.leave(false);
      return;
    }
    const operationId = ++this.operationId;
    const room = this.room;
    this.consentedLeave = true;
    this.credentials = undefined;
    this.refreshInFlight = undefined;
    this.clearTimers();
    try {
      if (room !== undefined) await room.leave(true);
    } finally {
      if (this.isCurrent(operationId)) {
        if (this.room === room) this.detachRoom();
        if (this.store.getState().status !== 'ended') this.store.getState().connection('idle');
      }
    }
  }

  private async joinCurrent(refreshed: boolean, operationId: number): Promise<void> {
    if (!this.isCurrent(operationId)) return;
    const credentials = this.credentials;
    if (credentials === undefined) return;
    try {
      const room = await this.transport.joinById(credentials.roomId, {
        grant: credentials.grant,
        buildId: credentials.pin.buildId,
        protocol: PROTOCOL_VERSION,
      });
      if (!this.isCurrent(operationId)) {
        await discardRoom(room);
        return;
      }
      this.attachRoom(room, false, operationId);
    } catch (error) {
      if (!this.isCurrent(operationId)) return;
      const rejection = parseJoinRejection(error);
      if (rejection.code === 'GRANT_EXPIRED' && !refreshed && (await this.refreshGrant(operationId))) {
        await this.joinCurrent(true, operationId);
        return;
      }
      this.clearTimers();
      this.store.getState().reject(rejection);
    }
  }

  private attachRoom(room: RoomTransport, connected: boolean, operationId: number): void {
    if (!this.isCurrent(operationId)) return;
    this.detachRoom();
    this.room = room;
    this.welcomed = connected && this.store.getState().you !== undefined;
    if (room.reconnection !== undefined) room.reconnection.enabled = false;

    const onState = (raw: unknown) => {
      if (!this.isAttached(room, operationId)) return;
      const state = RoomStateSchema.safeParse(toJson(raw));
      if (!state.success) return;
      if (!this.welcomed) {
        const member = Object.values(state.data.members).find(({ sessions }) => sessions.includes(room.sessionId));
        if (member !== undefined) {
          this.acceptMessage(
            {
              t: 'welcome',
              you: { userId: member.userId, playerIndex: member.playerIndex, sessionId: room.sessionId },
              state: state.data,
            },
            false,
          );
          return;
        }
      }
      this.store.getState().sync(state.data);
    };
    const onLeave = () => {
      if (!this.isAttached(room, operationId) || this.consentedLeave || this.store.getState().status === 'ended')
        return;
      void this.reconnect(room.reconnectionToken, operationId);
    };
    room.onStateChange(onState);
    room.onLeave(onLeave);
    const removeMessages = room.onMessage('*', (type, payload) => {
      if (this.isAttached(room, operationId)) this.receive(String(type), payload);
    });
    this.roomCleanup = [removeMessages, () => room.onStateChange.remove(onState), () => room.onLeave.remove(onLeave)];
    if (connected) this.store.getState().connection('connected');
  }

  private detachRoom(): void {
    for (const cleanup of this.roomCleanup.splice(0)) cleanup();
    this.room = undefined;
  }

  private receive(type: string, payload: unknown): void {
    const candidate =
      payload !== null && typeof payload === 'object'
        ? { t: type, ...(payload as Record<string, unknown>) }
        : { t: type };
    const parsed = ServerMessageSchema.safeParse(candidate);
    if (!parsed.success) return;
    this.acceptMessage(parsed.data, true);
  }

  private acceptMessage(message: ServerMessage, record: boolean): void {
    if (record) this.receivedMessages.push(message);
    if (this.receivedMessages.length > receivedLimit)
      this.receivedMessages.splice(0, this.receivedMessages.length - receivedLimit);

    if (message.t === 'welcome' && this.welcomed) return;

    switch (message.t) {
      case 'welcome':
        this.welcomed = true;
        this.store.getState().welcome(message.you, message.state);
        this.startPing();
        break;
      case 'pong':
        this.store.getState().setRtt(Math.max(0, this.now() - message.c));
        break;
      case 'ended':
        this.store.getState().end(message.reason);
        this.clearTimers();
        break;
      default:
        break;
    }
    for (const listener of this.listeners) listener(message);
  }

  private async reconnect(token: string, operationId: number): Promise<void> {
    if (!this.isCurrent(operationId) || this.reconnectingOperationId === operationId) return;
    this.reconnectingOperationId = operationId;
    this.store.getState().connection('reconnecting');
    try {
      for (const delay of reconnectDelays) {
        if (delay > 0) await wait(delay);
        if (!this.isCurrent(operationId) || this.consentedLeave || this.store.getState().status === 'ended') return;
        try {
          const room = await this.transport.reconnect(token);
          if (!this.isCurrent(operationId) || this.consentedLeave) {
            await discardRoom(room);
            return;
          }
          this.attachRoom(room, true, operationId);
          return;
        } catch {
          // The bounded retry loop falls back to a fresh grant below.
        }
      }
      if (await this.refreshGrant(operationId)) {
        this.store.getState().connection('connecting');
        await this.joinCurrent(true, operationId);
      } else if (this.isCurrent(operationId)) {
        this.store.getState().reject({ code: 'GRANT_INVALID' });
      }
    } finally {
      if (this.reconnectingOperationId === operationId) this.reconnectingOperationId = undefined;
    }
  }

  private scheduleGrantRefresh(expiresAt: number, operationId: number): void {
    if (this.grantTimer !== undefined) clearTimeout(this.grantTimer);
    const delay = Math.max(0, asEpochMs(expiresAt) - this.now() - 60_000);
    this.grantTimer = setTimeout(() => void this.refreshGrant(operationId), delay);
  }

  private async refreshGrant(operationId: number): Promise<boolean> {
    if (!this.isCurrent(operationId)) return false;
    if (this.refreshInFlight?.operationId === operationId) return this.refreshInFlight.promise;
    const promise = this.performGrantRefresh(operationId).finally(() => {
      if (this.refreshInFlight?.promise === promise) this.refreshInFlight = undefined;
    });
    this.refreshInFlight = { operationId, promise };
    return promise;
  }

  private async performGrantRefresh(operationId: number): Promise<boolean> {
    if (!this.isCurrent(operationId)) return false;
    const current = this.credentials;
    if (current === undefined) return false;
    try {
      const next = await this.fetchGrant(current.roomId);
      if (!this.isCurrent(operationId)) return false;
      this.credentials = { roomId: current.roomId, ...next };
      if (asEpochMs(next.expiresAt) > asEpochMs(current.expiresAt)) {
        this.scheduleGrantRefresh(next.expiresAt, operationId);
      }
      return true;
    } catch {
      return false;
    }
  }

  private startPing(): void {
    if (this.pingTimer !== undefined) return;
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: this.now() }), 5_000);
  }

  private clearTimers(): void {
    if (this.grantTimer !== undefined) clearTimeout(this.grantTimer);
    if (this.pingTimer !== undefined) clearInterval(this.pingTimer);
    this.grantTimer = undefined;
    this.pingTimer = undefined;
  }

  private warnOnce(type: ClientMessage['t']): void {
    if (this.warned.has(type)) return;
    this.warned.add(type);
    console.warn(`Dropped oversized or invalid room ${type} message`);
  }

  private isCurrent(operationId: number): boolean {
    return this.operationId === operationId;
  }

  private isAttached(room: RoomTransport, operationId: number): boolean {
    return this.isCurrent(operationId) && this.room === room;
  }
}

async function fetchRoomGrant(roomId: string): Promise<RoomGrant> {
  return api<RoomGrant>(`/rooms/${encodeURIComponent(roomId)}/grant`);
}

function parseJoinRejection(error: unknown) {
  if (error instanceof Error) {
    try {
      const start = error.message.indexOf('{');
      const end = error.message.lastIndexOf('}');
      const source = start >= 0 && end >= start ? error.message.slice(start, end + 1) : error.message;
      const parsed = JoinRejectionSchema.safeParse(JSON.parse(source));
      if (parsed.success) return parsed.data;
    } catch {
      // Deliberately fall through without retaining or reporting the source message.
    }
  }
  return { code: 'GRANT_INVALID' as const };
}

function exceedsClientLimit(message: ClientMessage): boolean {
  switch (message.t) {
    case 'input':
      return encoder.encode(JSON.stringify(message.f)).byteLength > LIMITS.inputBytes;
    case 'snapshot':
      return message.data.byteLength > LIMITS.snapshotBytes;
    case 'event':
      return message.data.byteLength > LIMITS.eventBytes;
    case 'design.tx':
      return encoder.encode(JSON.stringify(message.tx)).byteLength > LIMITS.designTxBytes;
    default:
      return false;
  }
}

function asEpochMs(expiresAt: number): number {
  return expiresAt < 10_000_000_000 ? expiresAt * 1_000 : expiresAt;
}

function toJson(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return value;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discardRoom(room: RoomTransport): Promise<void> {
  try {
    await room.leave(true);
  } catch {
    // Best-effort cleanup for a stale session must not change the current room lifecycle.
  }
}
