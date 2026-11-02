import { z } from 'zod';

import type { Turns } from './kit-placer.js';

/**
 * One kit piece on the map. `cell` is the piece origin in grid cells (Tiled pixels ÷ tile size); the game multiplies
 * by the piece's `grid_m` and hands the result to `KitPlacer.snap`. `z` is the height of the origin in metres.
 */
export interface KitPlacement {
  asset: string;
  cell: [number, number];
  z: number;
  turns: Turns;
}

export interface KitMap {
  width: number;
  height: number;
  placements: KitPlacement[];
}

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
/** Tiled's rotate-clockwise buttons set these flag pairs; a lone flip is a mirror, which a kit piece cannot do. */
const TURNS_BY_FLAGS = new Map<number, Turns>([
  [0, 0],
  [(FLIP_D | FLIP_H) >>> 0, 1],
  [(FLIP_H | FLIP_V) >>> 0, 2],
  [(FLIP_D | FLIP_V) >>> 0, 3],
]);

const propertiesSchema = z.array(z.looseObject({ name: z.string(), value: z.unknown() })).optional();

const tiledSchema = z.looseObject({
  orientation: z.literal('orthogonal'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().positive(),
  tileheight: z.number().positive(),
  tilesets: z.array(
    z.looseObject({
      firstgid: z.number().int().positive(),
      tiles: z.array(z.looseObject({ id: z.number().int().min(0), properties: propertiesSchema })).optional(),
    }),
  ),
  layers: z.array(
    z.discriminatedUnion('type', [
      z.looseObject({
        type: z.literal('tilelayer'),
        width: z.number().int(),
        data: z.array(z.number()),
        properties: propertiesSchema,
      }),
      z.looseObject({
        type: z.literal('objectgroup'),
        properties: propertiesSchema,
        objects: z.array(
          z.looseObject({
            gid: z.number().optional(),
            x: z.number(),
            y: z.number(),
            rotation: z.number().optional(),
            properties: propertiesSchema,
          }),
        ),
      }),
      z.looseObject({ type: z.enum(['imagelayer', 'group']) }),
    ]),
  ),
});

type Properties = z.infer<typeof propertiesSchema>;

function property(properties: Properties, name: string): unknown {
  return properties?.find((entry) => entry.name === name)?.value;
}

function height(properties: Properties, fallback: number): number {
  const value = property(properties, 'z');
  if (value === undefined) return fallback;
  if (typeof value !== 'number') throw new Error(`Map property z must be a number, got ${JSON.stringify(value)}`);
  return value;
}

/** Reads the Tiled JSON subset kits are authored in: orthogonal, square tiles, embedded tilesets whose tiles carry an `asset` property. */
export function parseKitMap(json: unknown): KitMap {
  const map = tiledSchema.parse(json);
  if (map.tilewidth !== map.tileheight)
    throw new Error(`Kit maps need square tiles, got ${map.tilewidth}x${map.tileheight}`);
  const size = map.tilewidth;

  const assets = new Map<number, string>();
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      const asset = property(tile.properties, 'asset');
      if (typeof asset === 'string') assets.set(tileset.firstgid + tile.id, asset);
    }
  }
  const decode = (raw: number) => {
    const flags = raw & (FLIP_H | FLIP_V | FLIP_D);
    const gid = raw & ~(FLIP_H | FLIP_V | FLIP_D) & 0x0fffffff;
    const asset = assets.get(gid);
    if (!asset) throw new Error(`Tile ${gid} has no asset property`);
    const turns = TURNS_BY_FLAGS.get(flags >>> 0);
    if (turns === undefined) throw new Error(`Tile ${gid} is mirrored; kit pieces only turn`);
    return { asset, turns };
  };

  const placements: KitPlacement[] = [];
  for (const layer of map.layers) {
    if (layer.type === 'tilelayer') {
      const z = height(layer.properties, 0);
      layer.data.forEach((raw, index) => {
        if (raw === 0) return;
        placements.push({ ...decode(raw), cell: [index % layer.width, Math.floor(index / layer.width)], z });
      });
    } else if (layer.type === 'objectgroup') {
      const layerZ = height(layer.properties, 0);
      for (const object of layer.objects) {
        if (object.gid === undefined) continue;
        const rotation = object.rotation ?? 0;
        if (rotation % 90 !== 0) throw new Error(`Object rotation must be a multiple of 90, got ${rotation}`);
        const { asset, turns } = decode(object.gid);
        placements.push({
          asset,
          cell: [object.x / size, object.y / size],
          z: height(object.properties, layerZ),
          turns: (((turns + rotation / 90) % 4) + 4) % 4,
        });
      }
    }
  }
  return { width: map.width, height: map.height, placements };
}

/** Writes placements as one Tiled object layer over an embedded tileset with one tile per asset. */
export function writeKitMap(map: KitMap, tileSize: number): object {
  const assets = [...new Set(map.placements.map((placement) => placement.asset))].sort();
  return {
    type: 'map',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: map.width,
    height: map.height,
    tilewidth: tileSize,
    tileheight: tileSize,
    infinite: false,
    tilesets: [
      {
        firstgid: 1,
        name: 'kit',
        tilecount: assets.length,
        tiles: assets.map((asset, id) => ({ id, properties: [{ name: 'asset', type: 'string', value: asset }] })),
      },
    ],
    layers: [
      {
        type: 'objectgroup',
        name: 'kit',
        objects: map.placements.map((placement, index) => ({
          id: index + 1,
          gid: assets.indexOf(placement.asset) + 1,
          x: placement.cell[0] * tileSize,
          y: placement.cell[1] * tileSize,
          rotation: placement.turns * 90,
          properties: [{ name: 'z', type: 'float', value: placement.z }],
        })),
      },
    ],
  };
}
