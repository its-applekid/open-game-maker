import type { MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { HostChannel } from './host.js';

describe('host net channel', () => {
  it('decodes remote input and emits a snapshot after every third completed step', () => {
    let completedTick = 0;
    const send = vi.fn();
    const acceptInput = vi.fn();
    const emitInput = vi.fn();
    const hooks: MultiplayerHooks = {
      spawn() {},
      despawn() {},
      snapshot: () => ({ tick: completedTick, state: { completedTick } }),
      applySnapshot() {},
      hud: () => ({}),
    };
    const channel = new HostChannel({
      actions: { move: 'axis' },
      hooks,
      role: () => 'host',
      localPlayerIndex: () => 0,
      playerCount: () => 2,
      send,
      acceptInput,
      emitInput,
      oversized: vi.fn(),
    });

    channel.receiveInput({ playerIndex: 1, seq: 4, tick: 7, axes: [1], buttons: 0 });
    expect(emitInput).toHaveBeenCalledWith(1, expect.objectContaining({ source: 'network', actions: { move: 1 } }));
    expect(acceptInput).toHaveBeenCalledWith(expect.objectContaining({ playerIndex: 1, source: 'network' }));
    channel.receiveInput({ playerIndex: 0, seq: 5, tick: 8, axes: [1], buttons: 0 });
    expect(acceptInput).toHaveBeenCalledOnce();

    for (completedTick = 1; completedTick <= 180; completedTick += 1) channel.afterStep(completedTick);
    expect(send).toHaveBeenCalledTimes(60);
    expect(send.mock.calls[0]).toEqual(['net.snapshot', expect.objectContaining({ seq: 1, tick: 3 })]);
    expect(send.mock.calls.at(-1)).toEqual(['net.snapshot', expect.objectContaining({ seq: 60, tick: 180 })]);
  });

  it('does not emit automatic traffic for one player and refuses oversized snapshots', () => {
    const send = vi.fn();
    const oversized = vi.fn();
    let players = 1;
    const channel = new HostChannel({
      actions: {},
      hooks: {
        spawn() {},
        despawn() {},
        snapshot: () => ({ tick: 3, state: { padding: 'x'.repeat(70_000) } }),
        applySnapshot() {},
        hud: () => ({}),
      },
      role: () => 'host',
      localPlayerIndex: () => 0,
      playerCount: () => players,
      send,
      acceptInput: vi.fn(),
      emitInput: vi.fn(),
      oversized,
    });

    for (let tick = 1; tick <= 600; tick += 1) channel.afterStep(tick);
    expect(send).not.toHaveBeenCalled();

    players = 2;
    channel.afterStep(603);
    expect(send).not.toHaveBeenCalled();
    expect(oversized).toHaveBeenCalledExactlyOnceWith('snapshot', expect.any(RangeError));
  });
});
