import { describe, expect, it } from 'vitest';

import { STEP_MS } from '../../core/clock.js';
import { ClockSync, StartGate } from './clock-sync.js';

describe('clock sync', () => {
  it('keeps the lowest-RTT sample', () => {
    const clock = new ClockSync();
    clock.sample({ clientMs: 1_000, serverMs: 2_030, rttMs: 80 });
    clock.sample({ clientMs: 1_000, serverMs: 2_030, rttMs: 40 });
    expect(clock.offsetMs).toBe(2_030 - (1_000 + 20));
    expect(clock.rttMs).toBe(40);
    expect(clock.sample({ clientMs: 1_100, serverMs: 2_200, rttMs: 60 })).toBe(false);
    expect(clock.offsetMs).toBe(1_010);
  });

  it('maps a server time to a tick and never goes negative', () => {
    const clock = new ClockSync();
    clock.sample({ clientMs: 1_000, serverMs: 2_030, rttMs: 40 });
    expect(clock.tickAt(10_000 + 12 * STEP_MS, 10_000)).toBe(12);
    expect(clock.tickAt(0, 10_000)).toBe(0);
  });

  it('resyncs only beyond six ticks of drift', () => {
    const clock = new ClockSync();
    expect(clock.drift(20, 12)).toEqual({ resync: true, roomTick: 20, difference: 8 });
    expect(clock.drift(18, 12).resync).toBe(false);
    expect(clock.drift(6, 0).resync).toBe(false);
    expect(STEP_MS).toBeGreaterThan(0);
  });
});

describe('start gate', () => {
  function gate() {
    const calls: string[] = [];
    const start = new StartGate({
      resetClock: (tick) => calls.push(`reset:${tick}`),
      pauseClock: () => calls.push('pause'),
      resumeClock: () => calls.push('resume'),
    });
    return { start, calls };
  }

  it('resets and pauses on arm, then releases exactly once at startAt', () => {
    const { start, calls } = gate();
    start.arm(10_000);
    expect(calls).toEqual(['reset:0', 'pause']);
    expect(start.armed).toBe(true);
    expect(start.evaluate(9_999)).toBe(false);
    expect(start.evaluate(10_000)).toBe(true);
    expect(start.evaluate(10_100)).toBe(false);
    expect(calls).toEqual(['reset:0', 'pause', 'resume']);
    expect(start.releases).toBe(1);
    expect(start.started).toBe(true);
  });

  it('skips forward for a late start without simulating the missed ticks', () => {
    const { start, calls } = gate();
    start.arm(1_000);
    start.skipTo(26);
    expect(calls).toEqual(['reset:0', 'pause', 'reset:26', 'resume']);
    expect(start.started).toBe(true);
  });
});
