import { describe, expect, it, vi } from 'vitest';

import { loadNavmesh, NavUnavailable } from './navmesh.js';

const recast = vi.hoisted(() => ({
  factory: vi.fn(),
  generatorsFactory: vi.fn(),
  init: vi.fn(async () => undefined),
  generate: vi.fn(() => ({ success: true, navMesh: { id: 'floor' } })),
  computePath: vi.fn(() => ({
    success: true,
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ],
  })),
}));

vi.mock('recast-navigation', () => {
  recast.factory();
  return {
    init: recast.init,
    NavMeshQuery: class {
      computePath = recast.computePath;
    },
  };
});

vi.mock('recast-navigation/generators', () => {
  recast.generatorsFactory();
  return { generateSoloNavMesh: recast.generate };
});

describe('loadNavmesh', () => {
  it('rejects before importing recast when the capability is absent', async () => {
    await expect(loadNavmesh(new Set())).rejects.toBeInstanceOf(NavUnavailable);
    expect(recast.factory).not.toHaveBeenCalled();
    expect(recast.generatorsFactory).not.toHaveBeenCalled();
  });

  it('builds and queries through the typed facade when enabled', async () => {
    const navmesh = await loadNavmesh(new Set(['nav.navmesh']));
    navmesh.build(new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]), new Uint32Array([0, 1, 2, 0, 2, 3]), {
      cs: 0.1,
    });

    expect(recast.init).toHaveBeenCalledOnce();
    expect(recast.generate).toHaveBeenCalledOnce();
    expect(navmesh.findPath([0, 0, 0], [1, 0, 1])).toEqual([
      [0, 0, 0],
      [1, 0, 1],
    ]);
  });

  it('wraps recast initialization failures as NavUnavailable', async () => {
    const cause = new Error('wasm initialization failed');
    recast.init.mockRejectedValueOnce(cause);

    await expect(loadNavmesh(new Set(['nav.navmesh']))).rejects.toMatchObject({
      name: 'NavUnavailable',
      message: expect.stringContaining('recast-navigation'),
      cause,
    });
  });

  it('surfaces generator failures', async () => {
    recast.generate.mockReturnValueOnce({ success: false, error: 'walkable floor is empty' } as never);
    const navmesh = await loadNavmesh(new Set(['nav.navmesh']));

    expect(() => navmesh.build(new Float32Array(), new Uint32Array())).toThrow('walkable floor is empty');
  });

  it('surfaces query failures', async () => {
    recast.computePath.mockReturnValueOnce({ success: false, error: { name: 'NO_PATH' }, path: [] } as never);
    const navmesh = await loadNavmesh(new Set(['nav.navmesh']));
    navmesh.build(new Float32Array(), new Uint32Array());

    expect(() => navmesh.findPath([0, 0, 0], [1, 0, 1])).toThrow('NO_PATH');
  });
});
