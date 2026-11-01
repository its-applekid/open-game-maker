import { describe, expect, it } from 'vitest';

import { formatUnits, formatUsage } from './units';

describe('formatUnits', () => {
  it('uses the family unit with friendly precision', () => {
    expect(formatUnits(1_500_000, 'coin')).toBe('1.5 coins');
    expect(formatUnits(1_000_000, 'coin')).toBe('1 coin');
    expect(formatUnits(2_345, 'coin')).toBe('0.0023 coins');
  });

  it('rounds micro-dollar values without adding qualifier copy', () => {
    expect(formatUnits(123, 'dollar')).toBe('0.0001 dollars');
    expect(formatUnits(1, 'dollar')).toBe('0 dollars');
  });

  it('places the family unit once after the reservation total', () => {
    expect(formatUsage(1_500_000, 4_000_000, 'coins')).toBe('1.5 of 4 coins');
  });
});
