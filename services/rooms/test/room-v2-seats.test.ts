import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Seat } from '@ogm/contracts';

import { type Harness, connect, joinOptions, newRoom, rejectionCode, sleep, startHarness } from './helpers.js';

/* The seat table, teams and spectators (#497 §6.1).
 * A generous idle window: a slow first join must not race the room's 1 s idle disposal. */
const timings = { idleDisposeSec: 30 };

const seatsOf = (room: { state: { seats: Iterable<Seat> } }): Seat[] =>
  [...room.state.seats].map((seat) => ({ ...seat }));

describe('v2 seats, teams and spectators', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.testServer.cleanup();
  });

  afterAll(async () => {
    await harness.testServer.shutdown();
  });

  it('seats four players in alternating teams and projects them onto members', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, teams: 'alternate', timings });
    const welcomes = [];
    for (const [userId, role] of [
      ['owner', 'owner'],
      ['p1', 'player'],
      ['p2', 'player'],
      ['p3', 'player'],
    ] as const) {
      const client = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, userId, role));
      welcomes.push(await client.waitForMessage('welcome'));
    }

    expect([...room.state.seats].map((seat) => [seat.seat, seat.team, seat.userId])).toEqual([
      [0, 0, 'owner'],
      [1, 1, 'p1'],
      [2, 0, 'p2'],
      [3, 1, 'p3'],
    ]);
    expect(welcomes.map((welcome) => welcome.you)).toMatchObject([
      { userId: 'owner', seat: 0, playerIndex: 0, spectator: false, team: 0 },
      { userId: 'p1', seat: 1, playerIndex: 1, spectator: false, team: 1 },
      { userId: 'p2', seat: 2, playerIndex: 2, spectator: false, team: 0 },
      { userId: 'p3', seat: 3, playerIndex: 3, spectator: false, team: 1 },
    ]);
    expect([...room.state.members.values()].map((member) => [member.userId, member.playerIndex])).toEqual([
      ['owner', 0],
      ['p1', 1],
      ['p2', 2],
      ['p3', 3],
    ]);
    expect(welcomes[1].state.seats.length).toBe(4);
  });

  it('gives every seat team 0 when teams are off', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, teams: 'none', timings });
    for (const userId of ['owner', 'p1', 'p2', 'p3']) {
      const role = userId === 'owner' ? 'owner' : 'player';
      await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, userId, role));
    }

    expect([...room.state.seats].map((seat) => seat.team)).toEqual([0, 0, 0, 0]);
  });

  it('rejects a fifth player with ROOM_FULL and never allocates a seat for it', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, maxPlayers: 4, timings });
    for (const userId of ['owner', 'p1', 'p2', 'p3']) {
      const role = userId === 'owner' ? 'owner' : 'player';
      await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, userId, role));
    }
    const before = seatsOf(room);

    expect(await rejectionCode(harness.testServer.connectTo(room, await joinOptions(room, 'p4', 'player')))).toBe(
      'ROOM_FULL',
    );
    expect(seatsOf(room)).toEqual(before);
  });

  it('admits a fifth user as a spectator without a seat when spectators are on', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, maxPlayers: 4, spectators: 'on', timings });
    for (const userId of ['owner', 'p1', 'p2', 'p3']) {
      const role = userId === 'owner' ? 'owner' : 'player';
      await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, userId, role));
    }
    const before = seatsOf(room);

    const watcher = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'watcher', 'player'));
    const welcome = await watcher.waitForMessage('welcome');

    expect(welcome.you).toMatchObject({ userId: 'watcher', seat: null, playerIndex: -1, spectator: true });
    expect(seatsOf(room)).toEqual(before);
    expect([...room.state.spectators]).toEqual(['watcher']);
  });

  it('drops a seat request for an occupied seat and counts it', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, maxPlayers: 4, timings });
    await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'owner', 'owner'));
    const p1 = await connect(harness.testServer, room, 'p1', 'player');
    for (const userId of ['p2', 'p3']) {
      await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, userId, 'player'));
    }

    p1.send('net.seat.request', { seat: 3 });
    await sleep(50);

    expect(room.droppedCounts['net.seat.request']).toBe(1);
    expect(room.state.seats[1].userId).toBe('p1');
    expect(room.state.seats[3].userId).toBe('p3');
  });

  it('rejects a join that claims a seat held by another user', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, timings });
    await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'owner', 'owner'));
    await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'p1', 'player'));

    const forged = { ...(await joinOptions(room, 'p9', 'player')), seat: 1 };
    expect(await rejectionCode(harness.testServer.connectTo(room, forged))).toBe('SEAT_TAKEN');
    expect(room.state.seats[1].userId).toBe('p1');
    expect(room.state.seats[1].connected).toBe(true);
  });

  it('keeps a seat connected while one of its two live sessions remains', async () => {
    const room = await newRoom(harness.testServer, { protocol: 2, timings });
    const owner = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'owner', 'owner'));
    const first = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'p1', 'player'));
    const second = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'p1', 'player'));
    /* The owner stays so the room still has a recipient for the seat events under test. */
    const seatEvents = vi.fn();
    owner.onMessage('net.seat', seatEvents);
    const events = () => seatEvents.mock.calls.map(([message]) => (message as { event: string }).event);
    await sleep(30);

    await first.leave(false);
    await sleep(80);
    expect(room.state.seats[1].connected).toBe(true);
    expect(events()).not.toContain('net.seat.offline');

    await second.leave(false);
    await sleep(80);
    expect(room.state.seats[1].connected).toBe(false);
    expect(events()).toContain('net.seat.offline');
  });
});
