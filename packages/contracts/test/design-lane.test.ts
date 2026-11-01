import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema, type z } from 'zod';

import { BranchesFamilySchema, branchesSchemas } from '../src/branches.js';
import {
  DesignDocSchema,
  DesignLogFamilySchema,
  StrictDesignDocSchema,
  TransactionSchema,
  designLogSchemas,
} from '../src/design-log.js';
import { patchSchema } from '../src/bridge.js';
import { ReleasesFamilySchema, releasesSchemas } from '../src/releases.js';
import { SaveRevisionSchema, SavesFamilySchema, savesSchemas } from '../src/saves.js';
import { loadJson } from './helpers.js';

type Json = Record<string, unknown>;

const families = {
  'design-log.v1': [DesignLogFamilySchema, 'fixtures/design-log.v1.json'],
  'branches.v1': [BranchesFamilySchema, 'fixtures/branches.v1.json'],
  'releases.v1': [ReleasesFamilySchema, 'fixtures/releases.v1.json'],
  'saves.v1': [SavesFamilySchema, 'fixtures/saves.v1.json'],
} satisfies Record<string, readonly [z.ZodType, string]>;

const emittedFamilies = {
  ...designLogSchemas,
  ...branchesSchemas,
  ...releasesSchemas,
  ...savesSchemas,
};

describe('design-lane fixtures', () => {
  it.each(Object.entries(families))('%s validates its golden fixture', (_stem, [schema, fixture]) => {
    expect(schema.parse(loadJson(fixture))).toEqual(loadJson(fixture));
  });

  it.each(Object.entries(emittedFamilies))('%s emitted schema is current', (stem, schema) => {
    const emitted = JSON.parse(readFileSync(new URL(`../schemas/${stem}.json`, import.meta.url), 'utf8')) as Json;
    expect(emitted).toEqual({
      ...toJSONSchema(schema, { target: 'draft-2020-12' }),
      $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
    });
  });

  it('reuses the bridge-owned Immer patch schema', () => {
    expect(TransactionSchema.shape.patches.element).toBe(patchSchema);
  });

  it('provides a strict API variant without weakening the forward-compatible schema', () => {
    const doc = (loadJson<Json>('fixtures/design-log.v1.json').designDoc ?? {}) as Json;
    expect(DesignDocSchema.safeParse({ ...doc, future: true }).success).toBe(true);
    expect(StrictDesignDocSchema.safeParse({ ...doc, future: true }).success).toBe(false);
  });

  it('keeps save payloads as bytes in TypeScript', () => {
    const fixture = loadJson<{ saveRevision: Json }>('fixtures/saves.v1.json').saveRevision;
    expect(SaveRevisionSchema.parse({ ...fixture, payload: Uint8Array.from([1, 2, 3]) }).payload).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });
});

describe('design-lane negative fixtures', () => {
  it('rejects array-backed entities', () => {
    const result = DesignDocSchema.safeParse(loadJson('fixtures/design-lane-negative/array-entities.json'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['entities']);
  });

  it('requires a transaction base revision', () => {
    const result = TransactionSchema.safeParse(loadJson('fixtures/design-lane-negative/missing-base-rev.json'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['baseRev']);
  });

  it('rejects an unowned transaction kind', () => {
    const result = TransactionSchema.safeParse(loadJson('fixtures/design-lane-negative/voice-kind.json'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['kind']);
  });

  it('rejects save slot 4', () => {
    const result = SavesFamilySchema.safeParse(loadJson('fixtures/design-lane-negative/slot-4.json'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['saveSlot', 'slotId']);
  });
});
