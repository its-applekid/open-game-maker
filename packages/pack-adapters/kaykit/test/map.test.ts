import { describe, expect, it } from 'vitest';

import { parseKitMap, writeKitMap, type KitMap } from '../src/map.js';

const H = 0x80000000;
const V = 0x40000000;
const D = 0x20000000;

function tiled(layers: unknown[], extra: Record<string, unknown> = {}) {
  return {
    orientation: 'orthogonal',
    width: 2,
    height: 2,
    tilewidth: 64,
    tileheight: 64,
    properties: [{ name: 'grid_m', type: 'float', value: 4 }],
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
    ...extra,
  };
}

const tileLayer = (data: number[], properties?: unknown[]) => ({
  type: 'tilelayer',
  width: 2,
  height: 2,
  data,
  properties,
});

describe('kit maps', () => {
  it('round-trips placements through Tiled JSON', () => {
    const map: KitMap = {
      gridM: 2,
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

  it('reads tile layers: rotate flags as turns, the layer z as height, the map grid', () => {
    const data = [1, (2 | D | H) >>> 0, (2 | H | V) >>> 0, (1 | D | V) >>> 0];
    const map = parseKitMap(tiled([tileLayer(data, [{ name: 'z', value: 4 }])]));
    expect(map.gridM).toBe(4);
    expect(map.placements).toEqual([
      { asset: 'floor', cell: [0, 0], z: 4, turns: 0 },
      { asset: 'wall', cell: [1, 0], z: 4, turns: 1 },
      { asset: 'wall', cell: [0, 1], z: 4, turns: 2 },
      { asset: 'floor', cell: [1, 1], z: 4, turns: 3 },
    ]);
  });

  it('puts a tile object on the cell a tile-layer tile would take (Tiled anchors objects bottom-left)', () => {
    const fromLayer = parseKitMap(tiled([tileLayer([0, 0, 0, 2])])).placements[0];
    const fromObject = parseKitMap(tiled([{ type: 'objectgroup', objects: [{ gid: 2, x: 64, y: 128 }] }]))
      .placements[0];
    expect(fromObject).toEqual(fromLayer);
  });

  it('reads object rotation in 90° steps on top of flag turns, an object z over its layer z', () => {
    const objects = [
      { gid: 2, x: 96, y: 96, rotation: 270, properties: [{ name: 'z', value: 2 }] },
      { gid: (2 | D | H) >>> 0, x: 0, y: 64, rotation: 90 },
      { gid: 2, x: 0, y: 64, rotation: -90 },
      { x: 0, y: 0 },
    ];
    const map = parseKitMap(tiled([{ type: 'objectgroup', objects, properties: [{ name: 'z', value: 1 }] }]));
    expect(map.placements).toEqual([
      { asset: 'wall', cell: [1.5, 0.5], z: 2, turns: 3 },
      { asset: 'wall', cell: [0, 0], z: 1, turns: 2 },
      { asset: 'wall', cell: [0, 0], z: 1, turns: 3 },
    ]);
  });

  it('refuses what a kit map cannot hold', () => {
    expect(() => parseKitMap(tiled([tileLayer([(1 | H) >>> 0, 0, 0, 0])]))).toThrow(/mirrored/);
    expect(() => parseKitMap(tiled([tileLayer([3, 0, 0, 0])]))).toThrow('Tile 3 has no asset');
    expect(() => parseKitMap(tiled([tileLayer([1, 0, 0])]))).toThrow('holds 3 tiles, not 2x2');
    expect(() =>
      parseKitMap(tiled([{ type: 'objectgroup', objects: [{ gid: 1, x: 0, y: 64, rotation: 45 }] }])),
    ).toThrow(/multiple of 90/);
    expect(() => parseKitMap(tiled([{ type: 'group', layers: [tileLayer([1, 0, 0, 0])] }]))).toThrow(/ungroup/);
    expect(() => parseKitMap(tiled([], { tilewidth: 32 }))).toThrow(/square tiles/);
    expect(() => parseKitMap(tiled([], { properties: [] }))).toThrow(/grid_m/);
  });
});
