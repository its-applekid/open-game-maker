import { describe, expect, it } from 'vitest';

import { parseQuery } from '../src/maps/specs.js';
import { gm } from './helpers.js';
import { EXAMPLE_SPEC, mapsLibrary } from './library-rights.js';

const EXAMPLE_MAP = 't1:profantasy-cartographers-annual/example-dungeon-01@illustrative';
const DRIFTED = 'inspiration/profantasy-cartographers-annual/layouts/drifted.layout.json';
const CC0_MAP = 't1:cc0-dungeon-maps/roads-of-the-old-crypt@v1';
const TILESET = 't1:kenney-mini-dungeon/tiles/dungeon-tilesheet@2.0';

async function index(root = mapsLibrary()) {
  return gm(['maps', 'index'], { env: { OGM_ASSETS_ROOT: root } });
}

async function search(argv: string[], root?: string) {
  const library = root ?? mapsLibrary();
  const built = await gm(['maps', 'index'], { env: { OGM_ASSETS_ROOT: library } });
  expect(built.code).toBe(0);
  return gm(['maps', 'search', ...argv], { env: { OGM_ASSETS_ROOT: library } });
}

const ids = (result: { out: string[] }) => result.out.map((line) => line.split('  ')[0]);

describe('parseQuery', () => {
  it('reads the C3 §10 example query', () => {
    expect(parseQuery(['small crypt 3-5 rooms one loop secret door'])).toEqual({
      sizeWord: 'small',
      types: ['crypt'],
      rooms: [3, 5],
      loops: { min: 1, exact: false },
      secrets: 1,
      words: [],
    });
  });

  it('lets flags override words and keeps unknown words for ranking', () => {
    expect(parseQuery(['two loops pillared'], { rooms: '4', loops: 1, size: 'small', type: 'cave' })).toEqual({
      rooms: [4, 4],
      loops: { min: 1, exact: true },
      size: 'small',
      types: ['cave'],
      words: ['pillared'],
    });
  });
});

describe('gm maps index', () => {
  it('writes one layout row per map and tileset resource an agent may build from, and hides the rest', async () => {
    const result = await index();
    expect(result.code).toBe(0);
    expect(result.out).toContainEqual(expect.stringContaining('2 maps, 1 tilesets (2 with a layout spec)'));
    expect(result.out).toContainEqual(expect.stringContaining('hidden: 1 resources'));
    expect(result.err).toContainEqual(expect.stringContaining(`invalid: ${DRIFTED}: tags.computed.loop_count is 4`));
  });

  it('carries the card layout columns and never a preview path or a description', async () => {
    const library = mapsLibrary();
    await gm(['maps', 'index'], { env: { OGM_ASSETS_ROOT: library } });
    const result = await gm(['maps', 'search', '--json', '--biome', 'crypt', '--limit', '100'], {
      env: { OGM_ASSETS_ROOT: library },
    });
    const rows = result.out.map((line) => JSON.parse(line) as Record<string, unknown>);
    const card = rows.find((row) => row.id === CC0_MAP);
    expect(card).toMatchObject({ resource: 'map', biome: 'crypt', scale: 'battlemap', levels: 2, grid: 'square' });
    expect(card?.cell_px).toBe(32);
    expect(card?.features).toEqual(['road', 'stairs', 'tomb', 'water']);
    expect(result.out.join('\n')).not.toContain('previews');
    expect(result.out.join('\n')).not.toContain('A crypt under a crossroads');
  });
});

describe('gm maps search', () => {
  it('answers the C3 §10 example: small crypt 3-5 rooms one loop secret door', async () => {
    const result = await search(['small crypt 3-5 rooms one loop secret door']);
    expect(result.code).toBe(0);
    expect(result.out).toEqual([
      `${CC0_MAP}  crypt  crypt  battlemap  square@32  4/1/1  small  loop  road,stairs,tomb,water`,
    ]);
    expect(result.err.join('\n')).not.toContain('vision-only-maps');
  });

  it('answers a biome and feature question across maps and tilesets', async () => {
    const tilesets = await search(['--feature', 'water', '--tilesets']);
    expect(ids(tilesets)).toEqual([TILESET]);
    expect(tilesets.out[0]).toContain('square@16');
    const crypt = await search(['--biome', 'crypt', '--feature', 'road']);
    expect(ids(crypt)).toEqual([CC0_MAP]);
  });

  it('filters by scale and grid, and prints a facet line so an agent narrows instead of paging', async () => {
    const result = await search(['--scale', 'battlemap', '--grid', 'square', '--limit', '100']);
    expect(ids(result)).toEqual([CC0_MAP, TILESET]);
    expect(result.err).toContainEqual(expect.stringMatching(/^\d+ of \d+ \(map \d+, tileset \d+\)/));
  });

  it('joins a layout spec onto its card, and excludes its 7 rooms from --rooms 3-5', async () => {
    expect(ids(await search(['--rooms', '3-5', '--limit', '100']))).toEqual([CC0_MAP]);
    const seven = await search(['--rooms', '6-15', '--limit', '100']);
    expect(ids(seven)).toEqual([EXAMPLE_MAP]);
    expect(seven.out[0]).toContain('dungeon  dungeon  -  square@50  7/1/1  medium  hub-and-spoke');
  });

  it('applies --loops exactly and --size as a hard filter', async () => {
    expect((await search(['--loops', '2'])).out).toEqual([]);
    expect(ids(await search(['--size', 'small']))).toEqual([CC0_MAP]);
  });

  it('prints no matches and exits 0 for a place nothing has', async () => {
    const result = await search(['--biome', 'space-station']);
    expect(result.code).toBe(0);
    expect(result.out).toEqual([]);
    expect(result.err).toContain('no matches');
  });

  it('refuses an unknown size, scale, grid and flow, and a malformed room range', async () => {
    expect((await search(['--size', 'enormous'])).code).toBe(2);
    expect((await search(['--scale', 'galactic'])).code).toBe(2);
    expect((await search(['--grid', 'triangular'])).code).toBe(2);
    expect((await search(['--flow', 'spiral'])).code).toBe(2);
    expect((await search(['--rooms', 'many'])).code).toBe(2);
  });

  it('asks for the index instead of scanning the library when none is built', async () => {
    const library = mapsLibrary();
    const result = await gm(['maps', 'search', 'crypt'], { env: { OGM_ASSETS_ROOT: library } });
    expect(result.code).toBe(1);
    expect(result.err).toContainEqual(expect.stringContaining('run `gm maps index`'));
  });
});
