import type { AssetLoader } from '@gm/sdk/assets';

import { conventions } from './conventions.js';

export type Vec3 = [number, number, number];

/** Quarter turns clockwise seen from above (+Y), the way Tiled rotates; yaw is `-turns × π/2`. */
export type Turns = number;

export interface Placement {
  position: Vec3;
  yaw: number;
}

/** A Rapier-ready description; the game builds the collider in its own world. */
export interface CuboidCollider {
  shape: 'cuboid';
  halfExtents: Vec3;
  /** Centre of the cuboid from the piece origin, after rotation. */
  offset: Vec3;
}

export interface KitPlacer {
  /** Snaps the origin to the piece's `grid_m` in X and Z (Y is kept) and turns it in 90° steps. */
  snap(id: string, point: Vec3, turns: Turns): Placement;
  /** The rotated XZ rectangle the piece covers, relative to its origin. */
  footprint(id: string, turns: Turns): { min: [number, number]; max: [number, number] };
  /** Cuboid from bounds for solid kit pieces; `null` for the rest unless `solid` is asked. */
  colliderFor(id: string, turns: Turns, options?: { solid?: boolean }): CuboidCollider | null;
}

function quarter(turns: Turns): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(turns)) throw new Error(`Turns must be whole quarter turns, got ${turns}`);
  return (((turns % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

/** Rotates (x, z) by quarter turns clockwise seen from above (`0 - v` keeps -0 out of the results). */
function turn([x, z]: [number, number], turns: Turns): [number, number] {
  switch (quarter(turns)) {
    case 0:
      return [x, z];
    case 1:
      return [0 - z, x];
    case 2:
      return [0 - x, 0 - z];
    case 3:
      return [z, 0 - x];
  }
}

export function createKitPlacer(loader: AssetLoader): KitPlacer {
  const bounds = (id: string) => {
    const box = loader.resolve(id).meta?.geometry?.bounds_m;
    if (!box) throw new Error(`Asset ${id} has no geometry.bounds_m`);
    return box;
  };

  const footprint: KitPlacer['footprint'] = (id, turns) => {
    const { min, max } = bounds(id);
    const a = turn([min[0], min[2]], turns);
    const b = turn([max[0], max[2]], turns);
    return {
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    };
  };

  return {
    snap(id, [x, y, z], turns) {
      const grid = loader.resolve(id).meta?.kit?.grid_m;
      if (grid === undefined) throw new Error(`Asset ${id} has no kit.grid_m to snap to`);
      return {
        position: [Math.round(x / grid) * grid, y, Math.round(z / grid) * grid],
        yaw: (-quarter(turns) * Math.PI) / 2,
      };
    },
    footprint,
    colliderFor(id, turns, options = {}) {
      const piece = loader.resolve(id).meta?.kit?.piece;
      const solid = options.solid ?? (piece !== undefined && conventions.solidPieces.value.has(piece));
      if (!solid) return null;
      const {
        min: [, minY],
        max: [, maxY],
      } = bounds(id);
      const area = footprint(id, turns);
      return {
        shape: 'cuboid',
        halfExtents: [(area.max[0] - area.min[0]) / 2, (maxY - minY) / 2, (area.max[1] - area.min[1]) / 2],
        offset: [(area.max[0] + area.min[0]) / 2, (maxY + minY) / 2, (area.max[1] + area.min[1]) / 2],
      };
    },
  };
}
