import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loopedSceneTime } from '../../../title-town/timeline.js';

describe('title town scene cycle', () => {
  it('holds the kaiju ending until the full sequence boundary and then restarts forever', () => {
    const cycle = 112;
    const kaijuPeriod = 61;

    expect(loopedSceneTime(60, cycle, kaijuPeriod)).toBe(60);
    expect(loopedSceneTime(90, cycle, kaijuPeriod)).toBeCloseTo(kaijuPeriod - 0.001);
    expect(loopedSceneTime(112.25, cycle, kaijuPeriod)).toBeCloseTo(0.25);
    expect(loopedSceneTime(224.25, cycle, kaijuPeriod)).toBeCloseTo(0.25);
  });

  it('drives visuals and embedded audio from the same unbroken cycle clock', () => {
    const source = readFileSync(resolve(process.cwd(), 'title-town/city.js'), 'utf8');

    expect(source).toContain('const lt = s.local(t)');
    expect(source).not.toContain('s.local(mod(t, s.per))');
    expect(source).toContain('s.update(s.local(t))');
  });
});
