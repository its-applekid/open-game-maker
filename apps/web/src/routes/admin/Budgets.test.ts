import { describe, expect, it } from 'vitest';

import { formatEditableUnits, parseUnits } from './Budgets';

describe('admin budget unit conversion', () => {
  it('converts friendly units to micro-dollars without drift', () => {
    expect(parseUnits('2.5', 1_000_000)).toBe(2_500_000);
    expect(parseUnits(formatEditableUnits(2_500_000, 1_000_000), 1_000_000)).toBe(2_500_000);
  });

  it('rejects negative, blank, and fractional micro-dollar values', () => {
    expect(parseUnits('-1', 1_000_000)).toBeNull();
    expect(parseUnits('', 1_000_000)).toBeNull();
    expect(parseUnits('0.0000001', 1_000_000)).toBeNull();
  });
});
