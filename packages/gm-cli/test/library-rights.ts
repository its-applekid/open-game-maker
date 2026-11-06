import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { library } from './helpers.js';

export const ANNUAL = 'inspiration/profantasy-cartographers-annual';
export const SOURCE_CARD = 't1:profantasy-cartographers-annual/example-dungeon-01@illustrative';
export const EXAMPLE_SPEC = 'layout:profantasy-cartographers-annual/example-dungeon-01@illustrative#1';
/** A redistribution:none pack laid out as packs/<id>/<version>/{originals,extracted}. */
export const SIDETRAX = 'packs/sidetrax-pack-60-battle/v1';
export const MANIFEST = 'private/hash-manifests/profantasy-cartographers-annual-illustrative.txt';
export const MANIFEST_LINES = [
  `${'a'.repeat(64)}  12  install/symbols/door.png`,
  `${'b'.repeat(64)}  34  install/fills/stone.png`,
];

const EXAMPLE = fileURLToPath(
  new URL('../../contracts/fixtures/cards/layout-profantasy-example-dungeon.json', import.meta.url),
);

export function put(root: string, rel: string, data: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), data);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * The asset-cards fixture library plus bytes on disk: the ProFantasy collection (redistribution none) gets a map,
 * its card's private preview, a derived variant and a hash manifest; the Sidetrax pack (none) gets an original and an
 * extracted file; the Kenney mini dungeon (CC0, free) gets an
 * extracted file and a public preview, neither of which may ever reach the feed.
 */
export function rightsLibrary(): string {
  const root = library();
  put(root, `${ANNUAL}/maps/example-dungeon-01.png`, 'private map bytes');
  put(root, 'private/previews/00/0000000000000000-thumb.webp', 'private thumb bytes');
  put(root, 'derived/profantasy-cartographers-annual/variant.png', 'derived variant bytes');
  put(root, MANIFEST, `${MANIFEST_LINES.join('\n')}\n`);
  put(root, `${SIDETRAX}/originals/sidetrax-60.zip`, 'sidetrax zip bytes');
  put(root, `${SIDETRAX}/extracted/war-drums.wav`, 'sidetrax wav bytes');
  put(root, 'packs/kenney-mini-dungeon/2.0/extracted/wall.glb', 'cc0 wall bytes');
  put(root, 'packs/kenney-mini-dungeon/2.0/originals/kenney_mini-dungeon.zip', 'cc0 zip bytes');
  put(root, 'previews/e0/e0b021c98b34a633-thumb.webp', 'cc0 orc thumb bytes');
  return root;
}

type Json = Record<string, unknown> & { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A copy of the ProFantasy collection and its map card whose rights grant only vision-input. */
function addVisionOnlyCollection(root: string): string {
  const collection = readJson<Json>(join(root, ANNUAL, 'collection.card.json'));
  collection.id = 't1:vision-only-maps@illustrative';
  collection.rights.uses = ['vision-input'];
  for (const basis of collection.rights.basis) basis.uses = basis.uses.filter((use: string) => use !== 'derive-layout');
  put(root, 'inspiration/vision-only-maps/collection.card.json', JSON.stringify(collection));

  const card = readJson<Json>(join(root, ANNUAL, 'cards/example-dungeon-01.card.json'));
  card.id = 't1:vision-only-maps/example-dungeon-01@illustrative';
  card.collection = collection.id;
  card.map.layout_spec.id = 'layout:vision-only-maps/example-dungeon-01@illustrative#1';
  put(root, 'inspiration/vision-only-maps/cards/example-dungeon-01.card.json', JSON.stringify(card));
  return card.id as string;
}

/** A four-room crypt ring: one entrance, one loop closed by a secret door, small. */
function smallCrypt(example: Json, cardId: string): Json {
  const spec = structuredClone(example);
  const square = (x: number, y: number) => [
    [x, y],
    [x + 4, y],
    [x + 4, y + 4],
    [x, y + 4],
  ];
  spec.id = 'layout:cc0-dungeon-maps/small-crypt@v1#1';
  spec.source = { card_id: cardId, content_hash: example.source.content_hash, required_use: 'derive-layout' };
  spec.rooms = ['r1', 'r2', 'r3', 'r4'].map((id, i) => ({
    id,
    polygon: square((i % 2) * 6, Math.floor(i / 2) * 6),
    shape: 'chamber',
    size_class: 'small',
    area_cells: 16,
    confidence: 0.9,
  }));
  spec.connections = [
    { id: 'd0', type: 'door', from: 'outside', to: 'r1', confidence: 0.9 },
    { id: 'o1', type: 'opening', from: 'r1', to: 'r2', confidence: 0.9 },
    { id: 'o2', type: 'opening', from: 'r2', to: 'r4', confidence: 0.9 },
    { id: 'o3', type: 'opening', from: 'r4', to: 'r3', confidence: 0.9 },
    { id: 's1', type: 'secret-door', from: 'r3', to: 'r1', confidence: 0.6 },
  ];
  spec.features = [
    { id: 'f1', type: 'sarcophagus', room: 'r2', at: [7, 1], confidence: 0.8 },
    { id: 'f2', type: 'water', room: 'r4', polygon: square(7, 7), confidence: 0.7 },
  ];
  spec.tags = {
    computed: {
      room_count: 4,
      connection_count: 5,
      loop_count: 1,
      entrance_count: 1,
      dead_end_count: 0,
      secret_count: 1,
      total_area_cells: 64,
      size_class: 'small',
    },
    judged: { map_type: 'crypt', themes: ['crypt'], flow: 'loop', confidence: 0.6 },
  };
  spec.notes = 'Four chambers in a ring; a secret door closes the loop.';
  return spec;
}

/** A CC0 dungeon map card, so the card-only layout columns have a source that is not a layout spec. */
function mapCard(collection: string): Json {
  return {
    schema: 'ogm.asset-card/1.1',
    vocab: '2026-10-26',
    id: 't1:cc0-dungeon-maps/roads-of-the-old-crypt@v1',
    card_type: 'asset',
    status: 'tagged',
    title: 'Roads of the old crypt',
    kind: 'inspiration',
    subkind: 'map',
    collection,
    source: {
      files: [
        {
          path: 'maps/roads-of-the-old-crypt.png',
          sha256: `sha256:${'1'.repeat(64)}`,
          bytes: 0,
          format: 'png',
          role: 'primary',
        },
      ],
      content_hash: `sha256:${'1'.repeat(64)}`,
    },
    previews: { thumb: 'private/previews/11/1111111111111111-thumb.webp' },
    describe: {
      description: 'A crypt under a crossroads: two burial halls, a flooded side chamber and the road above.',
      objects: ['water', 'road', 'tomb', 'stairs'],
      environments: ['crypt', 'road'],
      settings: ['fantasy'],
      roles: ['layout-reference'],
    },
    image: { width_px: 1280, height_px: 960, has_alpha: false, indexed_colors: null, pixel_art: false },
    map: {
      map_type: 'crypt',
      is_map: true,
      usable: 'yes',
      view: 'topdown',
      scale: 'battlemap',
      publication: 'CC0 sample maps',
      levels_shown: 2,
      site: 'roads-of-the-old-crypt',
      grid_detected: { cell_px: 32, cols: 40, rows: 30, confidence: 0.9 },
      layout_spec: { id: 'layout:cc0-dungeon-maps/small-crypt@v1#1', status: 'extracted', confidence: 0.7 },
      layout: {
        biome: 'crypt',
        levels: 2,
        features: ['water', 'road', 'tomb', 'stairs'],
        grid: { type: 'square', cols: 40, rows: 30, cell_px: 32 },
      },
    },
    provenance: { '*': { by: 'code', tool: 'gm-measure@0.1', at: '2026-11-05T10:00:00-08:00' } },
  };
}

/** A 16 px dungeon tilesheet: the tileset half of the map-inspiration index. */
function tileCard(): Json {
  return {
    schema: 'ogm.asset-card/1.1',
    vocab: '2026-10-26',
    id: 't1:kenney-mini-dungeon/tiles/dungeon-tilesheet@2.0',
    card_type: 'asset',
    status: 'tagged',
    title: 'Dungeon tilesheet (16 px)',
    kind: 'sprite',
    subkind: 'tile',
    collection: 't1:kenney-mini-dungeon@2.0',
    source: {
      files: [
        {
          path: 'Tiles/dungeon-tilesheet.png',
          sha256: `sha256:${'2'.repeat(64)}`,
          bytes: 0,
          format: 'png',
          role: 'primary',
        },
      ],
      content_hash: `sha256:${'2'.repeat(64)}`,
    },
    previews: { thumb: 'previews/22/2222222222222222-thumb.webp' },
    describe: {
      description: 'A 16 px dungeon tilesheet with stone walls, floors, water and stairs.',
      objects: ['wall', 'floor', 'water', 'stairs', 'door'],
      environments: ['dungeon', 'crypt'],
      settings: ['fantasy'],
      roles: ['floor', 'wall'],
      set: 'kenney-mini-dungeon',
    },
    image: { width_px: 256, height_px: 256, has_alpha: true, indexed_colors: null, pixel_art: true },
    sprite: {
      drawn_view: 'topdown',
      tile_px: 16,
      sheet: { frame_w: 16, frame_h: 16, cols: 16, rows: 16 },
      tile: { layer: 'ground', autotile: 'none', walkable: true },
    },
    provenance: { '*': { by: 'code', tool: 'gm-measure@0.1', at: '2026-11-05T10:00:00-08:00' } },
  };
}

/**
 * Layout specs under `inspiration/<id>/layouts/`: the C3 example (7 rooms, medium, crypt theme, one loop, one secret)
 * whose source grants derive-layout, the same spec on a vision-only source, a small 4-room crypt, and a spec whose
 * computed loop count disagrees with its graph. Plus a CC0 map card carrying its layout columns without a spec, and a
 * 16 px tileset.
 */
export function mapsLibrary(): string {
  const root = rightsLibrary();
  const example = readJson<Json>(EXAMPLE);
  put(root, `${ANNUAL}/layouts/example-dungeon-01.layout.json`, JSON.stringify(example));

  const hiddenCard = addVisionOnlyCollection(root);
  const hidden = structuredClone(example);
  hidden.id = 'layout:vision-only-maps/example-dungeon-01@illustrative#1';
  hidden.source.card_id = hiddenCard;
  put(root, 'inspiration/vision-only-maps/layouts/example-dungeon-01.layout.json', JSON.stringify(hidden));

  const drifted = structuredClone(example);
  drifted.id = 'layout:profantasy-cartographers-annual/example-dungeon-01@illustrative#3';
  drifted.tags.computed.loop_count = 4;
  put(root, `${ANNUAL}/layouts/drifted.layout.json`, JSON.stringify(drifted));

  const cc0 = readJson<Json>(join(root, 'packs/kenney-mini-dungeon/collection.card.json'));
  cc0.id = 't1:cc0-dungeon-maps@v1';
  put(root, 'inspiration/cc0-dungeon-maps/collection.card.json', JSON.stringify(cc0));
  put(root, 'inspiration/cc0-dungeon-maps/cards/roads-of-the-old-crypt.card.json', JSON.stringify(mapCard(cc0.id)));
  put(
    root,
    'inspiration/cc0-dungeon-maps/layouts/small-crypt.layout.json',
    JSON.stringify(smallCrypt(example, 't1:cc0-dungeon-maps/roads-of-the-old-crypt@v1')),
  );
  put(root, 'packs/kenney-mini-dungeon/cards/tiles/dungeon-tilesheet.card.json', JSON.stringify(tileCard()));
  return root;
}
