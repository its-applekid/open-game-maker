import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, PROTOCOL_VERSION_V1 } from '@ogm/contracts';

import {
  bindUser,
  electPrimary,
  forfeit,
  freeSeat,
  isFree,
  lowestFreeSeat,
  occupiedSeats,
  releaseForfeited,
  seatOfUser,
  seatsSnapshot,
  syncMembersFromSeats,
  teamOf,
} from '../src/seats.js';
import { createRoomState, type GameRoomState } from '../src/state.js';

const pin = { gameId: 'g_test', branchId: 'main', buildId: 'sha256:one' };

function v2Room(maxPlayers = 4, teams: 'none' | 'alternate' = 'alternate'): GameRoomState {
  return createRoomState({ pin, ownerId: 'owner', maxPlayers, protocol: PROTOCOL_VERSION, teams });
}

function seat(room: GameRoomState, index: number) {
  return room.seats[index];
}

describe('seats', () => {
  it('pre-creates one row per seat for a v2 room and none for a v1 room', () => {
    expect(v2Room().seats.length).toBe(4);
    expect(createRoomState({ pin, ownerId: 'owner', maxPlayers: 4 }).seats.length).toBe(0);
    expect(createRoomState({ pin, ownerId: 'owner', maxPlayers: 4 }).protocol).toBe(PROTOCOL_VERSION_V1);
  });

  it('numbers seats by index and alternates teams by seat number', () => {
    const room = v2Room();
    expect(teamOf(0, 'alternate')).toBe(0);
    expect(teamOf(1, 'alternate')).toBe(1);
    expect(teamOf(3, 'none')).toBe(0);
    expect([...room.seats].map((row) => [row.seat, row.team])).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
  });

  it('assigns the lowest free seat and never re-assigns a forfeited one', () => {
    const room = v2Room();
    bindUser(seat(room, 0), 'owner', 'owner');
    bindUser(seat(room, 1), 'p1', 'p1');
    expect(lowestFreeSeat(room)?.seat).toBe(2);

    forfeit(seat(room, 1));
    expect(seatOfUser(room, 'p1')?.forfeited).toBe(true);
    expect(lowestFreeSeat(room)?.seat).toBe(2);
    expect(isFree(seat(room, 1))).toBe(false);

    freeSeat(seat(room, 1), teamOf(1, 'alternate'));
    expect(isFree(seat(room, 1))).toBe(true);
    expect(seat(room, 1).team).toBe(1);
  });

  it('elects the lowest connected non-forfeited occupant as primary', () => {
    const room = v2Room();
    bindUser(seat(room, 0), 'owner', 'owner');
    bindUser(seat(room, 2), 'p2', 'p2');
    expect(electPrimary(room)).toBe(0);
    seat(room, 0).connected = false;
    expect(electPrimary(room)).toBe(2);
    forfeit(seat(room, 2));
    expect(electPrimary(room)).toBeUndefined();
  });

  it('projects the seat table onto the v1 members map', () => {
    const room = v2Room();
    bindUser(seat(room, 0), 'owner', 'owner');
    bindUser(seat(room, 1), 'p1', 'player one');
    seat(room, 1).connected = false;
    syncMembersFromSeats(room);

    expect([...room.members.keys()]).toEqual(['owner', 'p1']);
    expect(room.members.get('owner')?.role).toBe('owner');
    expect(room.members.get('owner')?.playerIndex).toBe(0);
    expect(room.members.get('p1')?.role).toBe('player');
    expect(room.members.get('p1')?.playerIndex).toBe(1);
    expect(room.members.get('p1')?.name).toBe('player one');
    expect(room.members.get('p1')?.connected).toBe(false);

    freeSeat(seat(room, 1), 1);
    syncMembersFromSeats(room);
    expect([...room.members.keys()]).toEqual(['owner']);
  });

  it('keeps a seat occupant in members and carries its session list across a sync', () => {
    const room = v2Room();
    bindUser(seat(room, 0), 'owner', 'owner');
    syncMembersFromSeats(room);
    const member = room.members.get('owner');
    member?.sessions.push('s_owner1');

    seat(room, 0).connected = false;
    syncMembersFromSeats(room);
    expect([...(room.members.get('owner')?.sessions ?? [])]).toEqual(['s_owner1']);
    expect(room.members.get('owner')?.connected).toBe(false);
  });

  it('releases forfeited seats and clears readiness at the end of an epoch', () => {
    const room = v2Room();
    bindUser(seat(room, 0), 'owner', 'owner');
    bindUser(seat(room, 1), 'p1', 'p1');
    seat(room, 0).ready = true;
    forfeit(seat(room, 1));

    releaseForfeited(room, 'alternate');
    expect(seat(room, 1).userId).toBe('');
    expect(seat(room, 1).forfeited).toBe(false);
    expect(seat(room, 1).team).toBe(1);
    expect(seat(room, 0).userId).toBe('owner');
    expect(seat(room, 0).ready).toBe(false);
    expect(seatsSnapshot(room).length).toBe(4);
    expect(occupiedSeats(room).length).toBe(1);
  });
});
