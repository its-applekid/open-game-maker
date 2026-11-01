import { describe, expect, it } from 'vitest';

import { toUnits } from '../../src/budget/units.js';

describe('toUnits', () => {
  const settings = { unitLabel: 'energy', microUsdPerUnit: 100_000 };

  it('converts micro-dollars to the family unit with one decimal', () => {
    expect(toUnits(2_000_000, settings)).toEqual({ units: 20, label: 'energy' });
    expect(toUnits(166_667, settings)).toEqual({ units: 1.7, label: 'energy' });
    expect(toUnits(0, { unitLabel: 'stars', microUsdPerUnit: 250_000 })).toEqual({ units: 0, label: 'stars' });
  });
});
