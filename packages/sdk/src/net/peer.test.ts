import type { MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { encodeBase64, packJson } from './codec.js';
import { interpolateState, PeerChannel } from './peer.js';

const wireSnapshot = (seq: number, tick: number, state: unknown) => ({
  seq,
  tick,
  data: encodeBase64(packJson({ tick, state }, 65_536, 'snapshot')),
});

describe('peer net channel', () => {
  it('renders spatial state one hundred milliseconds behind receipt time', () => {
    let now = 0;
    const applySnapshot = vi.fn();
    const channel = new PeerChannel({
      actions: { move: 'axis' },
      hooks: {
        spawn() {},
        despawn() {},
        snapshot: () => ({ tick: 0, state: {} }),
        applySnapshot,
        hud: () => ({}),
      },
      role: () => 'peer',
      localPlayerIndex: () => 1,
      send: vi.fn(),
      now: () => now,
      droppedSnapshot: vi.fn(),
      invalidSnapshot: vi.fn(),
      stalled: vi.fn(),
      oversized: vi.fn(),
    });

    channel.receiveSnapshot(wireSnapshot(1, 10, { entities: { player: { p: { x: 0 }, score: 1 } } }));
    now = 50;
    channel.receiveSnapshot(wireSnapshot(2, 20, { entities: { player: { p: { x: 10 }, score: 2 } } }));
    now = 125;
    channel.render();

    expect(applySnapshot).toHaveBeenCalledWith({
      tick: 20,
      state: { entities: { player: { p: { x: 5 }, score: 2 } } },
    });

    applySnapshot.mockClear();
    now = 500;
    channel.render();
    expect(applySnapshot).toHaveBeenCalledWith({
      tick: 20,
      state: { entities: { player: { p: { x: 10 }, score: 2 } } },
    });
  });

  it('drops regressing snapshots and reports one stall per traffic gap', () => {
    let now = 0;
    const droppedSnapshot = vi.fn();
    const stalled = vi.fn();
    const channel = new PeerChannel({
      actions: {},
      hooks: {
        spawn() {},
        despawn() {},
        snapshot: () => ({ tick: 0, state: {} }),
        applySnapshot: vi.fn(),
        hud: () => ({}),
      },
      role: () => 'peer',
      localPlayerIndex: () => 0,
      send: vi.fn(),
      now: () => now,
      droppedSnapshot,
      invalidSnapshot: vi.fn(),
      stalled,
      oversized: vi.fn(),
    });
    channel.enterPeer();
    channel.receiveSnapshot(wireSnapshot(4, 4, {}));
    channel.receiveSnapshot(wireSnapshot(3, 3, {}));
    expect(droppedSnapshot).toHaveBeenCalledOnce();

    now = 2_001;
    channel.render();
    channel.render();
    expect(stalled).toHaveBeenCalledOnce();

    channel.receiveSnapshot(wireSnapshot(5, 5, {}));
    now = 4_002;
    channel.render();
    expect(stalled).toHaveBeenCalledTimes(2);
  });

  it('applies a single snapshot unchanged without extrapolation', () => {
    let now = 0;
    const applySnapshot = vi.fn();
    const channel = new PeerChannel({
      actions: {},
      hooks: {
        spawn() {},
        despawn() {},
        snapshot: () => ({ tick: 0, state: {} }),
        applySnapshot,
        hud: () => ({}),
      },
      role: () => 'peer',
      localPlayerIndex: () => 1,
      send: vi.fn(),
      now: () => now,
      droppedSnapshot: vi.fn(),
      invalidSnapshot: vi.fn(),
      stalled: vi.fn(),
      oversized: vi.fn(),
    });
    channel.receiveSnapshot(wireSnapshot(1, 8, { entities: { player: { p: [4, 5, 6] } } }));

    now = 125;
    channel.render();

    expect(applySnapshot).toHaveBeenCalledExactlyOnceWith({
      tick: 8,
      state: { entities: { player: { p: [4, 5, 6] } } },
    });
  });

  it('sends only the local peer input frame', () => {
    const send = vi.fn();
    const channel = new PeerChannel({
      actions: { jump: 'button' },
      hooks: {} as MultiplayerHooks,
      role: () => 'peer',
      localPlayerIndex: () => 1,
      send,
      now: () => 0,
      droppedSnapshot: vi.fn(),
      invalidSnapshot: vi.fn(),
      stalled: vi.fn(),
      oversized: vi.fn(),
    });

    channel.sendFrames([
      { playerIndex: 0, tick: 1, source: 'keyboard', actions: { jump: true } },
      { playerIndex: 1, tick: 1, source: 'keyboard', actions: { jump: true } },
    ]);

    expect(send).toHaveBeenCalledExactlyOnceWith('net.input', {
      f: { seq: 1, tick: 1, axes: [], buttons: 1 },
    });
  });

  it('interpolates nested spatial leaves and normalizes equivalent quaternion signs', () => {
    const state = interpolateState(
      { entities: { player: { p: [0, { y: 2 }], r: [0, 0, 0, 1], score: 1 } } },
      { entities: { player: { p: [10, { y: 6 }], r: [0, 0, 0, -1], score: 2 } } },
      0.5,
    );

    expect(state).toEqual({
      entities: { player: { p: [5, { y: 4 }], r: [0, 0, 0, 1], score: 2 } },
    });
  });
});
