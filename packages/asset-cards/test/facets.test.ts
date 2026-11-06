import { beforeAll, describe, expect, it } from 'vitest';

import { buildIndex, facets, type CardIndex } from '../src/index.js';
import { FIXTURE } from './helpers.js';

let index: CardIndex;

beforeAll(async () => {
  index = await buildIndex(FIXTURE);
});

describe('facets', () => {
  it('counts the in-game model cards and collections in the fixture library', () => {
    const counts = facets(index, { kind: 'model' });
    expect(counts.kind).toEqual({ 'model/character': 1, 'model/kit': 1, 'model/prop': 1, model: 2 });
    expect(counts.collection).toEqual({ 't1:kenney-mini-dungeon@2.0': 3, 't1:synty-polygon-goblin-war-camp@v3': 2 });
    expect(counts.style_family).toEqual({ 'chunky-low-poly': 3, 'detailed-low-poly': 2 });
    expect(counts.status).toEqual({ reviewed: 1, tagged: 2, draft: 2 });
  });

  it('counts the audio direction axes a style picker draws its tiles from', () => {
    const counts = facets(index, { kind: 'audio', includeDraft: true });
    expect(counts.moods).toEqual({ mysterious: 2, tense: 2 });
    expect(counts.genre).toEqual({ ambient: 1, chiptune: 1 });
    expect(counts.instruments).toEqual({ drums: 2, 'synth-lead': 2 });
    expect(counts.game_fit).toEqual({ dungeon: 1, menu: 1 });
  });

  it('counts proposed tags only with --proposed', () => {
    const torch = index.cards.find((card) => card.id.includes('torch'));
    if (!torch) throw new Error('fixture torch missing');
    const tagged = { ...index, cards: [{ ...torch, proposed_tags: [{ field: 'roles' as const, tag: 'brazier' }] }] };
    expect(facets(tagged, {}, { proposed: true })).toEqual({ 'proposed.roles': { brazier: 1 } });
    expect(facets(tagged, {}).roles).not.toHaveProperty('brazier');
  });
});
