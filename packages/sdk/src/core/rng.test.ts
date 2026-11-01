import { describe, expect, it } from 'vitest';

import { SeededRng } from './rng.js';

describe('SeededRng', () => {
  it('replays the same sequence from the same seed', () => {
    const first = new SeededRng(7);
    const second = new SeededRng(7);

    const a = Array.from({ length: 1000 }, () => first.next());
    const b = Array.from({ length: 1000 }, () => second.next());

    expect(a).toEqual(b);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('reports and resets its public seed', () => {
    const rng = new SeededRng(3);
    rng.next();
    rng.setSeed(11);

    expect(rng.seed()).toBe(11);
    expect(rng.int(4)).toBeGreaterThanOrEqual(0);
    expect(rng.int(4)).toBeLessThan(4);
  });

  it('can restore its internal state for keyframe replay', () => {
    const rng = new SeededRng(17);
    rng.next();
    const state = rng.snapshot();
    const expected = rng.next();

    rng.next();
    rng.restore(state);

    expect(rng.next()).toBe(expected);
  });

  it('rejects non-positive integer bounds', () => {
    const rng = new SeededRng();

    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(1.5)).toThrow(RangeError);
  });
});
