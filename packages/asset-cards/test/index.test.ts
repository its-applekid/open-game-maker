import { existsSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INDEX_PATH, buildIndex, isStale, loadIndex, resolve, writeIndex } from '../src/index.js';
import { FIXTURE, libraryCopy } from './helpers.js';

const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';

describe('buildIndex', () => {
  it('indexes every valid card and lists the invalid ones without failing', async () => {
    const index = await buildIndex(FIXTURE);
    expect(index.cards).toHaveLength(19);
    expect(Object.keys(index.collections)).toHaveLength(6);
    expect(index.errors.map((error) => error.path).sort()).toEqual([
      'packs/kenney-mini-dungeon/cards/broken-no-source.card.json',
      'packs/kenney-mini-dungeon/cards/broken-status.card.json',
    ]);
  });

  it("gives an asset without rights its collection's rights, licence and family, marked by: collection", async () => {
    const index = await buildIndex(FIXTURE);
    const orc = index.cards.find((card) => card.id === ORC);
    expect(orc?.rights).toBeUndefined();
    expect(orc?.resolved.rights.uses).toEqual([
      'derive-layout',
      'in-game',
      'placeholder',
      'style-reference',
      'vision-input',
    ]);
    expect(orc?.resolved.license).toBe('CC0-1.0');
    expect(orc?.resolved.style_family).toBe('chunky-low-poly');
    expect(orc?.resolved.pov_fit).toEqual(['iso', 'topdown', 'follow', 'orbit']);
    expect(orc?.resolved.provenance).toMatchObject({
      rights: { by: 'collection' },
      license: { by: 'collection' },
      'describe.style_family': { by: 'collection' },
    });
    // the asset's own environments win over the collection's
    expect(orc?.resolved.environments).toEqual(['dungeon', 'cave', 'camp']);
    expect(orc?.resolved.provenance['describe.environments']).toBeUndefined();
  });

  it('inherits the collection compatibility set with provenance', () => {
    type Card = Parameters<typeof resolve>[0];
    const collection = JSON.parse(
      readFileSync(join(FIXTURE, 'packs/kenney-mini-dungeon/collection.card.json'), 'utf8'),
    ) as Card;
    const asset = JSON.parse(
      readFileSync(join(FIXTURE, 'packs/kenney-mini-dungeon/cards/character-orc.card.json'), 'utf8'),
    ) as Card;
    collection.describe = { ...collection.describe, set: 'kenney-mini-3d' };
    const resolved = resolve(asset, { [collection.id]: collection });
    expect(resolved.resolved.set).toBe('kenney-mini-3d');
    expect(resolved.resolved.provenance['describe.set']).toEqual({ by: 'collection' });
  });

  it('never widens: an asset basis granting in-game inside a vision-input-only collection stays vision-input', async () => {
    const index = await buildIndex(FIXTURE);
    const drums = index.cards.find((card) => card.id === 't1:sidetrax-pack-60-battle/war-drums@v1');
    expect(drums?.rights?.uses).toContain('in-game');
    expect(drums?.resolved.rights).toEqual({ uses: ['vision-input'], audience: 'private', redistribution: 'none' });
  });

  it('gives an asset with no collection card and no rights no uses at all', async () => {
    const index = await buildIndex(FIXTURE);
    const flame = index.cards.find((card) => card.id === 't1:kenney-particle-pack/flame-01@1.1');
    expect(flame?.resolved.rights.uses).toEqual([]);
  });
});

describe('loadIndex', () => {
  it('writes the index when missing, reuses it when fresh and rebuilds when a card is newer', async () => {
    const root = libraryCopy();
    expect(await isStale(root)).toBe(true);
    const first = await loadIndex(root);
    expect(existsSync(join(root, INDEX_PATH))).toBe(true);
    expect(await isStale(root)).toBe(false);

    // a fresh index is read back, not rebuilt
    const marked = { ...first, vocab: 'from-disk' };
    await writeIndex(root, marked);
    expect((await loadIndex(root)).vocab).toBe('from-disk');

    const future = new Date(Date.now() + 60_000);
    utimesSync(join(root, 'packs/kenney-mini-dungeon/cards/wall.card.json'), future, future);
    expect(await isStale(root)).toBe(true);
    expect((await loadIndex(root)).vocab).not.toBe('from-disk');
    expect(JSON.parse(readFileSync(join(root, INDEX_PATH), 'utf8')).vocab).not.toBe('from-disk');
  });
});
