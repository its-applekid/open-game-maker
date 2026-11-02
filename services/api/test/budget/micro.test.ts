import { describe, expect, it } from 'vitest';

import { microToUsd, usdToMicro } from '../../src/budget/micro.js';

describe('micro-dollar conversion', () => {
  it.each([
    ['0.734512', 734_512n],
    ['1', 1_000_000n],
    ['12.345678', 12_345_678n],
    ['0.000001', 1n],
  ])('parses %s exactly', (usd, expected) => {
    expect(usdToMicro(usd)).toBe(expected);
  });

  it.each(['0.1234567', 'abc', '-1', '01.2', '1.', '.5'])('rejects invalid USD %s', (usd) => {
    expect(() => usdToMicro(usd)).toThrow(TypeError);
  });

  it('formats exact fixed-width USD without floating point arithmetic', () => {
    expect(microToUsd(12_345_678n)).toBe('12.345678');
    expect(microToUsd(1n)).toBe('0.000001');
  });
});
