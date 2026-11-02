import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKitPlacer } from '../src/kit-placer.js';
import { fixtureLoader } from './fixtures/manifest.js';

const geometry = (min: number[], max: number[]) => ({ bounds_m: { min, max }, triangles: 12, normalized: false });

/** A dungeon-style wall: 4 m long on X, its 0.5 m thickness behind the origin (pivot on the front edge). */
const WALL = { meta: { kit: { piece: 'wall', grid_m: 4 }, geometry: geometry([-2, 0, -0.5], [2, 4, 0]) } };
const FLOOR = { meta: { kit: { piece: 'floor', grid_m: 4 }, geometry: geometry([-2, 0, -2], [2, 0.2, 2]) } };
const PROP = { meta: { geometry: geometry([-0.5, 0, -0.5], [0.5, 1, 0.5]) } };

async function placer() {
  const { loader } = await fixtureLoader({ wall: WALL, floor: FLOOR, prop: PROP });
  return createKitPlacer(loader);
}

afterEach(() => vi.unstubAllGlobals());

describe('createKitPlacer', () => {
  it('snaps the origin to the piece grid in X and Z and turns in quarter steps', async () => {
    const kit = await placer();
    const placed = kit.snap('wall', [5.1, 1, -2.1], 1);
    expect(placed.position).toEqual([4, 1, -4]);
    expect(placed.yaw).toBeCloseTo(-Math.PI / 2);
    expect(kit.snap('wall', [0, 0, 0], 5).yaw).toBeCloseTo(-Math.PI / 2);
    expect(kit.snap('wall', [0, 0, 0], -1).yaw).toBeCloseTo((-3 * Math.PI) / 2);
  });

  it('refuses to snap a piece without a grid, and part turns', async () => {
    const kit = await placer();
    expect(() => kit.snap('prop', [0, 0, 0], 0)).toThrow('Asset prop has no kit.grid_m');
    expect(() => kit.snap('wall', [0, 0, 0], 0.5)).toThrow(/whole quarter turns/);
  });

  it('turns the footprint clockwise seen from above', async () => {
    const kit = await placer();
    expect(kit.footprint('wall', 0)).toEqual({ min: [-2, -0.5], max: [2, 0] });
    // east (+X) turns to south (+Z): the wall runs along Z with its thickness on +X
    expect(kit.footprint('wall', 1)).toEqual({ min: [0, -2], max: [0.5, 2] });
    expect(kit.footprint('wall', 2)).toEqual({ min: [-2, 0], max: [2, 0.5] });
    expect(kit.footprint('wall', 3)).toEqual({ min: [-0.5, -2], max: [0, 2] });
    expect(kit.footprint('wall', -1)).toEqual(kit.footprint('wall', 3));
  });

  it('gives walls a cuboid from their turned bounds', async () => {
    const kit = await placer();
    expect(kit.colliderFor('wall', 1)).toEqual({ shape: 'cuboid', halfExtents: [0.25, 2, 2], offset: [0.25, 2, 0] });
  });

  it('gives floors and props no collider unless the game asks', async () => {
    const kit = await placer();
    expect(kit.colliderFor('floor', 0)).toBeNull();
    expect(kit.colliderFor('prop', 0)).toBeNull();
    expect(kit.colliderFor('prop', 0, { solid: true })).toEqual({
      shape: 'cuboid',
      halfExtents: [0.5, 0.5, 0.5],
      offset: [0, 0.5, 0],
    });
    expect(kit.colliderFor('wall', 0, { solid: false })).toBeNull();
  });
});
