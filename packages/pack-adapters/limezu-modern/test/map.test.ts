import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';

import { TopdownMap, paintAutotile, solidFromCards } from '../src/index.js';
import { TERRAIN, WALLS, fixtureMap } from './fixtures/map-6x6.js';

const mask = TERRAIN.map((row) => row.map((v) => v === 1));

function loaderWith(walkable: Record<string, boolean>): AssetLoader {
  return {
    resolve: (id: string) => ({
      url: `https://game.test/${id}.png`,
      file: `${id}.png`,
      license: {},
      meta: { sprite: { drawn_view: 'topdown', tile: { walkable: walkable[id] } } },
    }),
  } as unknown as AssetLoader;
}

describe('TopdownMap', () => {
  it('paints an autotile layer from its mask through the named tileset', () => {
    for (const layout of ['gamemaker', 'godot'] as const) {
      const map = new TopdownMap(fixtureMap(16, layout), 16);
      const expected = paintAutotile(mask, layout).map((row) => row.map((cell) => (cell < 0 ? 0 : 1 + cell)));
      expect(map.tiles('ground-detail')).toEqual(expected);
    }
  });

  it('keeps plain layers as stored, without flip bits', () => {
    const json = fixtureMap(16);
    const ground = json.layers[0] as { data: number[] };
    ground.data[0] = 1000 + 0x80000000; /* horizontal flip flag */
    const map = new TopdownMap(json, 16);
    expect(map.tiles('ground')![0]![0]).toBe(1000);
    expect(map.tiles('walls')).toEqual(WALLS.map((row) => row.map((v) => (v ? 1001 : 0))));
    expect(map.tiles('above')).toBeUndefined();
  });

  it('builds collision from walls and from objects whose card is not walkable', () => {
    const map = new TopdownMap(fixtureMap(32), 32);
    const grid = map.collisionGrid(solidFromCards(loaderWith({ rock: false, flower: true })));
    const expected = WALLS.map((row) => row.map((v) => v === 1));
    // The rock is a tile object 1x2 tiles with its bottom edge on the map's bottom: cells (0,4) and (0,5).
    expected[4]![0] = true;
    expected[5]![0] = true;
    expect(grid).toEqual(expected);
    expect(map.collisionGrid()).toEqual(WALLS.map((row) => row.map((v) => v === 1)));
  });

  it('sorts objects by their bottom edge: depth = y + h', () => {
    const map = new TopdownMap(fixtureMap(16), 16);
    const rock = map.objects.find((o) => o.asset === 'rock')!;
    expect(rock).toMatchObject({ x: 0, top: 4 * 16, h: 32, depth: 6 * 16, gid: 1002 });
    expect(map.depthOfLayer('walls')).toBeLessThan(0);
    expect(map.depthOfLayer('above')).toBeGreaterThan(6 * 16);
  });

  it('rejects a map drawn at another scale than the game', () => {
    expect(() => new TopdownMap(fixtureMap(32), 16)).toThrow(/scale is 16/);
  });

  it('rejects an unknown tile layer and an autotile layer naming no tileset', () => {
    const odd = fixtureMap(16);
    (odd.layers[0] as { name: string }).name = 'floor';
    expect(() => new TopdownMap(odd, 16)).toThrow(/"floor"/);
    const noTileset = fixtureMap(16);
    (noTileset.layers[1] as { properties: { name: string; value: unknown }[] }).properties[1]!.value = 'missing';
    expect(() => new TopdownMap(noTileset, 16)).toThrow(/autotileTileset/);
  });

  it('renders each tile layer into a Phaser layer at its depth, empty cells as -1', () => {
    const calls: { tilesets: unknown[]; layers: { name: string; tiles: number[][]; depth: number }[] } = {
      tilesets: [],
      layers: [],
    };
    const scene = {
      make: {
        tilemap: () => ({
          addTilesetImage: (...args: unknown[]) => {
            calls.tilesets.push(args);
            return { name: args[0] };
          },
          createBlankLayer: (name: string) => {
            const layer = { name, tiles: [] as number[][], depth: 0 };
            calls.layers.push(layer);
            return {
              putTilesAt: (tiles: number[][]) => void (layer.tiles = tiles),
              setDepth: (depth: number) => void (layer.depth = depth),
            };
          },
        }),
      },
    } as unknown as Phaser.Scene;
    const map = new TopdownMap(fixtureMap(16), 16);
    map.render(scene, { autotiles: 'tex-auto', plain: 'tex-plain' });
    expect(calls.tilesets).toEqual([
      ['autotiles', 'tex-auto', 16, 16, 0, 0, 1],
      ['plain', 'tex-plain', 16, 16, 0, 0, 1000],
    ]);
    expect(calls.layers.map((l) => [l.name, l.depth])).toEqual([
      ['ground', -3],
      ['ground-detail', -2],
      ['walls', -1],
    ]);
    expect(calls.layers[1]!.tiles[0]![0]).toBe(-1);
    expect(calls.layers[1]!.tiles[1]![1]).toBe(map.tiles('ground-detail')![1]![1]);
    expect(() => map.render(scene, { autotiles: 'tex-auto' })).toThrow(/plain/);
  });
});
