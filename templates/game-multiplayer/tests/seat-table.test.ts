import type { NetSeat } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { defaultDesign, game, getGameContext, syncSeatTable } from '../src/game.js';
import { playerId } from '../src/state.js';

const seat = (index: number, overrides: Partial<NetSeat> = {}): NetSeat => ({
  seat: index,
  userId: `user-${index}`,
  name: `Seat ${index}`,
  team: 0,
  connected: true,
  ready: true,
  forfeited: false,
  spectator: false,
  ...overrides,
});

const host = {} as Parameters<typeof game.mount>[0];

/**
 * The seat table is the authority on who is playing. `mount` builds the world before the first table arrives, so its
 * avatar is at the placeholder seat 0; these cases prove the world follows the table from there.
 */
describe('the seat table owns the avatars in the world', () => {
  it('moves the avatar the world was built with to the seat this client holds', async () => {
    await game.mount(host, defaultDesign);

    syncSeatTable([seat(0), seat(1)], 1);

    const context = getGameContext();
    expect([...context.state.players.keys()].sort()).toEqual([0, 1]);
    expect(context.ownSeat).toBe(1);
    expect(context.localPlayerIndex).toBe(1);
    /* Seat 0's avatar is the other player's; the seat this client holds is where its own avatar now is. */
    expect(context.state.players.get(0)!.playerIndex).toBe(0);
    expect(context.state.players.get(1)!.playerIndex).toBe(1);
  });

  it('adds an avatar for a seat that joins and keeps the position of one already playing', async () => {
    await game.mount(host, defaultDesign);
    syncSeatTable([seat(0), seat(1)], 1);
    const moved = getGameContext().state.players.get(1)!;
    moved.p[0] = 512;

    syncSeatTable([seat(0), seat(1), seat(2)], 1);

    const players = getGameContext().state.players;
    expect([...players.keys()].sort()).toEqual([0, 1, 2]);
    /* A broadcast during a match is not a respawn: the avatar that was already playing stays where it reached. */
    expect(players.get(1)!.p[0]).toBe(512);
  });

  it('removes the avatar of a seat that forfeits', async () => {
    await game.mount(host, defaultDesign);
    syncSeatTable([seat(0), seat(1), seat(2)], 1);

    syncSeatTable([seat(0), seat(1), seat(2, { forfeited: true })], 1);

    expect([...getGameContext().state.players.keys()].sort()).toEqual([0, 1]);
  });

  it('drops the placeholder avatar when this client is seated somewhere else and seat 0 is empty', async () => {
    await game.mount(host, defaultDesign);

    syncSeatTable([seat(2)], 2);

    const context = getGameContext();
    expect([...context.state.players.keys()]).toEqual([2]);
    expect(context.ownSeat).toBe(2);
  });

  it('drops this client’s own avatar when it holds no seat and nobody holds the placeholder seat', async () => {
    await game.mount(host, defaultDesign);

    syncSeatTable([seat(1)], null);

    const players = getGameContext().state.players;
    expect(players.has(0)).toBe(false);
    expect([...players.keys()]).toEqual([1]);
  });

  it('leaves a v1 game untouched: the seat table never fires there', async () => {
    await game.mount(host, defaultDesign);

    expect([...getGameContext().state.players.keys()]).toEqual([0]);
    expect(playerId(0)).toBe('p0');
  });
});
