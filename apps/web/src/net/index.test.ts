import type { JoinOptions } from '@ogm/contracts';
import type { RoomState, ServerMessage } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createRoomConnection, TRANSPORT_PROTOCOL } from './index';
import type { ClientTransport, RoomTransport } from './room-client';

/**
 * The switchboard is only built for a room that can signal (#498 §4.5, §7.5). Before N3 lands, every room on `main`
 * reports `protocol: 1`, so the shipped message flow must stay exactly what it is today: relay only, no candidate, no
 * signalling. Reverting the protocol or sink guard in `index.ts` fails these cases.
 */

const pin = { gameId: 'game-1', branchId: 'main', buildId: 'build-1' };
const grant = { roomId: 'room-1', grant: 'secret-grant', pin, expiresAt: Date.now() + 120_000 };

function roomState(protocol: number): RoomState {
  return {
    protocol,
    pin,
    ownerId: 'owner-1',
    editorSessionId: 'session-1',
    phase: 'editing',
    phaseAt: 1,
    playRev: 0,
    lastRev: 1,
    maxPlayers: 4,
    members: {
      'owner-1': {
        userId: 'owner-1',
        name: 'Kevin',
        role: 'owner',
        playerIndex: 0,
        connected: true,
        sessions: ['session-1'],
      },
      'player-1': {
        userId: 'player-1',
        name: 'Sam',
        role: 'player',
        playerIndex: 1,
        connected: true,
        sessions: ['session-2'],
      },
    },
    presence: { selection: [], privateMode: false },
  };
}

type ListenerSignal<T extends (...args: never[]) => unknown> = {
  (listener: T): void;
  remove(listener: T): void;
  emit(...args: Parameters<T>): void;
};

function signal<T extends (...args: never[]) => unknown>(): ListenerSignal<T> {
  const listeners = new Set<T>();
  const add = ((listener: T) => {
    listeners.add(listener);
  }) as ListenerSignal<T>;
  add.remove = (listener) => listeners.delete(listener);
  add.emit = (...args) => listeners.forEach((listener) => listener(...args));
  return add;
}

class FakeRoom implements RoomTransport {
  sessionId = 'session-1';
  reconnectionToken = 'room-1:token';
  reconnection = { enabled: true };
  send = vi.fn();
  leave = vi.fn(async () => 1000);
  readonly onStateChange = signal<(state: unknown) => void>();
  readonly onLeave = signal<(code: number, reason?: string) => void>();
  private readonly handlers = new Set<(type: string | number, payload: unknown) => void>();

  onMessage(_type: '*', listener: (type: string | number, payload: unknown) => void): () => void {
    this.handlers.add(listener);
    return () => this.handlers.delete(listener);
  }

  emit(type: ServerMessage['t'], payload: Omit<ServerMessage, 't'>): void {
    this.handlers.forEach((handler) => handler(type, payload));
  }
}

class FakeClient implements ClientTransport {
  joinById = vi.fn<(_roomId: string, _options: JoinOptions) => Promise<RoomTransport>>();
  reconnect = vi.fn<(_token: string) => Promise<RoomTransport>>();

  constructor(room: RoomTransport) {
    this.joinById.mockResolvedValue(room);
    this.reconnect.mockResolvedValue(room);
  }
}

async function connect(protocol: number, options: { signal?: boolean } = {}) {
  const room = new FakeRoom();
  const signalled: string[] = [];
  const connection = createRoomConnection({
    roomsUrl: 'ws://rooms.test',
    bridge: { send: () => {} },
    clientFactory: () => new FakeClient(room),
    transport:
      options.signal === false
        ? {}
        : {
            signal: {
              send: (_to, data) => signalled.push(data),
              onSignal: () => () => {},
            },
          },
  });
  await connection.client.join(grant);
  room.emit('welcome', {
    you: { userId: 'owner-1', playerIndex: 0, sessionId: 'session-1' },
    state: roomState(protocol),
  });
  return { connection, room, signalled };
}

describe('createRoomConnection transport wiring', () => {
  it('never builds a switchboard for a v1 room, so the message flow is unchanged', async () => {
    const { connection, room, signalled } = await connect(1);
    expect(TRANSPORT_PROTOCOL).toBe(2);
    expect(connection.transport).toBeUndefined();
    expect(signalled).toEqual([]);
    expect(room.send).not.toHaveBeenCalledWith('net.signal', expect.anything());
    await connection.destroy();
  });

  it('never builds a switchboard without a signalling sink, even on a v2 room', async () => {
    const { connection, signalled } = await connect(2, { signal: false });
    expect(connection.transport).toBeUndefined();
    expect(signalled).toEqual([]);
    await connection.destroy();
  });

  it('builds one switchboard on a v2 room that can signal', async () => {
    const { connection } = await connect(2);
    expect(connection.transport).toBeDefined();
    expect([...connection.transport!.stats().keys()]).toEqual([1]);
    await connection.destroy();
  });
});
