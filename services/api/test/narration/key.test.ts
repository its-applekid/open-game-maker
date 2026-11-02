import { describe, expect, it } from 'vitest';

import { narrationKey } from '../../src/narration/key.js';

describe('narration key', () => {
  it('is stable across object key order and changes with voice', () => {
    const first = {
      text: 'hello there',
      voice: 'default',
      engine: 'fake' as const,
      version: 1 as const,
      speed: 1,
      lang: 'en',
    };
    const reordered = {
      lang: 'en',
      speed: 1,
      version: 1 as const,
      engine: 'fake' as const,
      voice: 'default',
      text: 'hello there',
    };

    expect(narrationKey(first)).toBe(narrationKey(reordered));
    expect(narrationKey({ ...first, voice: 'storyteller' })).not.toBe(narrationKey(first));
    expect(narrationKey(first)).toMatch(/^[0-9a-f]{64}$/);
  });
});
