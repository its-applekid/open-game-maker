import { describe, expect, it } from 'vitest';

import { parseKitMap, writeKitMap, type KitMap } from '../src/map.js';

const H = 0x80000000;
const V = 0x40000000;
const D = 0x20000000;

function tiled(layers: unknown[], tilewidth = 64) {
  return {
    orientation: 'orthogonal',
    width: 2,
    height: 2,
    tilewidth,
    tileheight: 64,
    tilesets: [
      {
        firstgid: 1,
        tiles: [
          { id: 0, properties: [{ name: 'asset', type: 'string', value: 'floor' }] },
          { id: 1, properties: [{ name: 'asset', type: 'string', value: 'wall' }] },
        ],
      },
    ],
    layers,
  };
}

describe('kit maps', () => {
  it('round-trips placements through Tiled JSON', () => {
    const map: KitMap = {
      width: 3,
      height: 2,
      placements: [
        { asset: 'floor', cell: [0, 0], z: 0, turns: 0 },
        { asset: 'wall', cell: [1.5, 0], z: 4, turns: 1 },
        { asset: 'wall', cell: [2, 1], z: 0, turns: 3 },
      ],
    };
    expect(parseKitMap(JSON.parse(JSON.stringify(writeKitMap(map, 32))))).toEqual(map);
  });

  it('reads tile layers: rotate flags as turns, the layer z as height', () => {
    const data = [1, (2 | D | H) >>> 0, (2 | H | V) >>> 0, (1 | D | V) >>> 0];
    const map = parseKitMap(tiled([{ type: 'tilelayer', width: 2, data, properties: [{ name: 'z', value: 4 }] }]));
    expect(map.placements).toEqual([
      { asset: 'floor', cell: [0, 0], z: 4, turns: 0 },
      { asset: 'wall', cell: [1, 0], z: 4, turns: 1 },
      { asset: 'wall', cell: [0, 1], z: 4, turns: 2 },
      { asset: 'floor', cell: [1, 1], z: 4, turns: 3 },
    ]);
  });

  it('reads object rotation in 90° steps, an object z over its layer z', () => {
    const objects = [
      { gid: 2, x: 96, y: 32, rotation: 270, properties: [{ name: 'z', value: 2 }] },
      { x: 0, y: 0 },
    ];
    const map = parseKitMap(tiled([{ type: 'objectgroup', objects, properties: [{ name: 'z', value: 1 }] }]));
    expect(map.placements).toEqual([{ asset: 'wall', cell: [1.5, 0.5], z: 2, turns: 3 }]);
  });

  it('refuses what a kit piece cannot be', () => {
    expect(() => parseKitMap(tiled([{ type: 'tilelayer', width: 2, data: [(1 | H) >>> 0] }]))).toThrow(/mirrored/);
    expect(() => parseKitMap(tiled([{ type: 'tilelayer', width: 2, data: [3] }]))).toThrow('Tile 3 has no asset');
    expect(() =>
      parseKitMap(tiled([{ type: 'objectgroup', objects: [{ gid: 1, x: 0, y: 0, rotation: 45 }] }])),
    ).toThrow(/multiple of 90/);
    expect(() => parseKitMap(tiled([], 32))).toThrow(/square tiles/);
  });
});
