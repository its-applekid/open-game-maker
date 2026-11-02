import { readdirSync, readFileSync } from 'node:fs';

import { StrictDesignDocSchema } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN } from '../src/game.js';

/* Every new game starts from this template, so the API (which parses designs with the contracts schema) must accept it. */
const designDir = new URL('../design/', import.meta.url);
const designFiles = readdirSync(designDir).filter((name) => name.endsWith('.json'));

describe('template design files match the contracts design schema', () => {
  it('has at least one design file', () => {
    expect(designFiles.length).toBeGreaterThan(0);
  });

  it.each(designFiles)('%s parses with StrictDesignDocSchema', (name) => {
    const doc: unknown = JSON.parse(readFileSync(new URL(name, designDir), 'utf8'));
    expect(StrictDesignDocSchema.safeParse(doc).error?.issues).toBeUndefined();
  });

  it('the in-code default design matches design/level.json', () => {
    const level: unknown = JSON.parse(readFileSync(new URL('level.json', designDir), 'utf8'));
    expect(DEFAULT_DESIGN).toEqual(level);
  });
});
