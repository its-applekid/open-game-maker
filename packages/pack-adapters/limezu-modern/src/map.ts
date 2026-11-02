import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';
import { z } from 'zod';

import { AUTOTILE_LAYOUTS, NEIGHBOUR_BITS, conventions, type AutotileLayout, type Scale } from './conventions.js';

const { N, NE, E, SE, S, SW, W, NW } = NEIGHBOUR_BITS;
const autotile = conventions.autotile.value;

/** A boolean grid, `mask[y][x]`; cells outside it count as empty. */
export type Mask = readonly (readonly boolean[])[];

/** The 8-neighbour blob mask of cell (x, y), corners dropped unless both cardinals beside them are set. */
export function blobMask(mask: Mask, x: number, y: number): number {
  const at = (dx: number, dy: number) => mask[y + dy]?.[x + dx] === true;
  let bits = 0;
  if (at(0, -1)) bits |= N;
  if (at(1, 0)) bits |= E;
  if (at(0, 1)) bits |= S;
  if (at(-1, 0)) bits |= W;
  if (bits & N && bits & E && at(1, -1)) bits |= NE;
  if (bits & S && bits & E && at(1, 1)) bits |= SE;
  if (bits & S && bits & W && at(-1, 1)) bits |= SW;
  if (bits & N && bits & W && at(-1, -1)) bits |= NW;
  return bits;
}

/**
 * Picks the autotile piece for every set cell of `mask`: the cell index in the sheet (block `block`, 48 cells per
 * block, row-major 12 wide), or -1 where the mask is empty.
 */
export function paintAutotile(mask: Mask, layout: AutotileLayout, block = 0): number[][] {
  if (!Number.isInteger(block) || block < 0 || block >= autotile.blocksPerSheet) {
    throw new RangeError(`autotile block ${block} is not one of the sheet's ${autotile.blocksPerSheet} blocks`);
  }
  const table = autotile.layouts[layout].index;
  return mask.map((row, y) =>
    row.map((set, x) => (set ? block * autotile.blockCells + table[blobMask(mask, x, y)]! : -1)),
  );
}

const propertySchema = z.object({ name: z.string(), value: z.unknown() });
const tileLayerSchema = z.object({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  data: z.array(z.number().int().nonnegative()),
  properties: z.array(propertySchema).optional(),
});
const objectSchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  gid: z.number().int().positive().optional(),
  properties: z.array(propertySchema).optional(),
});
const objectLayerSchema = z.object({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(objectSchema),
});
const tiledMapSchema = z.object({
  orientation: z.literal('orthogonal'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(z.discriminatedUnion('type', [tileLayerSchema, objectLayerSchema])),
  tilesets: z.array(
    z.object({
      firstgid: z.number().int().positive(),
      name: z.string(),
      margin: z.number().int().nonnegative().optional(),
      spacing: z.number().int().nonnegative().optional(),
    }),
  ),
});
export type TiledMap = z.input<typeof tiledMapSchema>;

/** Tile layers in draw order; sprites sort between `walls` and `above` by `depthOf`. */
export const TILE_LAYERS = ['ground', 'ground-detail', 'walls', 'above'] as const;
export type TileLayerName = (typeof TILE_LAYERS)[number];

/** Sort key for a sprite whose top edge is at `top` and whose height is `h`: its bottom edge. */
export function depthOf(top: number, h: number): number {
  return top + h;
}

export interface MapObject {
  id: number;
  name?: string;
  /** Left and top edge in pixels (Tiled stores tile objects by their bottom edge; this is converted). */
  x: number;
  top: number;
  w: number;
  h: number;
  depth: number;
  gid?: number;
  /** The `asset` property: a manifest asset id. */
  asset?: string;
}

const FLIP_BITS = 0x1fffffff;

function property(properties: z.infer<typeof propertySchema>[] | undefined, name: string): unknown {
  return properties?.find((p) => p.name === name)?.value;
}

/**
 * A Tiled orthogonal map at the game's scale. A tile layer with the properties `autotile` (`gamemaker` or
 * `godot`), `autotileTileset` (a tileset name) and optional `autotileBlock` stores a mask: every non-zero cell is
 * terrain, and the edge pieces are painted from the layout's table.
 */
export class TopdownMap {
  readonly width: number;
  readonly height: number;
  readonly scale: Scale;
  readonly objects: readonly MapObject[];
  readonly #layers = new Map<TileLayerName, number[][]>();
  readonly #tilesets: z.infer<typeof tiledMapSchema>['tilesets'];

  constructor(json: unknown, scale: Scale) {
    const map = tiledMapSchema.parse(json);
    if (map.tilewidth !== scale || map.tileheight !== scale) {
      throw new Error(`map tiles are ${map.tilewidth}x${map.tileheight}; the game's scale is ${scale}`);
    }
    this.width = map.width;
    this.height = map.height;
    this.scale = scale;
    this.#tilesets = map.tilesets;
    const objects: MapObject[] = [];
    for (const layer of map.layers) {
      if (layer.type === 'objectgroup') {
        for (const o of layer.objects) {
          const top = o.gid === undefined ? o.y : o.y - o.height;
          const asset = property(o.properties, 'asset');
          objects.push({
            id: o.id,
            ...(o.name ? { name: o.name } : {}),
            x: o.x,
            top,
            w: o.width,
            h: o.height,
            depth: depthOf(top, o.height),
            ...(o.gid === undefined ? {} : { gid: o.gid & FLIP_BITS }),
            ...(typeof asset === 'string' ? { asset } : {}),
          });
        }
        continue;
      }
      if (!(TILE_LAYERS as readonly string[]).includes(layer.name)) {
        throw new Error(`tile layer "${layer.name}" is not one of ${TILE_LAYERS.join(', ')}`);
      }
      if (this.#layers.has(layer.name as TileLayerName)) throw new Error(`tile layer "${layer.name}" appears twice`);
      if (layer.width !== map.width || layer.height !== map.height || layer.data.length !== map.width * map.height) {
        throw new Error(`tile layer "${layer.name}" does not cover the ${map.width}x${map.height} map`);
      }
      const rows = Array.from({ length: map.height }, (_, y) =>
        layer.data.slice(y * map.width, (y + 1) * map.width).map((gid) => gid & FLIP_BITS),
      );
      this.#layers.set(layer.name as TileLayerName, this.#paint(layer, rows));
    }
    this.objects = objects;
  }

  #paint(layer: z.infer<typeof tileLayerSchema>, rows: number[][]): number[][] {
    const layout = property(layer.properties, 'autotile');
    if (layout === undefined) return rows;
    if (!AUTOTILE_LAYOUTS.includes(layout as AutotileLayout)) {
      throw new Error(`layer "${layer.name}" autotile must be one of ${AUTOTILE_LAYOUTS.join(', ')}`);
    }
    const name = property(layer.properties, 'autotileTileset');
    const tileset = this.#tilesets.find((t) => t.name === name);
    if (!tileset) throw new Error(`layer "${layer.name}" names no tileset of this map in autotileTileset`);
    const block = property(layer.properties, 'autotileBlock') ?? 0;
    if (typeof block !== 'number') throw new Error(`layer "${layer.name}" autotileBlock must be a number`);
    const painted = paintAutotile(
      rows.map((row) => row.map((gid) => gid !== 0)),
      layout as AutotileLayout,
      block,
    );
    return painted.map((row) => row.map((cell) => (cell < 0 ? 0 : tileset.firstgid + cell)));
  }

  /** Tiled gids of a tile layer after autotile painting, `[y][x]`, 0 for empty; undefined if the map lacks it. */
  tiles(layer: TileLayerName): readonly (readonly number[])[] | undefined {
    return this.#layers.get(layer);
  }

  /** `[y][x]` true where a `walls` tile is set or a solid object covers part of the cell. */
  collisionGrid(isSolid: (object: MapObject) => boolean = () => false): boolean[][] {
    const walls = this.#layers.get('walls');
    const grid = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => (walls?.[y]?.[x] ?? 0) !== 0),
    );
    for (const object of this.objects) {
      if (!isSolid(object) || object.w === 0 || object.h === 0) continue;
      const x0 = Math.max(0, Math.floor(object.x / this.scale));
      const y0 = Math.max(0, Math.floor(object.top / this.scale));
      const x1 = Math.min(this.width, Math.ceil((object.x + object.w) / this.scale));
      const y1 = Math.min(this.height, Math.ceil((object.top + object.h) / this.scale));
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y]![x] = true;
    }
    return grid;
  }

  /** Draw depth of a tile layer: ground layers under every sprite, `above` over every sprite on the map. */
  depthOfLayer(layer: TileLayerName): number {
    const below = { ground: -3, 'ground-detail': -2, walls: -1 } as const;
    return layer === 'above' ? this.height * this.scale + 1 : below[layer];
  }

  /** Builds Phaser tile layers; `textures` maps each tileset name to a loaded texture key. */
  render(scene: Phaser.Scene, textures: Readonly<Record<string, string>>): Phaser.Tilemaps.TilemapLayer[] {
    const tilemap = scene.make.tilemap({
      tileWidth: this.scale,
      tileHeight: this.scale,
      width: this.width,
      height: this.height,
    });
    const tilesets = this.#tilesets.map((t) => {
      const key = textures[t.name];
      if (!key) throw new Error(`no texture for tileset "${t.name}"`);
      const tileset = tilemap.addTilesetImage(
        t.name,
        key,
        this.scale,
        this.scale,
        t.margin ?? 0,
        t.spacing ?? 0,
        t.firstgid,
      );
      if (!tileset) throw new Error(`texture "${key}" for tileset "${t.name}" is not loaded`);
      return tileset;
    });
    const layers: Phaser.Tilemaps.TilemapLayer[] = [];
    for (const name of TILE_LAYERS) {
      const rows = this.#layers.get(name);
      if (!rows) continue;
      const layer = tilemap.createBlankLayer(name, tilesets);
      if (!layer) throw new Error(`could not create layer "${name}"`);
      layer.putTilesAt(
        rows.map((row) => row.map((gid) => (gid === 0 ? -1 : gid))),
        0,
        0,
      );
      layer.setDepth(this.depthOfLayer(name));
      layers.push(layer);
    }
    return layers;
  }
}

/** A collision predicate: objects whose `asset` card says `sprite.tile.walkable: false`. */
export function solidFromCards(loader: AssetLoader): (object: MapObject) => boolean {
  return (object) => object.asset !== undefined && loader.resolve(object.asset).meta?.sprite?.tile?.walkable === false;
}
