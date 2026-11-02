import type { RoomState } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createRoomStore } from './room-store';

const state: RoomState = {
  protocol: 1,
  pin: { gameId: 'game-1', branchId: 'main', buildId: 'build-1' },
  ownerId: 'owner-1',
  editorSessionId: 'editor-session',
  phase: 'playing',
  phaseAt: 10,
  playRev: 4,
  lastRev: 4,
  maxPlayers: 4,
  members: {},
  presence: { selection: [], privateMode: false },
};

it('derives the editor role from the active session and forwards actions', () => {
  const send = vi.fn();
  const store = createRoomStore();
  store.getState().bind({ send });

  store.getState().welcome({ userId: 'owner-1', playerIndex: 0, sessionId: 'editor-session' }, state);
  expect(store.getState()).toMatchObject({ role: 'host', phase: 'playing', playRev: 4 });

  store.getState().play();
  store.getState().edit();
  store.getState().kick('user-2');
  store.getState().setPresence({ selection: ['entity-1'] });
  store.getState().loadDraft('build-2', 'https://games.example.test/build-2');

  expect(send.mock.calls).toEqual([
    [{ t: 'phase', to: 'playing' }],
    [{ t: 'phase', to: 'editing' }],
    [{ t: 'kick', userId: 'user-2' }],
    [{ t: 'presence', p: { selection: ['entity-1'] } }],
    [{ t: 'draft.load', buildId: 'build-2', url: 'https://games.example.test/build-2' }],
  ]);
});

describe('room state changes', () => {
  it('moves the editor role when the server changes editorSessionId', () => {
    const store = createRoomStore();
    store.getState().welcome({ userId: 'owner-1', playerIndex: 0, sessionId: 'editor-session' }, state);

    store.getState().sync({ ...state, editorSessionId: 'another-session', phase: 'pausedForHost' });

    expect(store.getState()).toMatchObject({ role: 'peer', phase: 'pausedForHost' });
  });
});
