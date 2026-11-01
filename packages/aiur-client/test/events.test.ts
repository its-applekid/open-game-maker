import { describe, expect, it, vi } from 'vitest';

import {
  subscribeEvents,
  type AiurClient,
  type EventRecord,
  type PhoenixChannelLike,
  type PhoenixSocketLike,
} from '../src/index.js';

class FakeChannel implements PhoenixChannelLike {
  readonly handlers = new Map<string, Array<(payload: unknown) => void>>();
  joinPayload: Record<string, unknown>;

  constructor(joinPayload: Record<string, unknown>) {
    this.joinPayload = joinPayload;
  }

  on(event: string, callback: (payload: unknown) => void): number {
    const callbacks = this.handlers.get(event) ?? [];
    callbacks.push(callback);
    this.handlers.set(event, callbacks);
    return callbacks.length;
  }

  join() {
    return {
      receive: (status: string, callback: (payload: unknown) => void) => {
        if (status === 'ok') queueMicrotask(() => callback({}));
        return this.join();
      },
    };
  }

  leave(): void {}

  pushRecord(payload: unknown): void {
    for (const callback of this.handlers.get('record') ?? []) callback(payload);
  }
}

class FakeSocket implements PhoenixSocketLike {
  readonly channelInstance: FakeChannel;
  private closeCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<() => void> = [];

  constructor(payload: Record<string, unknown>) {
    this.channelInstance = new FakeChannel(payload);
  }

  channel(): PhoenixChannelLike {
    return this.channelInstance;
  }

  connect(): void {}
  disconnect(): void {}
  onClose(callback: () => void): number {
    this.closeCallbacks.push(callback);
    return this.closeCallbacks.length;
  }
  onError(callback: () => void): number {
    this.errorCallbacks.push(callback);
    return this.errorCallbacks.length;
  }
  close(): void {
    for (const callback of this.closeCallbacks) callback();
  }
}

function fakeClient(eventsToken = vi.fn().mockResolvedValue({ token: 'token', expires_in_seconds: 300 })): AiurClient {
  return {
    baseUrl: 'http://127.0.0.1:4000',
    eventsToken,
  } as unknown as AiurClient;
}

function exportedEvent(seq: number): EventRecord {
  return {
    type: 'event',
    seq,
    v: 1,
    instance: 'local',
    id: seq,
    topic: 'ticket.142.lifecycle.changed',
    class: 'live',
    occurred_at: null,
    observed_at: '2026-10-31T18:00:00Z',
    source: 'test',
    refs: {},
    attrs: { lifecycle: 'running' },
    payload: { lifecycle: 'running' },
    payload_version: 1,
    anchor: null,
  };
}

async function until(check: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition not reached');
}

describe('subscribeEvents', () => {
  it('delivers ordered records and joins with the requested cursor and topics', async () => {
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const onRecord = vi.fn<(record: EventRecord) => void>();
    const promise = subscribeEvents(
      fakeClient(),
      {
        after: 10,
        patterns: ['ticket.142.#'],
        onRecord,
        onReset: vi.fn(),
        onError: vi.fn(),
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep: async () => undefined,
      },
    );
    await until(() => sockets.length === 1);

    sockets[0]!.channelInstance.pushRecord(exportedEvent(11));
    sockets[0]!.channelInstance.pushRecord(exportedEvent(12));

    expect(sockets[0]!.channelInstance.joinPayload).toEqual({ after: 10, topics: ['ticket.142.#'] });
    expect(onRecord.mock.calls.map(([record]) => record.seq)).toEqual([11, 12]);
    controller.abort();
    await promise;
  });

  it('re-tokens on auth_expiring and rejoins at the last sequence', async () => {
    const eventsToken = vi.fn().mockResolvedValue({ token: 'token', expires_in_seconds: 300 });
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const promise = subscribeEvents(
      fakeClient(eventsToken),
      {
        after: 10,
        patterns: ['ticket.142.#'],
        onRecord: vi.fn(),
        onReset: vi.fn(),
        onError: vi.fn(),
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep: async () => undefined,
      },
    );
    await until(() => sockets.length === 1);
    sockets[0]!.channelInstance.pushRecord(exportedEvent(11));
    sockets[0]!.channelInstance.pushRecord({ type: 'auth_expiring', in_ms: 30000 });
    await until(() => sockets.length === 2);

    expect(eventsToken).toHaveBeenCalledTimes(2);
    expect(sockets[1]!.channelInstance.joinPayload).toEqual({ after: 11, topics: ['ticket.142.#'] });
    controller.abort();
    await promise;
  });

  it('delivers exporter gaps and resumes after their sequence', async () => {
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const onRecord = vi.fn<(record: EventRecord) => void>();
    const promise = subscribeEvents(
      fakeClient(),
      {
        after: 0,
        patterns: [],
        onRecord,
        onReset: vi.fn(),
        onError: vi.fn(),
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep: async () => undefined,
      },
    );
    await until(() => sockets.length === 1);
    sockets[0]!.channelInstance.pushRecord({
      type: 'gap',
      seq: 1,
      scope: '*',
      reason: 'exporter_start',
      from: null,
      to: '2026-10-31T18:00:00Z',
    });
    sockets[0]!.close();
    await until(() => sockets.length === 2);

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ type: 'gap', seq: 1 }));
    expect(sockets[1]!.channelInstance.joinPayload).toEqual({ after: 1, topics: [] });
    controller.abort();
    await promise;
  });

  it('surfaces resets and reconnects from the reset head', async () => {
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const onReset = vi.fn();
    const promise = subscribeEvents(
      fakeClient(),
      {
        after: 10,
        patterns: ['ticket.142.#'],
        onRecord: vi.fn(),
        onReset,
        onError: vi.fn(),
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep: async () => undefined,
      },
    );
    await until(() => sockets.length === 1);
    sockets[0]!.channelInstance.pushRecord({ type: 'reset', oldest_seq: 800, head_seq: 900, epoch: 'new' });
    sockets[0]!.close();
    await until(() => sockets.length === 2);

    expect(onReset).toHaveBeenCalledWith({ oldest_seq: 800, head_seq: 900, epoch: 'new' });
    expect(sockets[1]!.channelInstance.joinPayload).toEqual({ after: 900, topics: ['ticket.142.#'] });
    controller.abort();
    await promise;
  });

  it('backs off after a socket close', async () => {
    const sockets: FakeSocket[] = [];
    const sleep = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    const promise = subscribeEvents(
      fakeClient(),
      {
        after: 0,
        patterns: [],
        onRecord: vi.fn(),
        onReset: vi.fn(),
        onError: vi.fn(),
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep,
        random: () => 0.5,
      },
    );
    await until(() => sockets.length === 1);
    sockets[0]!.close();
    await until(() => sockets.length === 2);

    expect(sleep).toHaveBeenCalledWith(1000, controller.signal);
    controller.abort();
    await promise;
  });

  it('surfaces a feature-disabled record and stops reconnecting', async () => {
    const sockets: FakeSocket[] = [];
    const onError = vi.fn();
    const controller = new AbortController();
    const promise = subscribeEvents(
      fakeClient(),
      {
        after: 0,
        patterns: [],
        onRecord: vi.fn(),
        onReset: vi.fn(),
        onError,
        signal: controller.signal,
      },
      {
        socketFactory: (_url, _params, joinPayload) => {
          const socket = new FakeSocket(joinPayload);
          sockets.push(socket);
          return socket;
        },
        sleep: async () => undefined,
      },
    );
    await until(() => sockets.length === 1);
    sockets[0]!.channelInstance.pushRecord({ type: 'error', code: 'feature_disabled' });
    await promise;

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'feature_disabled' }));
    expect(sockets).toHaveLength(1);
  });
});
