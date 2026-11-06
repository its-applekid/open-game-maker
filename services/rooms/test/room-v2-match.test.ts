import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LIMITS_V2, SIM_TICK_HZ } from '@ogm/contracts';

import { type Harness, connect, joinOptions, newRoom, rejectionCode, sleep, startHarness, waitFor } from './helpers.js';

/* Ready check, synchronised start, pause, forfeit and rejoin (#497 §6.2, §6.4, §6.5). */
const timings = { idleDisposeSec: 30, seatReconnectSec: 0.2 };
const v2Room = (overrides: Record<string, unknown> = {}) =>
  newRoom(harness.testServer, { protocol: 2, maxPlayers: 4, startLeadMs: 500, timings, ...overrides });

let harness: Harness;

const eventsOf = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(([message]) => (message as { event: string }).event);

async function seatedRoom(count: number, overrides: Record<string, unknown> = {}) {
  const room = await v2Room(overrides);
  const clients = [];
  for (const [index, userId] of ['owner', 'p1', 'p2', 'p3'].slice(0, count).entries()) {
    clients.push(await connect(harness.testServer, room, userId, index === 0 ? 'owner' : 'player'));
  }
  return { room, clients };
}

describe('v2 ready check, start and tick', () => {
  beforeAll(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.testServer.cleanup();
  });

  afterAll(async () => {
    await harness.testServer.shutdown();
  });

  it('refuses an unready start, honours a forced one, and leads the countdown by startLeadMs', async () => {
    const { room, clients } = await seatedRoom(2);
    const [owner, p1] = clients;
    owner.send('net.ready', { ready: true });
    await sleep(40);

    owner.send('net.start.request', {});
    await sleep(40);
    expect(room.droppedCounts['net.start.request']).toBe(1);
    expect(room.seatDrops.NOT_READY).toBe(1);
    expect(room.state.epoch).toBe('');

    const startForPeer = p1.waitForMessage('net.start');
    const startForOwner = owner.waitForMessage('net.start');
    const requestedAt = Date.now();
    owner.send('net.start.request', { force: true });
    const [peerStart, ownerStart] = await Promise.all([startForPeer, startForOwner]);

    expect(room.state.phase).toBe('playing');
    expect(room.state.epoch).toMatch(/^[0-9a-f-]{36}$/);
    expect(peerStart).toMatchObject({ epoch: room.state.epoch, primarySeat: 0, seed: room.state.seed });
    expect(ownerStart.startAt).toBe(peerStart.startAt);
    expect(peerStart.startAt - requestedAt).toBeGreaterThanOrEqual(400);
    expect(peerStart.startAt - requestedAt).toBeLessThanOrEqual(1_500);
    expect(peerStart.privateSeed).toBeDefined();
    expect(ownerStart.privateSeed).not.toBe(peerStart.privateSeed);
  });

  it('publishes a derived tick every second that matches the epoch mapping', async () => {
    const { room, clients } = await seatedRoom(2);
    const [owner, p1] = clients;
    const ticks = vi.fn();
    p1.onMessage('net.tick', ticks);
    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');

    await waitFor(() => ticks.mock.calls.length > 0, 'a net.tick', 3_000);
    const [tick] = ticks.mock.calls[0] as [{ epoch: string; serverTime: number; tick: number }];
    expect(tick.epoch).toBe(room.state.epoch);
    expect(tick.tick).toBe(Math.max(0, Math.floor(((tick.serverTime - room.state.startAt) * SIM_TICK_HZ) / 1_000)));
    expect(LIMITS_V2.startLeadMs).toBe(1_000);
  });

  it('drops a start request from a non-primary seat and one while an epoch is running', async () => {
    const { room, clients } = await seatedRoom(2);
    const [owner, p1] = clients;
    p1.send('net.start.request', { force: true });
    await sleep(40);
    expect(room.seatDrops.NOT_PRIMARY).toBe(1);
    expect(room.state.epoch).toBe('');

    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');
    const epoch = room.state.epoch;
    owner.send('net.start.request', { force: true });
    await sleep(40);
    expect(room.seatDrops.EPOCH_ACTIVE).toBe(1);
    expect(room.state.epoch).toBe(epoch);
  });

  it('ends an epoch, keeps seat numbers and releases a forfeited seat for the next round', async () => {
    const { room, clients } = await seatedRoom(3);
    const [owner, p1, p2] = clients;
    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');
    await sleep(600);
    const firstEpoch = room.state.epoch;

    p2.leave(false);
    await waitFor(() => room.state.seats[2].forfeited, 'seat 2 forfeited', 2_000);

    const endForP1 = p1.waitForMessage('net.epoch.end');
    owner.send('net.end.request', { epoch: firstEpoch });
    expect(await endForP1).toMatchObject({ epoch: firstEpoch });

    expect(room.state.epoch).toBe('');
    expect(room.state.startAt).toBe(0);
    expect(room.state.phase).toBe('editing');
    expect([...room.state.seats].map((seat) => [seat.userId, seat.forfeited, seat.ready])).toEqual([
      ['owner', false, false],
      ['p1', false, false],
      ['', false, false],
      ['', false, false],
    ]);

    const back = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'p2', 'player'));
    await back.waitForMessage('welcome');
    expect(room.state.seats[2].userId).toBe('p2');

    const secondStart = owner.waitForMessage('net.start');
    owner.send('net.start.request', { force: true });
    expect((await secondStart).epoch).not.toBe(firstEpoch);
  });
});

describe('v2 pause, rejoin and forfeit', () => {
  beforeAll(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.testServer.cleanup();
  });

  afterAll(async () => {
    await harness.testServer.shutdown();
  });

  async function runningRoom(count = 2) {
    const seated = await seatedRoom(count);
    seated.clients[0].send('net.start.request', { force: true });
    await waitFor(() => seated.room.state.epoch !== '', 'epoch minted');
    await sleep(600);
    return seated;
  }

  it('pauses every seat when one drops and resumes with a shifted startAt on rejoin', async () => {
    const { room, clients } = await runningRoom(2);
    const [owner, p1] = clients;
    const pauses = vi.fn();
    const resumes = vi.fn();
    owner.onMessage('net.pause', pauses);
    owner.onMessage('net.resume', resumes);

    p1.leave(false);
    await waitFor(() => pauses.mock.calls.length === 1, 'net.pause', 2_000);
    const [paused] = pauses.mock.calls[0] as [{ epoch: string; tick: number; startAt: number }];
    expect(paused.epoch).toBe(room.state.epoch);
    expect(room.state.pausedAt).toBeGreaterThan(0);
    expect(paused.tick).toBe(
      Math.max(0, Math.floor(((room.state.pausedAt - room.state.startAt) * SIM_TICK_HZ) / 1_000)),
    );

    const startAtBefore = room.state.startAt;
    const rejoined = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'p1', 'player'));
    /* Both arrive back to back on the rejoin, so spy on them instead of awaiting one then the other. */
    const lateStarts: Record<string, unknown>[] = [];
    const welcomes: Record<string, unknown>[] = [];
    rejoined.onMessage('net.start', (message) => lateStarts.push(message as Record<string, unknown>));
    rejoined.onMessage('welcome', (message) => welcomes.push(message as Record<string, unknown>));
    await waitFor(() => welcomes.length === 1 && lateStarts.length === 1, 'rejoin welcome and late start', 3_000);

    expect(welcomes[0].epoch).toBe(room.state.epoch);
    /* The resume may land before the unicast, so the late start carries the shifted (still current) startAt. */
    expect(lateStarts[0].startAt).toBeGreaterThanOrEqual(startAtBefore);
    await waitFor(() => resumes.mock.calls.length === 1, 'net.resume', 2_000);
    const [resumed] = resumes.mock.calls[0] as [{ startAt: number; tick: number }];
    expect(room.state.pausedAt).toBe(0);
    expect(resumed.startAt).toBe(lateStarts[0].startAt as number);
    expect(resumed.tick).toBeGreaterThan(0);
  });

  it('forfeits a seat that misses the window and keeps the room alive', async () => {
    const { room, clients } = await runningRoom(2);
    const [owner, p1] = clients;
    const seatEvents = vi.fn();
    owner.onMessage('net.seat', seatEvents);

    p1.leave(false);
    await waitFor(() => room.state.seats[1].forfeited, 'seat 1 forfeited', 2_000);
    await waitFor(() => eventsOf(seatEvents).includes('net.seat.forfeit'), 'forfeit announced', 2_000);
    expect(room.state.seats[1].connected).toBe(false);
    expect(eventsOf(seatEvents)).toContain('net.seat.offline');
    expect(room.state.phase).toBe('playing');
  });

  it('re-elects the primary when the primary seat forfeits', async () => {
    const { room, clients } = await runningRoom(2);
    const [owner, p1] = clients;
    const primary = vi.fn();
    p1.onMessage('net.primary', primary);

    owner.leave(false);
    await waitFor(() => room.state.seats[0].forfeited, 'seat 0 forfeited', 2_000);

    await waitFor(() => primary.mock.calls.length === 1, 'net.primary', 2_000);
    expect(primary.mock.calls[0][0]).toMatchObject({ seat: 1 });
    expect(room.state.primarySeat).toBe(1);
  });

  it('forfeits immediately on a consented leave, without a window', async () => {
    const { room, clients } = await runningRoom(2);
    const [owner, p1] = clients;
    const seatEvents = vi.fn();
    owner.onMessage('net.seat', seatEvents);

    await p1.leave(true);
    await waitFor(() => room.state.seats[1].forfeited, 'seat 1 forfeited', 2_000);
    expect(eventsOf(seatEvents)).not.toContain('net.seat.offline');
    expect(eventsOf(seatEvents)).toContain('net.seat.forfeit');
  });

  it('ends an abandoned room when every seat forfeits', async () => {
    const room = await v2Room({ maxPlayers: 2, spectators: 'on' });
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const p1 = await connect(harness.testServer, room, 'p1', 'player');
    const watcher = await connect(harness.testServer, room, 'watcher', 'player');
    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');
    await sleep(600);
    const ended = watcher.waitForMessage('ended');

    await p1.leave(true);
    await waitFor(() => room.state.seats[1].forfeited, 'seat 1 forfeited', 2_000);
    await owner.leave(true);

    expect(await ended).toEqual({ reason: 'abandoned' });
    await waitFor(() => room.state.phase === 'ended', 'room ended', 2_000);
  });

  it('does not end the room or pause for a host when the creator drops mid-match', async () => {
    const { room, clients } = await runningRoom(2);
    const [owner] = clients;
    const ended = vi.fn();
    clients[1].onMessage('ended', ended);

    owner.leave(false);
    await waitFor(() => room.state.seats[0].connected === false, 'creator offline', 2_000);
    await sleep(300);

    expect(ended).not.toHaveBeenCalled();
    expect(room.state.phase).not.toBe('pausedForHost');
    expect(room.state.phase).not.toBe('ended');
  });
});

describe('v2 routing, protocol and pinning', () => {
  beforeAll(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.testServer.cleanup();
  });

  afterAll(async () => {
    await harness.testServer.shutdown();
  });

  it('relays an event with the sender seat re-stamped and never back to the sender', async () => {
    const { room, clients } = await seatedRoom(3);
    const [owner, p1, p2] = clients;
    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');
    const epoch = room.state.epoch;

    const atOwner = vi.fn();
    const atP2 = vi.fn();
    owner.onMessage('net.event', atOwner);
    p2.onMessage('net.event', atP2);
    const sender = vi.fn();
    p1.onMessage('net.event', sender);

    p1.send('net.event', {
      epoch,
      id: 'ev_1',
      seq: 1,
      from: 0,
      target: 'all',
      data: new Uint8Array([1, 2, 3]),
    });
    await waitFor(() => atP2.mock.calls.length === 1, 'relayed event', 2_000);

    expect(atOwner.mock.calls[0][0]).toMatchObject({ from: 1, id: 'ev_1', seq: 1 });
    expect(atP2.mock.calls[0][0]).toMatchObject({ from: 1 });
    expect(sender).not.toHaveBeenCalled();
  });

  it('drops an event from a spectator and one with no epoch', async () => {
    const room = await v2Room({ spectators: 'on' });
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    for (const userId of ['p1', 'p2', 'p3']) await connect(harness.testServer, room, userId, 'player');
    /* The seats are full, so the fifth join is a spectator with no seat and no authority. */
    const watcher = await connect(harness.testServer, room, 'watcher', 'player');

    owner.send('net.event', {
      epoch: 'no-epoch',
      id: 'ev_1',
      seq: 1,
      from: 0,
      target: 'all',
      data: new Uint8Array([1]),
    });
    await sleep(40);
    expect(room.seatDrops.NO_EPOCH).toBe(1);

    owner.send('net.start.request', { force: true });
    await waitFor(() => room.state.epoch !== '', 'epoch minted');
    watcher.send('net.event', {
      epoch: room.state.epoch,
      id: 'ev_2',
      seq: 1,
      from: 0,
      target: 'all',
      data: new Uint8Array([1]),
    });
    await sleep(40);
    expect(room.seatDrops.SPECTATOR_NOT_SEATED).toBe(1);
  });

  it('refuses a mismatched protocol in both directions', async () => {
    const v2 = await v2Room();
    const v1 = await newRoom(harness.testServer, { timings });

    expect(
      await rejectionCode(
        harness.testServer.connectTo(v1, { ...(await joinOptions(v1, 'p1', 'player')), protocol: 2 }),
      ),
    ).toBe('PROTOCOL_MISMATCH');
    expect(
      await rejectionCode(
        harness.testServer.connectTo(v2, { ...(await joinOptions(v2, 'p1', 'player')), protocol: 1 }),
      ),
    ).toBe('PROTOCOL_MISMATCH');
  });

  it('compares the client ruleset pin only when the room has one', async () => {
    const pinned = await v2Room({ rulesetHash: 'fnv1a64:aa' });
    const mismatch = { ...(await joinOptions(pinned, 'p1', 'player')), rulesetHash: 'fnv1a64:bb' };
    expect(await rejectionCode(harness.testServer.connectTo(pinned, mismatch))).toBe('RULESET_MISMATCH');

    const matching = { ...(await joinOptions(pinned, 'p1', 'player')), rulesetHash: 'fnv1a64:aa' };
    expect(await harness.testServer.connectTo(pinned, matching)).toBeDefined();
    const unpinned = { ...(await joinOptions(pinned, 'p2', 'player')) };
    expect(await harness.testServer.connectTo(pinned, unpinned)).toBeDefined();

    const open = await v2Room();
    expect(
      await harness.testServer.connectTo(open, { ...(await joinOptions(open, 'p1', 'player')), rulesetHash: 'x' }),
    ).toBeDefined();
  });
});
