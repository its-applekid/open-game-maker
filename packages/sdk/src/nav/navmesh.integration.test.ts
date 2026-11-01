import { describe, expect, it } from 'vitest';

import { loadNavmesh } from './navmesh.js';

describe('navmesh integration', () => {
  it('builds a two-triangle floor and finds a path across it', async () => {
    const navmesh = await loadNavmesh(new Set(['nav.navmesh']));
    navmesh.build(new Float32Array([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5]), new Uint32Array([0, 2, 1, 0, 3, 2]), {
      cs: 0.2,
      ch: 0.2,
      walkableHeight: 1,
      walkableRadius: 0,
      walkableClimb: 0.5,
    });

    const path = navmesh.findPath([-3, 0, -3], [3, 0, 3]);

    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual([-3, 0, -3]);
    expect(path.at(-1)).toEqual([3, 0, 3]);
  });
});
