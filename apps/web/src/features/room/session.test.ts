import { describe, expect, it, vi } from 'vitest';

import type { RoomState } from '@ogm/contracts';

import { createRoomStore } from '../../net/room-store';
import { fromRoomClient } from './session';

const roomState: RoomState = {
  protocol: 1,
  pin: { gameId: 'game', branchId: 'branch', buildId: 'build' },
  ownerId: 'owner',
  editorSessionId: 'session-owner',
  phase: 'editing',
  phaseAt: 1_000,
  playRev: 4,
  lastRev: 5,
  maxPlayers: 4,
  members: {
    owner: {
      userId: 'owner',
      name: 'Kim',
      role: 'owner',
      playerIndex: 0,
      connected: true,
      sessions: ['session-owner'],
    },
  },
  presence: { selection: [], privateMode: false },
};

describe('fromRoomClient', () => {
  it('exposes observable state without retaining the grant', async () => {
    const store = createRoomStore();
    const send = vi.fn();
    const leave = vi.fn(async () => undefined);
    const client = { store, send, leave };
    const session = fromRoomClient('room-1', client);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    store.getState().welcome({ userId: 'owner', playerIndex: 0, sessionId: 'session-owner' }, roomState);
    session.send({ t: 'phase', to: 'playing' });
    await session.leave();

    expect(listener).toHaveBeenCalled();
    expect(session.snapshot()).toMatchObject({ ownerId: 'owner', maxPlayers: 4, phase: 'editing' });
    expect(send).toHaveBeenCalledWith({ t: 'phase', to: 'playing' });
    expect(leave).toHaveBeenCalledWith(true);
    expect(JSON.stringify(session.snapshot())).not.toContain('grant');
    unsubscribe();
  });
});
