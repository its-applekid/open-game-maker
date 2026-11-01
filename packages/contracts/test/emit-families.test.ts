import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema, type z } from 'zod';

import { assetsSchemas } from '../src/assets.js';
import { bridgeSchemas } from '../src/bridge.js';
import { gameSchemas } from '../src/game.js';
import { inputSchemas } from '../src/input.js';

// CI runs `pnpm test`, not `check`, so this is the gate that catches a schema edited without `emit`.
const families: Record<string, z.ZodType> = { ...bridgeSchemas, ...gameSchemas, ...inputSchemas, ...assetsSchemas };

describe('engine contract schemas', () => {
  it.each(Object.entries(families))('schemas/%s.json matches its Zod source', (stem, schema) => {
    const committed = JSON.parse(readFileSync(new URL(`../schemas/${stem}.json`, import.meta.url), 'utf8')) as unknown;
    expect(committed).toEqual({
      ...toJSONSchema(schema, { target: 'draft-2020-12' }),
      $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
    });
  });
});
