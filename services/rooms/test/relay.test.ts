import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LIMITS } from '@ogm/contracts';

import { connect, GAMES_ORIGIN, newRoom, sleep, startHarness, type Harness } from './helpers.js';

const tx = (overrides: Record<string, unknown> = {}) => ({
  branchId: 'main',
  rev: 1,
  baseRev: 0,
  actor: 'owner',
  kind: 'manual',
  patches: [{ op: 'replace', path: '/globals/speed', value: 2 }],
  ...overrides,
});

describe('GameRoom relay rules', () => {
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

  it('drops owner-only messages from a player and counts the violation', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const player = await connect(harness.testServer, room, 'player', 'player');
    const received = vi.fn();
    owner.onMessage('design.tx', received);

    const handled = room.waitForNextMessage();
    player.send('design.tx', { tx: tx() });
    await handled;
    await sleep(30);

    expect(received).not.toHaveBeenCalled();
    expect(room.droppedCounts['design.tx']).toBe(1);
  });

  it('validates design transactions, advances lastRev, and relays valid transactions', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const watcher = await connect(harness.testServer, room, 'watcher', 'player');

    owner.send('design.tx', { tx: tx({ branchId: 'other' }) });
    await room.waitForNextMessage(20);
    owner.send('design.tx', { tx: tx({ patches: [{ op: 'replace', path: '/prompt', value: 'secret' }] }) });
    await room.waitForNextMessage(20);
    expect(room.state.lastRev).toBe(0);

    const relayed = watcher.waitForMessage('design.tx');
    owner.send('design.tx', { tx: tx({ rev: 7 }) });
    expect((await relayed).tx.rev).toBe(7);
    expect(room.state.lastRev).toBe(7);
  });

  it('stamps input identity and playerIndex instead of trusting client fields', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const player = await connect(harness.testServer, room, 'player', 'player');
    const input = owner.waitForMessage('input');

    player.send('input', { f: { seq: 1, tick: 2, axes: [0.5], buttons: 1, playerIndex: 0, from: 'owner' } });

    expect(await input).toEqual({ f: { seq: 1, tick: 2, axes: [0.5], buttons: 1, playerIndex: 1, from: 'player' } });
  });

  it('drops an oversized snapshot and the 31st snapshot in one second', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const player = await connect(harness.testServer, room, 'player', 'player');
    const snapshots = vi.fn();
    player.onMessage('snapshot', snapshots);
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now());

    try {
      owner.send('snapshot', { seq: 0, tick: 0, data: new Uint8Array(LIMITS.snapshotBytes + 1) });
      await room.waitForNextMessage(20);
      for (let index = 1; index <= LIMITS.snapshotPerSec + 1; index += 1) {
        owner.send('snapshot', { seq: index, tick: index, data: new Uint8Array([index]) });
      }
    } finally {
      now.mockRestore();
    }
    await sleep(120);

    expect(snapshots).toHaveBeenCalledTimes(LIMITS.snapshotPerSec);
    expect(room.droppedCounts.snapshot).toBe(2);
  });

  it('zeroes private presence while preserving build progress', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const watcher = await connect(harness.testServer, room, 'watcher', 'player');
    const patched = watcher.waitForNextPatch();

    owner.send('presence', {
      p: {
        privateMode: true,
        cursor: { x: 0.5, y: 0.5 },
        selection: ['secret-node'],
        focusControlId: 'prompt',
        camera: { pos: [1, 2, 3], target: [4, 5, 6], zoom: 2 },
        building: { jobId: 'j1', label: 'building', pct: 40 },
      },
    });
    await patched;

    expect(watcher.state.presence.toJSON()).toEqual({
      selection: [],
      privateMode: true,
      building: { jobId: 'j1', label: 'building', pct: 40 },
    });
  });

  it('uses server time and lastRev when entering play', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const watcher = await connect(harness.testServer, room, 'watcher', 'player');
    const relayed = watcher.waitForMessage('design.tx');
    owner.send('design.tx', { tx: tx({ rev: 9 }) });
    await relayed;
    const sentAt = Date.now();
    const patched = watcher.waitForNextPatch();
    owner.send('phase', { to: 'playing' });
    await patched;

    expect(watcher.state.phase).toBe('playing');
    expect(watcher.state.playRev).toBe(9);
    expect(watcher.state.phaseAt).toBeGreaterThanOrEqual(sentAt);
  });

  it('accepts draft loads only from the games origin and waits for every connected member', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const player = await connect(harness.testServer, room, 'player', 'player');

    owner.send('draft.load', { buildId: 'sha256:two', url: 'https://evil.example/x' });
    await room.waitForNextMessage(20);
    expect(room.state.phase).toBe('editing');

    owner.send('draft.load', { buildId: 'sha256:two', url: `${GAMES_ORIGIN}/g/g_test/sha256:two/` });
    await room.waitForNextMessage(20);
    expect(room.state.phase).toBe('migrating');
    player.send('draft.ready', { buildId: 'sha256:two' });
    await room.waitForNextMessage(20);
    expect(room.state.phase).toBe('migrating');
    owner.send('draft.ready', { buildId: 'sha256:two' });
    await room.waitForNextMessage(20);

    expect(room.state.pin.buildId).toBe('sha256:two');
    expect(room.state.phase).toBe('editing');
    expect(room.state.draft).toBeUndefined();
  });

  it('answers ping and lets only the editor kick another member', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await connect(harness.testServer, room, 'owner', 'owner');
    const player = await connect(harness.testServer, room, 'player', 'player');
    const pong = player.waitForMessage('pong');
    player.send('ping', { c: 123 });
    expect(await pong).toMatchObject({ c: 123 });

    player.send('kick', { userId: 'owner' });
    await room.waitForNextMessage(20);
    expect(room.clients.length).toBe(2);
    owner.send('kick', { userId: 'player' });
    await sleep(50);
    expect(room.clients.length).toBe(1);
  });
});
