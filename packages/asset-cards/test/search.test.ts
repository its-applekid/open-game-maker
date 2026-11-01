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
    expect(ids({ words: [], kind: 'sprite' })).toEqual([]);
    expect(ids({ words: [], family: 'detailed-low-poly' })).toEqual([TORCH, 't1:synty-polygon-goblin-war-camp@v3']);
    expect(ids({ words: [], sameRigAs: ORC })).toEqual([ORC]);
    expect(ids({ words: [], rigId: 'rig:none' })).toEqual([]);
    expect(ids({ words: [], collection: 't1:kenney-mini-dungeon@2.0' })).toContain('t1:kenney-mini-dungeon/wall@2.0');
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
