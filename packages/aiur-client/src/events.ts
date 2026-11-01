import { Socket } from 'phoenix';

import { AiurContractError, AiurEventFeedError } from './errors.js';
import {
  EventRecordSchema,
  type EventRecord,
  type ExportedEvent,
  type GapRecord,
  type ResetRecord,
} from './schemas.js';
import type { AiurClient } from './client.js';

export interface PhoenixJoinPushLike {
  receive(status: string, callback: (payload: unknown) => void): PhoenixJoinPushLike;
}

export interface PhoenixChannelLike {
  on(event: string, callback: (payload: unknown) => void): number;
  join(): PhoenixJoinPushLike;
  leave(): void;
}

export interface PhoenixSocketLike {
  channel(topic: string, payload: Record<string, unknown>): PhoenixChannelLike;
  connect(): void;
  disconnect(): void;
  onClose(callback: () => void): number;
  onError(callback: () => void): number;
}

export type SubscribeEventsOptions = {
  after: number;
  patterns: string[];
  onRecord(record: ExportedEvent | GapRecord): void;
  onReset(reset: Omit<ResetRecord, 'type'>): void;
  onError(error: Error): void;
  signal: AbortSignal;
};

export type SubscribeEventsDependencies = {
  socketFactory?: (
    url: string,
    params: { token: string },
    joinPayload: { after: number; topics: string[] },
  ) => PhoenixSocketLike;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
};

type DisconnectReason = 'abort' | 'closed' | 'retoken' | 'terminal';

export async function subscribeEvents(
  client: AiurClient,
  options: SubscribeEventsOptions,
  dependencies: SubscribeEventsDependencies = {},
): Promise<void> {
  const socketFactory = dependencies.socketFactory ?? defaultSocketFactory;
  const wait = dependencies.sleep ?? abortableSleep;
  const random = dependencies.random ?? Math.random;
  const socketUrl = `${client.baseUrl.replace(/^http/, 'ws')}/events`;
  let cursor = options.after;
  let backoffMs = 1000;

  while (!options.signal.aborted) {
    let token: string;
    try {
      token = (await client.eventsToken()).token;
    } catch (error) {
      options.onError(asError(error));
      await wait(jitter(backoffMs, random), options.signal).catch(() => undefined);
      backoffMs = Math.min(backoffMs * 2, 30_000);
      continue;
    }

    const joinPayload = { after: cursor, topics: options.patterns };
    const socket = socketFactory(socketUrl, { token }, joinPayload);
    const channel = socket.channel('events:feed', joinPayload);
    const reason = await runConnection(
      socket,
      channel,
      options,
      (record) => {
        if (record.type === 'event' || record.type === 'gap') {
          cursor = record.seq;
          options.onRecord(record);
        } else if (record.type === 'reset') {
          cursor = record.head_seq;
          options.onReset({
            oldest_seq: record.oldest_seq,
            head_seq: record.head_seq,
            ...(record.epoch === undefined ? {} : { epoch: record.epoch }),
          });
        }
      },
      () => {
        backoffMs = 1000;
      },
    );

    channel.leave();
    socket.disconnect();
    if (reason === 'abort' || reason === 'terminal') return;
    if (reason === 'retoken') {
      backoffMs = 1000;
      continue;
    }

    await wait(jitter(backoffMs, random), options.signal).catch(() => undefined);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }
}

async function runConnection(
  socket: PhoenixSocketLike,
  channel: PhoenixChannelLike,
  options: SubscribeEventsOptions,
  onRecord: (record: EventRecord) => void,
  onJoined: () => void,
): Promise<DisconnectReason> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (reason: DisconnectReason) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener('abort', abort);
      resolve(reason);
    };
    const abort = () => settle('abort');
    options.signal.addEventListener('abort', abort, { once: true });
    socket.onClose(() => settle(options.signal.aborted ? 'abort' : 'closed'));
    socket.onError(() => settle(options.signal.aborted ? 'abort' : 'closed'));
    channel.on('record', (payload) => {
      const parsed = EventRecordSchema.safeParse(payload);
      if (!parsed.success) {
        options.onError(new AiurContractError('valid aiur event record', 'invalid event record', parsed.error.message));
        settle('closed');
        return;
      }
      const record = parsed.data;
      if (record.type === 'auth_expiring') {
        settle('retoken');
      } else if (record.type === 'error') {
        options.onError(new AiurEventFeedError(record.code));
        settle(record.code === 'feature_disabled' ? 'terminal' : 'closed');
      } else {
        onRecord(record);
      }
    });
    channel
      .join()
      .receive('ok', onJoined)
      .receive('error', (payload) => {
        const code = joinErrorCode(payload);
        options.onError(new AiurEventFeedError(code));
        settle(code === 'feature_disabled' ? 'terminal' : 'closed');
      })
      .receive('timeout', () => {
        options.onError(new AiurEventFeedError('join_timeout'));
        settle('closed');
      });
    socket.connect();
    if (options.signal.aborted) settle('abort');
  });
}

function defaultSocketFactory(url: string, params: { token: string }): PhoenixSocketLike {
  return new Socket(url, { params, transport: WebSocket }) as unknown as PhoenixSocketLike;
}

function joinErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'join_failed';
  const reason = (payload as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason : 'join_failed';
}

function jitter(delay: number, random: () => number): number {
  return Math.round(delay * (0.75 + random() * 0.5));
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
