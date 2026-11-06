import type { GameManifest, MultiplayerHooksV2 } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createNetController } from './index.js';

const seat = (index: number, overrides: Partial<Record<'userId' | 'forfeited' | 'spectator', unknown>> = {}) => ({
  seat: index,
  userId: `user-${index}`,
  name: `Seat ${index}`,
  team: 0,
  connected: true,
  ready: false,
  forfeited: false,
  spectator: false,
  ...overrides,
});

/** A per-seat game: the v2 hooks plus the v1 four every template implements. */
function perSeatHooks() {
  const spawn = vi.fn();
  const despawn = vi.fn();
  const hooks = {
    spawn,
    despawn,
    snapshot: () => ({ tick: 0, state: {} }),
    applySnapshot: () => undefined,
    hud: () => ({}),
    capture: () => ({ tick: 0, state: {} }),
    restore: () => undefined,
    digest: () => [0],
  } as unknown as MultiplayerHooksV2;

  return { hooks, spawn, despawn };
}

const manifest = { inputs: { actions: {} }, net: { authority: 'per-seat', maxSeats: 4 } } as unknown as GameManifest;

function controller(hooks: MultiplayerHooksV2) {
  return createNetController({
    manifest,
    hooks,
    localPlayerIndex: 0,
    send: vi.fn(),
    acceptInput: vi.fn(),
    syncPlayers: vi.fn(),
    setLocalPlayerIndex: vi.fn(),
    recordEvent: vi.fn(),
    now: () => 0,
  });
}

describe('seats are players in a per-seat match', () => {
  it('fires the v1 spawn hook for every seat that joins, so a template that only implements spawn gets the avatars', () => {
    const { hooks, spawn } = perSeatHooks();
    const net = controller(hooks);

    net.handleMessage('net.seats', { seats: [seat(0), seat(1)] });

    expect(spawn.mock.calls).toEqual([
      [0, 'p0'],
      [1, 'p1'],
    ]);
  });

  it('does not spawn a seat twice, and despawns a seat that forfeits', () => {
    const { hooks, spawn, despawn } = perSeatHooks();
    const net = controller(hooks);

    net.handleMessage('net.seats', { seats: [seat(0), seat(1), seat(2)] });
    net.handleMessage('net.seats', { seats: [seat(0), seat(1), seat(2, { forfeited: true })] });
    net.handleMessage('net.seats', { seats: [seat(0), seat(1)] });

    expect(spawn.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(despawn.mock.calls).toEqual([['p2']]);
  });

  it('skips an empty seat row and a spectator', () => {
    const { hooks, spawn } = perSeatHooks();
    const net = controller(hooks);

    net.handleMessage('net.seats', {
      seats: [seat(0), seat(1, { userId: '' }), seat(2, { spectator: true })],
    });

    expect(spawn.mock.calls).toEqual([[0, 'p0']]);
  });
});
