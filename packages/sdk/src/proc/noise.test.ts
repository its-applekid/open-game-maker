import { describe, expect, it } from 'vitest';

import { createNoise, fbm, ridge } from './noise.js';

describe('procedural noise', () => {
  it('matches checked-in FastNoise Lite 1.1.1 goldens', () => {
    const noise = createNoise(7);

    expect(noise.at2(1.5, 2.5)).toBeCloseTo(0.0265940544201801, 12);
    expect(noise.at3(1.5, 2.5, 3.5)).toBeCloseTo(-0.16715472270787807, 12);
    expect(fbm(noise, 1.5, 2.5)).toBeCloseTo(0.5178333744555246, 12);
    expect(ridge(noise, 1.5, 2.5)).toBeCloseTo(0.9349633530217586, 12);
  });

  it('is deterministic for a seed and distinguishes another seed', () => {
    const first = createNoise(11, { type: 'Perlin', frequency: 0.03 });
    const replay = createNoise(11, { type: 'Perlin', frequency: 0.03 });
    const changed = createNoise(12, { type: 'Perlin', frequency: 0.03 });

    expect(first.at2(7.5, -2)).toBe(replay.at2(7.5, -2));
    expect(changed.at2(7.5, -2)).not.toBe(first.at2(7.5, -2));
  });

  it('keeps the default octave helpers in their normalized ranges', () => {
    const noise = createNoise(23);
    let maxFbm = 0;
    let maxRidge = 0;
    for (let x = 0; x < 100; x += 1) {
      for (let y = 0; y < 100; y += 1) {
        maxFbm = Math.max(maxFbm, fbm(noise, x / 7, y / 9));
        maxRidge = Math.max(maxRidge, ridge(noise, x / 7, y / 9));
      }
    }

    expect(maxFbm).toBeGreaterThan(0);
    expect(maxFbm).toBeLessThan(1);
    expect(maxRidge).toBeGreaterThan(0);
    expect(maxRidge).toBeLessThan(1.1);
  });
});
