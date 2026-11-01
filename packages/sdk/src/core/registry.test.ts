import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { defineFeature } from './registry.js';

describe('defineFeature', () => {
  it('keeps a feature schema, controls, save slice, and system together', () => {
    const system = () => undefined;
    const feature = defineFeature({
      id: 'counter',
      schema: z.object({ count: z.number() }),
      controls: [],
      save: {
        serialize: () => ({ count: 1 }),
        restore: () => undefined,
      },
      system,
    });

    expect(feature.id).toBe('counter');
    expect(feature.schema.parse({ count: 2 })).toEqual({ count: 2 });
    expect(feature.system).toBe(system);
  });

  it('rejects unstable feature ids', () => {
    expect(() => defineFeature({ id: 'Not stable', schema: z.object({}), controls: [] })).toThrow('feature id');
  });
});
