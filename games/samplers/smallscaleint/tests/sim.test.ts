import type { HostApi, Patch } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { connectPhaserLifecycle, defaultDesign, game, getGameContext } from '../src/game.js';
import { sampleScene, sceneAt, sceneIds } from '../src/sampler.js';
import { createSimulation, serializeSimulation, stepSimulation } from '../src/state.js';

describe('sampler timeline', () => {
  it('selects all six scenes on exact four-second boundaries', () => {
    expect(sceneIds.map((_, index) => sceneAt(index * 4).id)).toEqual(sceneIds);
    expect(sceneAt(24).id).toBe('village');
  });

  it('is deterministic for identical elapsed time', () => {
    expect(sampleScene(13.75)).toEqual(sampleScene(13.75));
    expect(sampleScene(21.5, 'creatures')).toEqual(sampleScene(21.5, 'creatures'));
  });

  it('shows a visible state change in every vignette', () => {
    for (const id of sceneIds) {
      const before = sampleScene(0.15, id);
      const after = sampleScene(3.75, id);
      expect(after.actors).not.toEqual(before.actors);
      expect(after.eventComplete).toBe(true);
    }
  });

  it('steps 3,600 frames with no accumulated branch randomness', () => {
    const state = createSimulation();
    for (let index = 0; index < 3_600; index += 1) stepSimulation(state, 1 / 60);
    expect(state.tick).toBe(3_600);
    expect(serializeSimulation(state).elapsedMs).toBeCloseTo(60_000, 6);
  });
});

describe('sampler game module', () => {
  const host = {} as HostApi;

  it('serializes and restores equal state', async () => {
    const instance = await game.mount(host, defaultDesign);
    getGameContext().advance(1 / 60, []);
    const saved = instance.serialize();
    getGameContext().advance(1, []);
    instance.restore(saved);
    expect(instance.serialize()).toEqual(saved);
  });

  it('migrates an older save with missing fields', async () => {
    const instance = await game.mount(host, defaultDesign);
    expect(instance.migrate?.({ saveSchemaVersion: 0, data: {} })).toEqual({
      saveSchemaVersion: 1,
      data: { tick: 0, elapsedMs: 0 },
    });
  });

  it('releases context and restarts when the deterministic seed changes', async () => {
    const instance = await game.mount(host, defaultDesign);
    const restartScene = vi.fn();
    connectPhaserLifecycle({ pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), restartScene });
    const patch: Patch = { op: 'replace', path: ['globals', 'sampler.seed'], value: 8 };
    expect(instance.applyDesign({ ...defaultDesign, globals: { 'sampler.seed': 8 } }, [patch])).toBe('restart-scene');
    expect(restartScene).toHaveBeenCalledOnce();
    instance.dispose();
    expect(() => getGameContext()).toThrow('game context is not mounted');
  });
});
