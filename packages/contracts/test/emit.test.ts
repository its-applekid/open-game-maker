import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';

import { HealthResponse } from '../src/health.js';
import { loadJson } from './helpers.js';

describe('emitted schemas', () => {
  it('are current and accept their matching fixtures', () => {
    const emitted = JSON.parse(readFileSync(new URL('../schemas/health.v1.json', import.meta.url), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(emitted).toEqual({
      ...toJSONSchema(HealthResponse, { target: 'draft-2020-12' }),
      $id: 'https://open-game-maker-2000.local/schemas/health.v1.json',
    });
    expect(HealthResponse.parse(loadJson('fixtures/health.v1.json'))).toBeTruthy();
  });
});
