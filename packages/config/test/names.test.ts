import { describe, expect, it } from 'vitest';

import { OGM_ENV_NAMES } from '../src/names.js';

describe('OGM_ENV_NAMES', () => {
  it('contains unique uppercase names with documentation', () => {
    const names = OGM_ENV_NAMES.map(({ name }) => name);

    expect(OGM_ENV_NAMES).toHaveLength(24);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(names.map((name) => name.toUpperCase()));
    expect(names.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name))).toBe(true);
    expect(OGM_ENV_NAMES.every(({ doc }) => doc.trim().length > 0)).toBe(true);
  });
});
