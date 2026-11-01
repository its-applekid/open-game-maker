import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '@ogm/config';
import { beforeAll, describe, expect, it } from 'vitest';

import { recompute } from '../src/families-coverage.js';
import {
  StyleFamiliesSchema,
  StyleFamilySchema,
  buildIndex,
  computeCoverage,
  familyFor,
  isCreationChoice,
  loadFamilies,
  type CardIndex,
  type StyleFamily,
} from '../src/index.js';
import { FIXTURE } from './helpers.js';

const CATALOG_IDS = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/catalog-ids.json', import.meta.url)), 'utf8'),
) as string[];
const SEEDS = fileURLToPath(new URL('../../../scripts/assets/data/collection_tags.jsonl', import.meta.url));
const ASSETS_ROOT = loadEnv('gm', { OGM_ASSETS_ROOT: { kind: 'path', required: false } }).OGM_ASSETS_ROOT;
const HOST_CATALOG = ASSETS_ROOT ? join(ASSETS_ROOT, 'catalog.json') : undefined;

const packsOf = (f: StyleFamily) => [...f.packs.primary, ...f.packs.extras];
const family = (overrides: Partial<StyleFamily>): StyleFamily => ({ ...loadFamilies()[0], ...overrides });

let index: CardIndex;
beforeAll(async () => {
  index = await buildIndex(FIXTURE);
});

describe('style-families.json', () => {
  it('holds exactly the seven C2 families, Synty ones not offered at creation', () => {
    expect(loadFamilies().map((f) => f.id)).toEqual([
      'chunky-low-poly',
      'detailed-low-poly',
      'simple-low-poly',
      'pixel-art',
      'flat-cartoon',
      'isometric-2d',
      'sketch',
    ]);
    expect(isCreationChoice('detailed-low-poly')).toBe(false);
    expect(isCreationChoice('simple-low-poly')).toBe(false);
    expect(isCreationChoice('chunky-low-poly')).toBe(true);
    expect(isCreationChoice('any')).toBe(false);
  });

  it('names only packs the catalog holds (checked-in id list)', () => {
    const known = new Set(CATALOG_IDS);
    expect(
      loadFamilies()
        .flatMap(packsOf)
        .filter((id) => !known.has(id)),
    ).toEqual([]);
  });

  it.skipIf(!HOST_CATALOG || !existsSync(HOST_CATALOG))('names only packs this host catalog holds', () => {
    const catalog = JSON.parse(readFileSync(HOST_CATALOG as string, 'utf8')) as { packs: { id: string }[] };
    const known = new Set(catalog.packs.map((pack) => pack.id));
    expect(
      loadFamilies()
        .flatMap(packsOf)
        .filter((id) => !known.has(id)),
    ).toEqual([]);
  });

  it('maps a pack to its family', () => {
    expect(familyFor('kenney-tiny-dungeon')).toBe('pixel-art');
    expect(familyFor('kenney-mini-dungeon')).toBe('chunky-low-poly');
    expect(familyFor('kenney-music-loops')).toBeUndefined();
  });

  // The seeds (filename words, no images) call Kenney's 3D kits simple-low-poly; C2 §2 and this file call them
  // chunky-low-poly and keep simple-low-poly for Synty SIMPLE. Any other seed/file split is a curation error.
  it('agrees with the collection_tags.jsonl seeds except the known Kenney 3D split', () => {
    const seeds = readFileSync(SEEDS, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { id: string; sf: string });
    const unexpected = seeds
      .map(({ id, sf }) => ({ id, seed: sf, file: familyFor(id) }))
      .filter(({ seed, file }) => file && file !== seed)
      .filter(
        ({ id, seed, file }) => !(id.startsWith('kenney-') && seed === 'simple-low-poly' && file === 'chunky-low-poly'),
      );
    expect(unexpected).toEqual([]);
  });
});

describe('StyleFamilySchema', () => {
  it('refuses a creation choice without props, and accepts it once offered no longer', () => {
    const coverage = { characters: true, environment: true, props: false, ui: true, sfx: true, music: true };
    expect(StyleFamilySchema.safeParse(family({ coverage, creation_choice: true })).success).toBe(false);
    expect(StyleFamilySchema.safeParse(family({ coverage, creation_choice: false })).success).toBe(true);
  });

  it('refuses a pack listed in two families and a missing family', () => {
    const families = loadFamilies();
    const twice = families.map((f, i) =>
      i === 1 ? { ...f, packs: { ...f.packs, extras: [...f.packs.extras, 'kenney-mini-dungeon'] } } : f,
    );
    expect(StyleFamiliesSchema.safeParse(twice).success).toBe(false);
    expect(StyleFamiliesSchema.safeParse(families.slice(1)).success).toBe(false);
  });
});

describe('computeCoverage', () => {
  const miniDungeon = family({ packs: { primary: ['kenney-mini-dungeon'], extras: [] } });
  const assetsOnly = () => ({ ...index, cards: index.cards.filter((card) => card.card_type === 'asset') });

  it('measures what the pack cards hold; any-family in-game music supplies music', () => {
    expect(computeCoverage(assetsOnly(), miniDungeon)).toEqual({
      characters: true,
      environment: true,
      props: false,
      ui: false,
      // every fixture SFX card lacks in-game rights (vision-input only, quarantined, or no collection)
      sfx: false,
      music: true,
    });
  });

  it('marks characters false when the only character card is removed', () => {
    const cards = assetsOnly().cards.filter((card) => card.id !== 't1:kenney-mini-dungeon/character-orc@2.0');
    expect(computeCoverage({ ...index, cards }, miniDungeon).characters).toBe(false);
  });

  it('reads a collection card counts and curated family_coverage', () => {
    expect(computeCoverage(index, miniDungeon).props).toBe(true);
    const collections = index.cards.filter((card) => card.card_type === 'collection');
    const torchPack = family({ packs: { primary: ['synty-polygon-goblin-war-camp'], extras: [] } });
    expect(computeCoverage({ ...index, cards: collections }, torchPack).props).toBe(false);
    expect(computeCoverage(index, torchPack).props).toBe(true);
  });

  it('counts any-family cards only for sfx/music, and only cards with in-game rights', () => {
    const inGame = (card: CardIndex['cards'][number]) => ({
      ...card,
      resolved: { ...card.resolved, rights: { ...card.resolved.rights, uses: ['in-game' as const] } },
    });
    const tiny = family({ packs: { primary: ['kenney-tiny-dungeon'], extras: [] } });
    expect(computeCoverage(index, tiny).characters).toBe(false);
    const granted = { ...index, cards: index.cards.map(inGame) };
    expect(computeCoverage(granted, tiny)).toEqual({
      characters: true,
      environment: false,
      props: false,
      ui: false,
      sfx: true,
      music: true,
    });
  });
});

describe('families:coverage recompute', () => {
  it('fails a creation choice whose packs lost props', () => {
    const offered = family({
      id: 'pixel-art',
      packs: { primary: ['kenney-tiny-dungeon'], extras: [] },
      creation_choice: true,
    });
    const families = loadFamilies().map((f) => (f.id === 'pixel-art' ? offered : f));
    const { families: next, failures } = recompute(index, families);
    expect(next.find((f) => f.id === 'pixel-art')?.coverage.props).toBe(false);
    expect(failures.some((line) => line.startsWith('pixel-art: creation_choice'))).toBe(true);
  });
});
