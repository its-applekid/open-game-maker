import { describe, expect, it } from 'vitest';

import { RateTable } from '../src/rate.js';

describe('RateTable', () => {
  it('allows 30 in a second, drops the 31st, and refills a second later', () => {
    const rates = new RateTable();
    const allowed = Array.from({ length: 31 }, (_, i) => rates.allow('s1:snapshot', 30, 1000 + i));
    expect(allowed.filter(Boolean)).toHaveLength(30);
    expect(allowed[30]).toBe(false);
    expect(rates.allow('s1:snapshot', 30, 2030)).toBe(true);
  });

  it('keeps keys independent and prunes idle ones', () => {
    const rates = new RateTable();
    for (let i = 0; i < 15; i += 1) rates.allow('a', 15, 0);
    expect(rates.allow('a', 15, 0)).toBe(false);
    expect(rates.allow('b', 15, 0)).toBe(true);
    rates.prune(1);
    expect(rates.allow('a', 15, 0)).toBe(true);
  });
});
