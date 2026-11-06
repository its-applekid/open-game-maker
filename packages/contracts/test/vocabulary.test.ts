import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GAME_FIT, GENRES, INSTRUMENTS, MOODS } from '../src/vocabulary.js';

type Schema = {
  $defs: {
    vocab: Record<string, { enum?: string[] }>;
    describe: { properties: { game_fit: { propertyNames: { $ref: string } } } };
  };
};

const schema = JSON.parse(
  readFileSync(new URL('../schemas/asset-card.schema.json', import.meta.url), 'utf8'),
) as Schema;

const enumOf = (name: string): string[] => schema.$defs.vocab[name].enum ?? [];

/** The `$defs/vocab/...` a describe field points at, followed one hop: `#/$defs/vocab/mood` gives `mood`. */
const refName = (ref: string): string => ref.replace('#/$defs/vocab/', '');

describe('audio direction vocabulary', () => {
  it('offers exactly the moods, genres and instruments the card schema validates', () => {
    expect([...MOODS]).toEqual(enumOf('mood'));
    expect([...GENRES]).toEqual(enumOf('genre'));
    expect([...INSTRUMENTS]).toEqual(enumOf('instrument'));
  });

  it('offers exactly the game situations describe.game_fit validates', () => {
    expect([...GAME_FIT]).toEqual(enumOf(refName(schema.$defs.describe.properties.game_fit.propertyNames.$ref)));
  });
});
