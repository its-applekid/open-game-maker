import type { RoomState } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { projectServerMessage, roomStateV1From, serverMessageV1 } from './room-state-v1';

const pin = { gameId: 'game-1', branchId: 'main', buildId: 'build-1' };

const v1State: RoomState = {
  protocol: 1,
  pin,
  ownerId: 'owner-1',
  editorSessionId: 'session-1',
  phase: 'editing',
  phaseAt: 1,
  playRev: 0,
  lastRev: 40,
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
  },
  presence: { selection: [], privateMode: false },
};

const v2State = {
  ...v1State,
  protocol: 2,
  seats: [
    {
      seat: 0,
      userId: 'owner-1',
      name: 'Kevin',
      team: 0,
      connected: true,
      ready: false,
      forfeited: false,
      spectator: false,
    },
    { seat: 1, userId: '', name: '', team: 1, connected: false, ready: false, forfeited: false, spectator: false },
  ],
  spectators: ['watcher-1'],
  epoch: '6f1c0f7e-0d2b-4a1e-9d54-2b6a1c9c3f11',
  startAt: 1_761_899_400_000,
  pausedAt: 0,
  primarySeat: 0,
  seed: 2748321608,
  rulesetHash: 'fnv1a64:9f2c',
};

describe('protocol 2 room documents on a v1 client', () => {
  it('accepts the v1 state unchanged', () => {
    expect(roomStateV1From(v1State)).toEqual(v1State);
  });

  it('projects the seat table, epoch and pin out of a v2 room state', () => {
    const projected = roomStateV1From(v2State);
    expect(projected).toEqual({ ...v1State, protocol: 2 });
  });

  it('still refuses a document that is not room state at all', () => {
    expect(roomStateV1From({ pin })).toBeUndefined();
    expect(roomStateV1From(null)).toBeUndefined();
  });

  it('turns a v2 welcome into the v1 welcome the store accepts', () => {
    const message = serverMessageV1({
      t: 'welcome',
      you: {
        userId: 'owner-1',
        seat: 0,
        playerIndex: 0,
        sessionId: 'session-1',
        spectator: false,
        team: 0,
      },
      epoch: v2State.epoch,
      state: v2State,
    });

    expect(message).toEqual({
      t: 'welcome',
      you: { userId: 'owner-1', playerIndex: 0, sessionId: 'session-1' },
      state: { ...v1State, protocol: 2 },
    });
  });

  it('maps a spectator identity onto player index 0 so the editor still has an identity', () => {
    const message = serverMessageV1({
      t: 'welcome',
      you: { userId: 'watcher-1', seat: null, playerIndex: -1, sessionId: 'session-9', spectator: true, team: 0 },
      state: v2State,
    });
    expect(message).toMatchObject({ you: { userId: 'watcher-1', playerIndex: 0 } });
  });

  it('keeps v1 messages and drops the relayed v2 families the editor does not read', () => {
    expect(serverMessageV1({ t: 'ended', reason: 'abandoned' })).toEqual({ t: 'ended', reason: 'abandoned' });
    expect(serverMessageV1({ t: 'pong', c: 1, s: 2 })).toEqual({ t: 'pong', c: 1, s: 2 });
    expect(projectServerMessage({ t: 'net.tick', epoch: v2State.epoch, serverTime: 1, tick: 2 })).toBeUndefined();
    expect(serverMessageV1({ t: 'not-a-room-message' })).toBeUndefined();
  });
});
