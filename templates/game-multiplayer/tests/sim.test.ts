import type { HostApi, MultiplayerHooksV2, Patch } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { toUnits } from '@gm/sdk/net';
import { connectPhaserLifecycle, defaultDesign, game, getGameContext } from '../src/game.js';
import gmManifest from '../gm.manifest.json' with { type: 'json' };
import { hud } from '../src/hud.js';
import {
  addPlayer,
  applyInput,
  captureOwned,
  captureShared,
  createSimulation,
  digestSimulation,
  playerId,
  restoreOwned,
  serializeSimulation,
  spawns,
  stepSimulation,
} from '../src/state.js';

const moveFrame = {
  playerIndex: 0,
  tick: 1,
  source: 'keyboard' as const,
  actions: { move: 1 },
};

describe('platformer simulation', () => {
  it('steps 3,600 frames from plain input data', () => {
    const state = createSimulation(defaultDesign);
    const initialX = state.players.get(0)!.p[0];
    applyInput(state, 0, moveFrame);

    for (let index = 0; index < 3_600; index += 1) stepSimulation(state, defaultDesign, 1 / 60);

    expect(state.tick).toBe(3_600);
    expect(state.players.get(0)!.p[0]).toBeGreaterThan(initialX);
  });

  it('jumps from the ground and lands again', () => {
    const state = createSimulation(defaultDesign);
    const player = state.players.get(0)!;
    const groundY = player.p[1];

    applyInput(state, 0, { ...moveFrame, actions: { jump: true } });
    stepSimulation(state, defaultDesign, 1 / 60);
    expect(player.p[1]).toBeLessThan(groundY);
    expect(player.onGround).toBe(false);

    for (let index = 0; index < 120; index += 1) stepSimulation(state, defaultDesign, 1 / 60);
    expect(player.p[1]).toBe(groundY);
    expect(player.onGround).toBe(true);
  });

  it('is deterministic for identical frames', () => {
    const first = createSimulation(defaultDesign);
    const second = createSimulation(defaultDesign);
    applyInput(first, 0, moveFrame);
    applyInput(second, 0, moveFrame);

    for (let index = 0; index < 600; index += 1) {
      stepSimulation(first, defaultDesign, 1 / 60);
      stepSimulation(second, defaultDesign, 1 / 60);
    }

    expect(serializeSimulation(first)).toEqual(serializeSimulation(second));
  });

  it('moves only the player whose input arrived', () => {
    const state = createSimulation(defaultDesign);
    addPlayer(state, 1, playerId(1));
    const hostX = state.players.get(0)!.p[0];
    const peerX = state.players.get(1)!.p[0];

    applyInput(state, 1, { ...moveFrame, playerIndex: 1 });
    for (let index = 0; index < 60; index += 1) stepSimulation(state, defaultDesign, 1 / 60);

    expect(state.players.get(1)!.p[0]).toBeGreaterThan(peerX);
    expect(state.players.get(0)!.p[0]).toBe(hostX);
  });

  it('places each seat on its own spawn point from design/spawns.json', () => {
    const state = createSimulation(defaultDesign);
    for (let index = 1; index < gmManifest.maxPlayers; index += 1) addPlayer(state, index, playerId(index));

    expect(spawns.length).toBeGreaterThanOrEqual(gmManifest.maxPlayers);
    const positions = [...state.players.values()].map((player) => player.p[0]);
    expect(new Set(positions).size).toBe(gmManifest.maxPlayers);
  });
});

describe('2D game module', () => {
  const host = {} as HostApi;

  it('serializes and restores equal state', async () => {
    const instance = await game.mount(host, defaultDesign);
    instance.net.spawn(1, playerId(1));
    const saved = instance.serialize();

    instance.net.despawn(playerId(1));
    instance.restore(saved);

    expect(instance.serialize()).toEqual(saved);
  });

  it('migrates an older save with missing simulation fields', async () => {
    const instance = await game.mount(host, defaultDesign);

    expect(instance.migrate?.({ saveSchemaVersion: 0, data: {} })).toEqual({
      saveSchemaVersion: 1,
      data: { tick: 0, entities: {} },
    });
  });

  it('snapshots every avatar by id and lets a peer render it', async () => {
    const host = await game.mount({} as HostApi, defaultDesign);
    host.net.spawn(1, playerId(1));
    const snapshot = host.net.snapshot();
    host.dispose();

    expect(Object.keys((snapshot.state as { entities: object }).entities)).toEqual(['p0', 'p1']);
    const peer = await game.mount({} as HostApi, defaultDesign);
    peer.net.applySnapshot(snapshot);
    expect(peer.serialize().data).toEqual(snapshot.state);
  });

  it("reads each player's HUD from that player's entry only", async () => {
    const instance = await game.mount({} as HostApi, defaultDesign);
    instance.net.spawn(1, playerId(1));
    const state = getGameContext().state;
    state.players.get(1)!.onGround = false;

    expect(instance.net.hud(0)).toEqual({ player: 1, onGround: true });
    expect(instance.net.hud(1)).toEqual({ player: 2, onGround: false });
    expect(hud(state.players, 3)).toEqual({ player: 4, onGround: false });
  });

  it('ignores a seat slice whose avatar is gone instead of rebuilding a ghost', async () => {
    const instance = await game.mount(host, defaultDesign);
    const net = instance.net as unknown as MultiplayerHooksV2;
    const restore = net.restore as NonNullable<MultiplayerHooksV2['restore']>;
    net.spawn(1, playerId(1));
    const state = getGameContext().state;
    const before = state.players.get(1)!.p;

    /* A seat that forfeited still publishes its own seat word, with no avatar in it. */
    expect(() => restore({ tick: 1, state: { seat: 1 } })).not.toThrow();
    expect(state.players.get(1)!.p).toEqual(before);
    expect([...state.players.keys()]).toEqual([0, 1]);

    net.despawn(playerId(1));
    expect(() => restore({ tick: 2, state: { seat: 1 } })).not.toThrow();
    expect(state.players.has(1)).toBe(false);
  });

  it('releases the mounted template context when disposed', async () => {
    const instance = await game.mount(host, defaultDesign);

    instance.dispose();

    expect(() => getGameContext()).toThrow('game context is not mounted');
  });

  it('applies speed live and level width with a scene restart', async () => {
    const instance = await game.mount(host, defaultDesign);
    const speedPatch: Patch = { op: 'replace', path: ['globals', 'player.speed'], value: 300 };
    const widthPatch: Patch = { op: 'replace', path: ['globals', 'level.width'], value: 2000 };

    expect(
      instance.applyDesign({ ...defaultDesign, globals: { ...defaultDesign.globals, 'player.speed': 300 } }, [
        speedPatch,
      ]),
    ).toBe('live');
    expect(
      instance.applyDesign({ ...defaultDesign, globals: { ...defaultDesign.globals, 'level.width': 2000 } }, [
        widthPatch,
      ]),
    ).toBe('restart-scene');
  });

  it('restarts the scene when entity patches change platform views', async () => {
    const instance = await game.mount(host, defaultDesign);
    const restartScene = vi.fn();
    connectPhaserLifecycle({ pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), restartScene });
    const next = structuredClone(defaultDesign);
    next.entities.plat_1!.props.x = 480;
    const patch: Patch = { op: 'replace', path: ['entities', 'plat_1', 'props', 'x'], value: 480 };

    expect(instance.applyDesign(next, [patch])).toBe('restart-scene');
    expect(restartScene).toHaveBeenCalledOnce();
  });

  it('rejects out-of-bounds and overlapping platform placement', async () => {
    const instance = await game.mount(host, defaultDesign);

    expect(instance.validatePlacement?.('platform', { position: [-1, 300, 0] })).toEqual({
      ok: false,
      reason: 'outside level bounds',
    });
    expect(instance.validatePlacement?.('platform', { position: [400, 320, 0] })).toEqual({
      ok: false,
      reason: 'overlaps an existing platform',
    });
    expect(instance.validatePlacement?.('platform', { position: [700, 300, 0] })).toEqual({ ok: true });
  });

  it('uses the mounted view transform for picking and projection', async () => {
    const instance = await game.mount(host, defaultDesign);
    getGameContext().view = {
      screenToWorld: () => [400, 320],
      worldToScreen: ([x, y]) => ({ x: x - 100, y: y - 50 }),
    };

    expect(instance.pick?.(0, 0)).toEqual([{ id: 'plat_1', kind: 'entity' }]);
    expect(instance.worldToScreen?.('plat_1')).toEqual({ x: 300, y: 270 });
  });
});

describe('per-seat authority hooks', () => {
  const manifest = gmManifest as { net?: { authority?: string; maxSeats?: number } };

  it('declares per-seat authority for four seats', () => {
    expect(manifest.net).toEqual({ authority: 'per-seat', maxSeats: 4 });
    expect(game.manifest.net?.authority).toBe('per-seat');
  });

  it('gives two simulations fed the same 600 frames equal digests', () => {
    const frames = Array.from({ length: 600 }, (_value, index) => ({
      playerIndex: index % 2,
      tick: index,
      source: 'network' as const,
      actions: { move: index % 5 === 0 ? 1 : -1, jump: index % 40 === 0 },
    }));
    const run = () => {
      const state = createSimulation(defaultDesign);
      addPlayer(state, 1, playerId(1));
      for (const frame of frames) {
        applyInput(state, frame.playerIndex, frame);
        stepSimulation(state, defaultDesign, 1 / 60);
      }
      return digestSimulation(state, toUnits);
    };

    const first = run();
    expect(run()).toEqual(first);
    expect(first[0]).toBe(toUnits(600));
    expect(first.length).toBeGreaterThan(3);
  });

  it('changes the digest when one avatar moves by one 1/256 unit', async () => {
    const instance = await game.mount({} as HostApi, defaultDesign);
    const hooks = instance.net as MultiplayerHooksV2;
    hooks.spawn(1, playerId(1));
    const before = hooks.digest!();
    const owned = hooks.capture!({ seat: 0 });
    const slice = owned.state as { seat: number; player: { p: [number, number] } };
    slice.player.p[0] += 1 / 256;
    hooks.restore!({ tick: owned.tick, state: slice });

    expect(hooks.digest!()).not.toEqual(before);
  });

  it('keeps the shared digest independent of any seat position', async () => {
    const state = createSimulation(defaultDesign);
    addPlayer(state, 1, playerId(1));
    const shared = digestSimulation({ ...state, tick: 0, players: new Map() }, toUnits);
    const moved = createSimulation(defaultDesign);
    const player = moved.players.get(0)!;
    player.p[0] += 100;
    expect(digestSimulation({ ...moved, players: new Map() }, toUnits)).toEqual(shared);
    expect(captureShared(state).platforms.length).toBeGreaterThan(0);
  });

  it('withholds the private counter from every recipient but its owner, and never from the digest contract', async () => {
    const instance = await game.mount({} as HostApi, defaultDesign);
    const hooks = instance.net as MultiplayerHooksV2;
    hooks.spawn(1, playerId(1));
    const state = getGameContext().state;
    state.players.get(1)!.secret = 7;

    // Seat 1 is this client: its own slice carries the counter, and a payload for seat 0 does not.
    getGameContext().localPlayerIndex = 1;
    const own = hooks.view!(1) as { state: { player: { secret: number; p: [number, number] } } };
    const forOther = hooks.view!(0) as { state: { player: Record<string, unknown> } };
    expect(own.state.player.secret).toBe(7);
    expect(forOther.state.player).not.toHaveProperty('secret');
    expect(forOther.state.player.p).toEqual(own.state.player.p);

    // A private change must not move `digest()`: two seats exchanging sums could otherwise read it as an oracle.
    const before = hooks.digest!();
    state.players.get(1)!.secret += 1;
    expect(hooks.digest!()).toEqual(before);
    state.players.get(1)!.p[0] += 1 / 256;
    expect(hooks.digest!()).not.toEqual(before);
  });

  it('restores exactly the slice it is given', () => {
    const state = createSimulation(defaultDesign);
    addPlayer(state, 1, playerId(1));
    const owned = captureOwned(state, 1)!;
    state.players.get(1)!.p[0] = 5;
    restoreOwned(state, owned);
    expect(state.players.get(1)!.p[0]).toBe(owned.player.p[0]);
    expect(state.players.get(0)!.p[0]).not.toBe(owned.player.p[0]);
  });

  it('merges a redacted slice instead of zeroing what it omits', () => {
    // A slice produced for another seat has no `secret`; restoring it must keep this client's own value rather than
    // rebuilding the avatar without it (§3.7).
    const state = createSimulation(defaultDesign);
    addPlayer(state, 1, playerId(1));
    const player = state.players.get(1)!;
    player.secret = 3;
    const visible = { ...player };
    delete (visible as Partial<typeof player>).secret;
    restoreOwned(state, { seat: 1, player: visible });

    expect(state.players.get(1)!.secret).toBe(3);
    expect(state.players.get(1)!.p).toEqual(player.p);
    expect(state.players.get(0)).toBeDefined();
  });
});
