import { describe, expect, it } from 'vitest';

import { loadApiEnv } from '../src/app/env.js';
import { makeApiEnv } from './env-fixture.js';

describe('makeApiEnv', () => {
  it('derives a complete valid environment from apiEnvSpec', () => {
    expect(() => loadApiEnv(makeApiEnv())).not.toThrow();
  });
});
