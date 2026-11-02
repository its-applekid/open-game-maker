import type { DesignDoc, Patch } from '@ogm/design-log';
import type { DesignTx, RoomState } from '@ogm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoomStore } from './room-store';
import { WatcherSync, type DesignSnapshot } from './watcher-sync';

const pin = { gameId: 'game-1', branchId: 'main', buildId: 'build-1' };
const doc = (gravity: number): DesignDoc => ({ schemaVersion: 1, globals: { gravity }, entities: {} });
const patch = (gravity: number): Patch => ({ op: 'replace', path: ['globals', 'gravity'], value: gravity });
const tx = (rev: number, gravity = rev): DesignTx => ({
  branchId: 'main',
  rev,
  baseRev: rev - 1,
  actor: 'owner-1',
  kind: 'manual',
  patches: [patch(gravity)],
});
const state = (lastRev: number): RoomState => ({
  protocol: 1,
  pin,
  ownerId: 'owner-1',
  phase: 'editing',
  phaseAt: 1,
  playRev: 0,
  lastRev,
  maxPlayers: 4,
  members: {},
  presence: { selection: [], privateMode: false },
});

describe('WatcherSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the welcome snapshot and applies buffered transactions in revision order', async () => {
    const fetchSnapshot = vi.fn(async (): Promise<DesignSnapshot> => ({ rev: 40, doc: doc(40) }));
    const bridge = { send: vi.fn() };
    const sync = new WatcherSync({ bridge, fetchSnapshot, store: createRoomStore() });

    await sync.onWelcome(state(40));
    sync.onTransaction(tx(41));
    sync.onTransaction(tx(43));
    sync.onTransaction(tx(42));

    expect(fetchSnapshot).toHaveBeenCalledWith(pin, 40);
    expect(appliedRevisions(bridge.send)).toEqual([40, 41, 42, 43]);
    expect(sync.appliedRev).toBe(43);
    expect(sync.doc).toEqual(doc(43));
  });

  it('re-fetches at the room head after a two-second gap without inventing a revision', async () => {
    const fetchSnapshot = vi
      .fn<(_roomPin: typeof pin, rev: number) => Promise<DesignSnapshot>>()
      .mockResolvedValueOnce({ rev: 43, doc: doc(43) })
      .mockResolvedValueOnce({ rev: 45, doc: doc(45) });
    const bridge = { send: vi.fn() };
    const store = createRoomStore();
    store.getState().sync(state(45));
    const sync = new WatcherSync({ bridge, fetchSnapshot, store });
    await sync.onWelcome(state(43));

    sync.onTransaction(tx(45));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchSnapshot).toHaveBeenLastCalledWith(pin, 45);
    expect(appliedRevisions(bridge.send)).toEqual([43, 45]);
    expect(appliedRevisions(bridge.send)).not.toContain(44);
  });

  it('coalesces resync requests into one snapshot fetch', async () => {
    let release!: (snapshot: DesignSnapshot) => void;
    const fetchSnapshot = vi.fn(
      async () =>
        new Promise<DesignSnapshot>((resolve) => {
          release = resolve;
        }),
    );
    const sync = new WatcherSync({ bridge: { send: vi.fn() }, fetchSnapshot, store: createRoomStore() });

    const first = sync.onWelcome(state(50));
    const second = sync.onResync(52);
    expect(fetchSnapshot).toHaveBeenCalledOnce();
    release({ rev: 52, doc: doc(52) });
    await Promise.all([first, second]);

    expect(sync.appliedRev).toBe(52);
  });

  it('ignores a snapshot that completes after a newer welcome', async () => {
    const older = deferred<DesignSnapshot>();
    const newer = deferred<DesignSnapshot>();
    const fetchSnapshot = vi.fn((_roomPin: typeof pin, rev: number) => (rev === 40 ? older.promise : newer.promise));
    const bridge = { send: vi.fn() };
    const sync = new WatcherSync({ bridge, fetchSnapshot, store: createRoomStore() });

    const firstWelcome = sync.onWelcome(state(40));
    const secondWelcome = sync.onWelcome(state(50));
    newer.resolve({ rev: 50, doc: doc(50) });
    await secondWelcome;
    older.resolve({ rev: 40, doc: doc(40) });
    await firstWelcome;

    expect(sync.appliedRev).toBe(50);
    expect(sync.doc).toEqual(doc(50));
    expect(appliedRevisions(bridge.send)).toEqual([50]);
  });

  it('marks the room desynced after three failed snapshot attempts', async () => {
    const fetchSnapshot = vi.fn(async () => {
      throw new Error('offline');
    });
    const store = createRoomStore();
    const sync = new WatcherSync({ bridge: { send: vi.fn() }, fetchSnapshot, store });

    await sync.onWelcome(state(40));

    expect(fetchSnapshot).toHaveBeenCalledTimes(3);
    expect(store.getState().status).toBe('desynced');
  });
});

function appliedRevisions(send: ReturnType<typeof vi.fn>): number[] {
  return send.mock.calls.map(([envelope]) => (envelope as { payload: { rev: number } }).payload.rev);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
