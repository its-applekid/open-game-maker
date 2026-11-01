import type { ActionFrame } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { FixedClock } from './clock.js';

const frame: ActionFrame = {
  playerIndex: 0,
  tick: 0,
  source: 'keyboard',
  actions: { go: true },
};

describe('FixedClock', () => {
  it('accumulates fractional frames without drift', () => {
    const onStep = vi.fn();
    const clock = new FixedClock(onStep);

    expect(clock.advance(16)).toBe(0);
    expect(clock.advance(16)).toBe(1);
    expect(clock.advance(16)).toBe(1);

    expect(clock.tick).toBe(2);
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(1 / 60, []);
  });

  it('runs exactly sixty steps per second', () => {
    const clock = new FixedClock();

    expect(clock.advance(1000)).toBe(60);
    expect(clock.tick).toBe(60);
  });

  it('halts within the step that pauses it', () => {
    let pauseOnStep = true;
    const clock = new FixedClock(() => {
      if (!pauseOnStep) return;
      pauseOnStep = false;
      clock.pause();
    });

    expect(clock.advance(1000)).toBe(1);
    expect(clock.tick).toBe(1);
    expect(clock.advance(1000)).toBe(0);

    clock.resume();
    expect(clock.advance(17)).toBe(1);
    expect(clock.tick).toBe(2);
  });

  it('consumes injected frames on exactly the next step', () => {
    const onStep = vi.fn();
    const clock = new FixedClock(onStep);
    clock.inject(frame);

    clock.advance(34);

    expect(onStep).toHaveBeenNthCalledWith(1, 1 / 60, [frame]);
    expect(onStep).toHaveBeenNthCalledWith(2, 1 / 60, []);
  });

  it('rejects invalid durations', () => {
    const clock = new FixedClock();

    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });
});
