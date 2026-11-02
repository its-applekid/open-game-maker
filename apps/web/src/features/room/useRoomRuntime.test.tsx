import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Envelope, RoomState, ServerMessage } from '@ogm/contracts';

import type { OgmHost } from '../../app/testHook';
import { api } from '../../lib/api/client';
import { createRoomStore } from '../../net/room-store';

const mocks = vi.hoisted(() => ({
  createRoomConnection: vi.fn(),
  roomGrantState: vi.fn(),
  storeRoomGrant: vi.fn(),
}));

vi.mock('../../net', () => ({ createRoomConnection: mocks.createRoomConnection }));
vi.mock('../../lib/api/client', () => ({ api: vi.fn() }));
vi.mock('../../routes/join/grant-store', () => ({
  roomGrantState: mocks.roomGrantState,
  storeRoomGrant: mocks.storeRoomGrant,
}));

import { useRoomRuntime } from './useRoomRuntime';

const state: RoomState = {
  protocol: 1,
  pin: { gameId: 'game', branchId: 'main', buildId: 'build' },
  ownerId: 'owner',
  editorSessionId: 'owner-session',
  phase: 'editing',
  phaseAt: 1_000,
  playRev: 2,
  lastRev: 3,
  maxPlayers: 4,
  members: {},
  presence: { selection: [], privateMode: false },
};

beforeEach(() => {
  mocks.createRoomConnection.mockReset();
  mocks.roomGrantState.mockReset();
  mocks.storeRoomGrant.mockReset();
  vi.mocked(api).mockReset();
});

it('reacquires a memory-only grant after a reload', async () => {
  const store = createRoomStore();
  const join = vi.fn().mockResolvedValue(undefined);
  const fresh = {
    roomId: 'room-1',
    grant: 'fresh-secret',
    pin: state.pin,
    roomsUrl: 'wss://rooms.test',
  };
  mocks.roomGrantState.mockReturnValue(null);
  vi.mocked(api).mockResolvedValue(fresh);
  mocks.storeRoomGrant.mockImplementation((input) => {
    const stored = { ...input, expiresAt: 2_000 };
    mocks.roomGrantState.mockReturnValue(stored);
    return stored;
  });
  mocks.createRoomConnection.mockReturnValue({
    client: { store, join, send: vi.fn(), leave: vi.fn() },
    forwarding: { handleGameMessage: vi.fn(), detach: vi.fn() },
    destroy: vi.fn().mockResolvedValue(undefined),
  });
  const frame = { sendRoomMessage: vi.fn() };

  renderHook(() => useRoomRuntime({ frame, roomId: 'room-1', testMode: false }));

  await waitFor(() => expect(api).toHaveBeenCalledWith('/rooms/room-1/grant'));
  await waitFor(() => expect(join).toHaveBeenCalledWith(expect.objectContaining({ grant: 'fresh-secret' })));
  expect(mocks.storeRoomGrant).toHaveBeenCalledWith(fresh);
});

afterEach(() => {
  delete window.__ogmHost;
});

it('joins from the matching memory grant and adapts frame messages', async () => {
  const store = createRoomStore();
  const join = vi.fn().mockResolvedValue(undefined);
  const forwarding = { handleGameMessage: vi.fn(), detach: vi.fn() };
  const destroy = vi.fn().mockResolvedValue(undefined);
  mocks.roomGrantState.mockReturnValue({
    roomId: 'room-1',
    grant: 'secret',
    expiresAt: 2_000,
    pin: state.pin,
    roomsUrl: 'wss://rooms.test',
  });
  mocks.createRoomConnection.mockReturnValue({
    client: { store, join, send: vi.fn(), leave: vi.fn() },
    forwarding,
    destroy,
  });
  const frame = { sendRoomMessage: vi.fn() };

  const { result, unmount } = renderHook(() => useRoomRuntime({ frame, roomId: 'room-1', testMode: false }));

  await waitFor(() => expect(join).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room-1' })));
  act(() => store.getState().welcome({ userId: 'owner', playerIndex: 0, sessionId: 'owner-session' }, state));
  expect(result.current.snapshot).toMatchObject({ status: 'connected', role: 'host' });

  const envelope: Envelope<string, unknown> = { v: 1, id: 'game-1', t: 'ready', payload: {} };
  result.current.handleGameMessage(envelope);
  expect(forwarding.handleGameMessage).toHaveBeenCalledWith(envelope);

  unmount();
  await waitFor(() => expect(destroy).toHaveBeenCalledOnce());
});

it('installs a socket-free fake session on the browser test hook', async () => {
  window.__ogmHost = {
    version: 1,
    route: () => '/g/game',
    navigate: vi.fn(),
    register: vi.fn(),
    get: vi.fn(),
    snapshot: () => ({ route: '/g/game', registered: [] }),
  } satisfies OgmHost;

  const frame = { sendRoomMessage: vi.fn() };
  const { result } = renderHook(() => useRoomRuntime({ frame, roomId: undefined, testMode: true }));
  const room = (
    window.__ogmHost as OgmHost & {
      room?: { fake: { emit(message: ServerMessage): void } };
    }
  ).room;
  expect(room?.fake).toBeDefined();

  act(() => {
    room?.fake.emit({
      t: 'welcome',
      you: { userId: 'watcher', playerIndex: 1, sessionId: 'watcher-session' },
      state,
    });
    room?.fake.emit({
      t: 'design.tx',
      tx: {
        branchId: 'main',
        rev: 4,
        baseRev: 3,
        actor: 'owner',
        kind: 'manual',
        patches: [{ op: 'add', path: ['globals', 'gravity'], value: 9 }],
      },
    });
  });

  await waitFor(() => expect(result.current.snapshot).toMatchObject({ status: 'connected', role: 'peer' }));
  expect(frame.sendRoomMessage).toHaveBeenNthCalledWith(1, {
    v: 1,
    id: 'fake-room-design-1',
    t: 'design.apply',
    payload: { rev: 3, doc: { schemaVersion: 1, globals: {}, entities: {} }, patches: [] },
  });
  expect(frame.sendRoomMessage).toHaveBeenNthCalledWith(2, {
    v: 1,
    id: 'fake-room-design-2',
    t: 'design.apply',
    payload: {
      rev: 4,
      doc: { schemaVersion: 1, globals: { gravity: 9 }, entities: {} },
      patches: [{ op: 'add', path: ['globals', 'gravity'], value: 9 }],
    },
  });
  expect(mocks.createRoomConnection).not.toHaveBeenCalled();
});
