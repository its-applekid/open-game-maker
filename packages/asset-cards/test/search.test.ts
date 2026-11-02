import { beforeAll, describe, expect, it } from 'vitest';

import { buildIndex, formatRow, info, search, statusAllowed, type CardIndex } from '../src/index.js';
import { FIXTURE } from './helpers.js';

const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';
const TORCH = 't1:synty-polygon-goblin-war-camp/buildings/sm-bld-prop-torch-01@v3';
const LOOP = 't1:kenney-music-loops/loops/infinite-descent@1.1';
const DRAFT_LOOP = 't1:kenney-music-loops/loops/night-patrol@1.1';
const MAP = 't1:profantasy-cartographers-annual/example-dungeon-01@illustrative';
const MUSIC = 't1:kenney-music-loops@1.1';
const QUARANTINED = 't1:drive-2026-10-26-dungeon-sfx/door-creak@1';

let index: CardIndex;
const ids = (q: Parameters<typeof search>[1]) => search(index, q).map((card) => card.id);

beforeAll(async () => {
  index = await buildIndex(FIXTURE);
});

describe('search', () => {
  it('ranks the Mini Dungeon orc first for "orc" and prints the contract row', () => {
    const hits = search(index, { words: ['orc'] });
    expect(hits[0].id).toBe(ORC);
    expect(formatRow(hits[0])).toBe(`${ORC}  model/character  reviewed  chunky-low-poly  Orc`);
  });

  it('defaults to in-game use: assets whose resolved rights lack it never show', () => {
    expect(ids({ words: [] })).not.toContain('t1:kenney-particle-pack/flame-01@1.1');
    expect(ids({ words: [], use: 'vision-input' })).toContain('t1:sidetrax-pack-60-battle/war-drums@v1');
    expect(ids({ words: [] })).not.toContain('t1:sidetrax-pack-60-battle/war-drums@v1');
  });

  it('keeps inspiration maps out of in-game searches and finds them for derive-layout', () => {
    expect(ids({ words: ['dungeon'] })).not.toContain(MAP);
    expect(ids({ words: ['dungeon'], use: 'derive-layout' })).toContain(MAP);
  });

  it('keeps inspiration out of in-game searches even when its card wrongly claims in-game', () => {
    const map = index.cards.find((card) => card.id === MAP);
    if (!map) throw new Error('fixture map missing');
    const wrong = {
      ...map,
      resolved: { ...map.resolved, rights: { ...map.resolved.rights, uses: ['in-game' as const] } },
    };
    expect(search({ ...index, cards: [wrong] }, { words: [] })).toEqual([]);
  });

  it('includes model drafts by default but audio drafts only with --include-draft', () => {
    expect(ids({ words: ['torch'] })).toEqual([TORCH]);
    expect(ids({ words: [], kind: 'audio' })).toEqual([LOOP, MUSIC]);
    expect(ids({ words: [], kind: 'audio', includeDraft: true })).toEqual([LOOP, DRAFT_LOOP, MUSIC]);
  });

  it('hides every card in a quarantined collection, even with --include-draft and a matching use', () => {
    expect(ids({ words: ['door'], use: 'vision-input', includeDraft: true })).not.toContain(QUARANTINED);
    expect(ids({ words: [], use: 'vision-input', includeDraft: true })).not.toContain(
      't1:drive-2026-10-26-dungeon-sfx@1',
    );
  });

  it('filters by kind/subkind, family, rig and collection; collections match on their counted kinds', () => {
    expect(ids({ words: [], kind: 'model', subkind: 'kit' })).toEqual([
      't1:kenney-mini-dungeon/wall@2.0',
      't1:kenney-mini-dungeon@2.0',
      't1:synty-polygon-goblin-war-camp@v3',
    ]);
    expect(ids({ words: [], kind: 'sprite' })).toEqual(['t1:kenney-tiny-dungeon/tiles/tile-0097@1.0']);
    expect(ids({ words: [], family: 'detailed-low-poly' })).toEqual([TORCH, 't1:synty-polygon-goblin-war-camp@v3']);
    expect(ids({ words: [], sameRigAs: ORC })).toEqual([ORC]);
    expect(ids({ words: [], rigId: 'rig:none' })).toEqual([]);
    expect(ids({ words: [], collection: 't1:kenney-mini-dungeon@2.0' })).toContain('t1:kenney-mini-dungeon/wall@2.0');
  });

  it("keeps a game's search to its family and style-neutral cards; --family stays an exact match", () => {
    const all = ids({ words: [], use: 'vision-input', includeDraft: true });
    const pixel = ids({ words: [], use: 'vision-input', includeDraft: true, gameFamily: 'pixel-art' });
    expect(all).toContain(ORC);
    expect(pixel).not.toContain(ORC);
    expect(pixel).not.toContain(TORCH);
    expect(pixel).toContain('t1:sidetrax-pack-60-battle/war-drums@v1');
    expect(ids({ words: ['orc'], gameFamily: 'chunky-low-poly' })).toEqual([ORC, 't1:kenney-mini-dungeon@2.0']);
    expect(ids({ words: [], use: 'vision-input', family: 'any' })).not.toContain(ORC);
  });

  it('treats a locked compatibility set as one pack without widening through loose matches', () => {
    const tile = 't1:kenney-tiny-dungeon/tiles/tile-0097@1.0';
    expect(ids({ words: ['knight'], gameFamily: 'pixel-art', gameSets: ['kenney-tiny'] })).toContain(tile);
    expect(ids({ words: ['knight'], gameFamily: 'pixel-art', gameSets: ['kenney-pixel-platformer'] })).not.toContain(
      tile,
    );
    expect(
      ids({
        words: ['knight'],
        gameFamily: 'pixel-art',
        gameSets: ['kenney-pixel-platformer'],
        gamePacks: ['kenney-tiny-dungeon'],
      }),
    ).toContain(tile);
    expect(
      ids({ words: ['drums'], use: 'vision-input', gameFamily: 'pixel-art', gameSets: ['kenney-tiny'] }),
    ).toContain('t1:sidetrax-pack-60-battle/war-drums@v1');
  });

  it('uses the curated set mapping when a stored resolved set is stale', () => {
    const tileId = 't1:kenney-tiny-dungeon/tiles/tile-0097@1.0';
    const tile = index.cards.find((card) => card.id === tileId);
    if (!tile) throw new Error('fixture tile missing');
    const stale = { ...tile, resolved: { ...tile.resolved, set: 'kenney-pixel-platformer' } };
    const hits = search(
      { ...index, cards: [stale] },
      { words: [], gameFamily: 'pixel-art', gameSets: ['kenney-tiny'] },
    );
    expect(hits.map((card) => card.id)).toContain(tileId);
  });

  it('indexes sprite action names instead of requiring action words in file paths', () => {
    const base = index.cards.find((card) => card.id === 't1:kenney-tiny-dungeon/tiles/tile-0097@1.0');
    if (!base) throw new Error('fixture sprite missing');
    const knight = {
      ...base,
      id: 't1:kenney-tiny-dungeon/characters/knight@1.0',
      title: 'Knight',
      source: { ...base.source!, files: [{ ...base.source!.files[0]!, path: 'Sprites/knight.png' }] },
      sprite: { ...base.sprite!, animations: [{ name: 'attack', frames: [0, 1] }] },
    };
    expect(search({ ...index, cards: [knight] }, { words: ['knight', 'attack'] }).map((card) => card.id)).toEqual([
      knight.id,
    ]);
  });

  it('applies --limit after ranking', () => {
    expect(search(index, { words: [], limit: 2 })).toHaveLength(2);
    expect(search(index, { words: [] }).length).toBeGreaterThan(2);
  });
});

describe('statusAllowed', () => {
  it('encodes the per-kind defaults', () => {
    expect(statusAllowed('model', 'draft')).toBe(true);
    expect(statusAllowed('sprite', 'draft')).toBe(true);
    expect(statusAllowed('audio', 'measured')).toBe(false);
    expect(statusAllowed('inspiration', 'draft')).toBe(false);
    expect(statusAllowed('texture', 'measured')).toBe(true);
    expect(statusAllowed('texture', 'draft')).toBe(false);
    expect(statusAllowed('model', 'quarantined', true)).toBe(false);
  });
});

describe('info', () => {
  it('returns cards in order and marks unknown ids missing', () => {
    expect(info(index, [ORC, 'nope']).map((card) => ('missing' in card ? 'missing' : card.id))).toEqual([
      ORC,
      'missing',
    ]);
  });
});
