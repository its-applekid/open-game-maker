import type { TiledMap } from '../../src/index.js';

/** Terrain mask of the 6x6 fixture: a ring with a hole, a spur and a lone cell, so edges, corners and inner corners all appear. */
// prettier-ignore
export const TERRAIN = [
  [0, 1, 1, 1, 0, 0],
  [1, 1, 1, 1, 1, 0],
  [1, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 1],
];

/** Walls: the east column. */
export const WALLS = [0, 1, 2, 3, 4, 5].map((y) => [0, 0, 0, 0, 0, y === 5 ? 0 : 1]);

export function fixtureMap(scale: number, layout: 'gamemaker' | 'godot' = 'gamemaker'): TiledMap {
  const flat = (rows: number[][], gid: number) => rows.flat().map((v) => (v ? gid : 0));
  return {
    orientation: 'orthogonal',
    width: 6,
    height: 6,
    tilewidth: scale,
    tileheight: scale,
    tilesets: [
      { firstgid: 1, name: 'autotiles' },
      { firstgid: 1000, name: 'plain' },
    ],
    layers: [
      { type: 'tilelayer', name: 'ground', width: 6, height: 6, data: Array(36).fill(1000) },
      {
        type: 'tilelayer',
        name: 'ground-detail',
        width: 6,
        height: 6,
        data: flat(TERRAIN, 1),
        properties: [
          { name: 'autotile', value: layout },
          { name: 'autotileTileset', value: 'autotiles' },
          { name: 'autotileBlock', value: 0 },
        ],
      },
      { type: 'tilelayer', name: 'walls', width: 6, height: 6, data: flat(WALLS, 1001) },
      {
        type: 'objectgroup',
        name: 'objects',
        objects: [
          // A tile object: Tiled stores its bottom edge in y.
          {
            id: 1,
            x: 0,
            y: 6 * scale,
            width: scale,
            height: 2 * scale,
            gid: 1002,
            properties: [{ name: 'asset', value: 'rock' }],
          },
          {
            id: 2,
            x: 2 * scale,
            y: 5 * scale,
            width: scale,
            height: scale,
            gid: 1003,
            properties: [{ name: 'asset', value: 'flower' }],
          },
        ],
      },
    ],
  };
}
