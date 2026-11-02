import type { MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { RoleStore } from './roles.js';

const hooks = (): MultiplayerHooks => ({
  spawn: vi.fn(),
  despawn: vi.fn(),
  snapshot: vi.fn(() => ({ tick: 0, state: {} })),
  applySnapshot: vi.fn(),
  hud: vi.fn(() => ({})),
});

describe('net role store', () => {
  it('diffs sorted membership and only spawns after host confirmation', () => {
    const game = hooks();
    const store = new RoleStore(0, game);
    const joined = vi.fn();
    const left = vi.fn();
    store.onPlayerJoined(joined);
    store.onPlayerLeft(left);

    store.updatePlayers(0, [
      { playerIndex: 2, name: 'Two', connected: true },
      { playerIndex: 0, name: 'Zero', connected: true },
    ]);

    expect(store.players.map(({ playerIndex }) => playerIndex)).toEqual([0, 2]);
    expect(joined).toHaveBeenCalledExactlyOnceWith(2);
    expect(game.spawn).not.toHaveBeenCalled();

    store.updateRole('host');
    expect(game.spawn).toHaveBeenCalledExactlyOnceWith(2, 'p2');

    store.updatePlayers(0, [{ playerIndex: 0, name: 'Zero', connected: true }]);
    expect(left).toHaveBeenCalledExactlyOnceWith(2);
    expect(game.despawn).toHaveBeenCalledExactlyOnceWith('p2');
  });

  it('unsubscribes callbacks and stops updates after disposal', () => {
    const store = new RoleStore(0, hooks());
    const joined = vi.fn();
    const stop = store.onPlayerJoined(joined);
    stop();
    store.updatePlayers(0, [
      { playerIndex: 0, name: 'Zero', connected: true },
      { playerIndex: 1, name: 'One', connected: true },
    ]);
    store.dispose();
    store.updatePlayers(0, [{ playerIndex: 0, name: 'Zero', connected: true }]);

    expect(joined).not.toHaveBeenCalled();
    expect(store.players).toHaveLength(2);
  });

  it('never spawns players while acting as a peer', () => {
    const game = hooks();
    const store = new RoleStore(1, game);
    store.updateRole('peer');
    store.updatePlayers(1, [
      { playerIndex: 0, name: 'Host', connected: true },
      { playerIndex: 1, name: 'Peer', connected: true },
    ]);

    expect(game.spawn).not.toHaveBeenCalled();
  });
});
