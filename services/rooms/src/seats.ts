import type { NetSeat, TeamPolicy } from '@ogm/contracts';

import { MembershipState, type GameRoomState, type SeatState } from './state.js';

/*
 * The protocol-2 seat table (#497 §3.1/§3.2, D-N3-1/D-N3-2/D-N3-8).
 *
 * Seats are the truth and `members` is a projection of them, so every v1 reader — presence relay, editor
 * session handling, the bridge's `net.players`, the watcher — keeps working in a v2 room without a change.
 * The room assigns seats; a client only ever makes a claim about its own, and nothing here reads a grant.
 */

/** Teams are a property of the seat number, not of the occupant: a replaceable seat keeps its team. */
export function teamOf(seat: number, policy: TeamPolicy): number {
  return policy === 'alternate' ? seat % 2 : 0;
}

export function seatsSnapshot(state: GameRoomState): NetSeat[] {
  return state.seats.map((seat) => ({
    seat: seat.seat,
    userId: seat.userId,
    name: seat.name,
    team: seat.team,
    connected: seat.connected,
    ready: seat.ready,
    forfeited: seat.forfeited,
    spectator: seat.spectator,
  }));
}

export function seatOfUser(state: GameRoomState, userId: string): SeatState | undefined {
  return [...state.seats].find((seat) => seat.userId === userId);
}

/** A seat is free when nothing has claimed it and no forfeit holds it for the rest of the epoch. */
export function isFree(seat: SeatState): boolean {
  return seat.userId === '' && !seat.forfeited;
}

export function lowestFreeSeat(state: GameRoomState): SeatState | undefined {
  return [...state.seats].find(isFree);
}

export function occupiedSeats(state: GameRoomState): SeatState[] {
  return [...state.seats].filter((seat) => seat.userId !== '');
}

/** The lowest connected, non-forfeited occupant. `undefined` when no seat can start or lead an epoch. */
export function electPrimary(state: GameRoomState): number | undefined {
  return [...state.seats].find((seat) => seat.userId !== '' && seat.connected && !seat.forfeited)?.seat;
}

export function bindUser(seat: SeatState, userId: string, name: string): void {
  seat.userId = userId;
  seat.name = name;
  seat.connected = true;
  seat.ready = false;
  seat.forfeited = false;
}

export function markOffline(seat: SeatState): void {
  seat.connected = false;
}

export function markOnline(seat: SeatState): void {
  seat.connected = true;
}

/** A forfeit is final for its epoch: the seat keeps its occupant and cannot be re-taken until the epoch ends. */
export function forfeit(seat: SeatState): void {
  seat.forfeited = true;
  seat.connected = false;
  seat.ready = false;
}

/** Releases the seat back to the pool; `net.epoch.end` does this for every forfeited seat. */
export function freeSeat(seat: SeatState, team: number): void {
  seat.userId = '';
  seat.name = '';
  seat.team = team;
  seat.connected = false;
  seat.ready = false;
  seat.forfeited = false;
}

export function seatsOfTeam(state: GameRoomState, team: number): SeatState[] {
  return [...state.seats].filter((seat) => seat.userId !== '' && seat.team === team);
}

/**
 * Rebuilds the v1 `members` map from the seat table. Session ids come from whatever the members map held
 * before, so the v1 session bookkeeping is carried over rather than duplicated.
 */
export function syncMembersFromSeats(state: GameRoomState): void {
  const sessions = new Map<string, string[]>();
  for (const member of state.members.values()) sessions.set(member.userId, [...member.sessions]);

  const seated = new Set<string>();
  for (const seat of state.seats) {
    if (seat.userId === '') continue;
    seated.add(seat.userId);
    let member = state.members.get(seat.userId);
    if (member === undefined) {
      member = new MembershipState();
      state.members.set(seat.userId, member);
    }
    member.userId = seat.userId;
    member.name = seat.name;
    member.role = seat.userId === state.ownerId ? 'owner' : 'player';
    member.playerIndex = seat.seat;
    member.connected = seat.connected;
    member.sessions.clear();
    member.sessions.push(...(sessions.get(seat.userId) ?? []));
  }
  for (const userId of [...state.members.keys()]) if (!seated.has(userId)) state.members.delete(userId);
}

/** Every seat released at `net.epoch.end`, so the next round starts from a full pool. */
export function releaseForfeited(state: GameRoomState, policy: TeamPolicy): void {
  for (const seat of state.seats) {
    if (seat.forfeited) freeSeat(seat, teamOf(seat.seat, policy));
    seat.ready = false;
  }
}
