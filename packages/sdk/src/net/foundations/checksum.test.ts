import { describe, expect, it } from 'vitest';

import { fold, sameWords, sortedIds, toUnits } from './checksum.js';

describe('digest words', () => {
  it('folds the FNV-1a vectors the design fixes', () => {
    expect(fold([])).toBe(2_166_136_261);
    expect(fold([1])).toBe(4_218_009_092);
    expect(fold([0])).toBe(1_268_118_805);
    expect(fold([0, 0, 0, 0])).toBe(1_768_495_365);
    expect(fold([-1])).toBe(3_809_873_841);
    expect(fold([1, 2, 3])).toBe(2_034_659_765);
    expect(fold([3200, -1600])).toBe(867_088_404);
    expect(fold([5])).toBe(3_132_668_352);
  });

  it('quantises to 1/256 and never produces a negative zero', () => {
    expect(toUnits(0)).toBe(0);
    expect(toUnits(0.5)).toBe(128);
    expect(toUnits(-0.5)).toBe(-128);
    expect(toUnits(1 / 3)).toBe(85);
    expect(toUnits(-1 / 3)).toBe(-85);
    expect(Object.is(toUnits(-0.0001), 0)).toBe(true);
    expect(toUnits(2, 1_000)).toBe(2_000);
  });

  it('refuses values that are not finite integers', () => {
    expect(() => toUnits(Number.NaN)).toThrow(RangeError);
    expect(() => toUnits(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => fold([1.5])).toThrow(TypeError);
    expect(() => toUnits(1, 0)).toThrow(RangeError);
  });

  it('compares word lists and sorts ids by code unit', () => {
    expect(sameWords([1, 2], [1, 2])).toBe(true);
    expect(sameWords([1, 2], [1, 3])).toBe(false);
    expect(sameWords([1], [1, 2])).toBe(false);
    expect(sortedIds(['b', 'A', 'a', 'B'])).toEqual(['A', 'B', 'a', 'b']);
  });
});
