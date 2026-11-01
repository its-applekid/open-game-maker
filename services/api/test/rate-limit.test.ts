import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '../src/auth/rate-limit.js';

describe('createRateLimiter', () => {
  it('resets a key after its fixed window', () => {
    const allow = createRateLimiter(2, 1_000, 2);

    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 1)).toBe(true);
    expect(allow('a', 2)).toBe(false);
    expect(allow('a', 1_000)).toBe(true);
  });

  it('fails closed for fresh keys at capacity and reclaims expired keys', () => {
    const allow = createRateLimiter(10, 1_000, 2);

    expect(allow('a', 0)).toBe(true);
    expect(allow('b', 0)).toBe(true);
    expect(allow('x'.repeat(321), 0)).toBe(false);
    expect(allow('c', 1)).toBe(false);
    expect(allow('c', 1_000)).toBe(true);
    expect(allow('a', 1_000)).toBe(true);
    expect(allow('b', 1_000)).toBe(false);
  });
});
