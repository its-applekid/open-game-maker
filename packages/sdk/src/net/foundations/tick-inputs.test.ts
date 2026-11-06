import { describe, expect, it } from 'vitest';

import { STEP_MS } from '../../core/clock.js';
import { InputRings, type StampedFrame } from './tick-inputs.js';

const frame = (seat: number, tick: number, move = 0): StampedFrame => ({
  seat,
  seq: tick,
  tick,
  axes: [move],
  buttons: 0,
});

describe('tick-stamped input rings', () => {
  it('builds a three-tick window newest first', () => {
    const rings = new InputRings({ seats: [0] });
    for (const tick of [10, 11, 12]) rings.record(frame(0, tick));
    expect(rings.window(0, 12).map((entry) => entry.tick)).toEqual([12, 11, 10]);
    expect(rings.window(0, 13).map((entry) => entry.tick)).toEqual([12, 11]);
  });

  it('tolerates two lost packets because each carries three ticks', () => {
    const rings = new InputRings({ seats: [0] });
    rings.record(frame(0, 1));
    // The packet carrying ticks 2, 3 and 4 is lost, as is the one carrying 5, 6, 7.
    rings.record(frame(0, 8));
    expect(rings.frameFor(0, 1)).toBeDefined();
    const gapped = rings.collect(0, 2);
    expect(gapped.frame?.tick).toBe(1);
    expect(gapped.gapped).toBe(true);
    expect(rings.inputGaps).toBe(1);
    expect(rings.collect(0, 8).gapped).toBe(false);
  });

  it('keeps the first write for a tick and never double counts a retransmission', () => {
    const rings = new InputRings({ seats: [0] });
    expect(rings.record(frame(0, 5, 1))).toBe('stored');
    expect(rings.record(frame(0, 5, -1))).toBe('duplicate');
    expect(rings.frameFor(0, 5)?.axes).toEqual([1]);
    expect(rings.inputGaps).toBe(0);
  });

  it('stores a late frame and counts it without re-simulating', () => {
    const rings = new InputRings({ seats: [0] });
    rings.markSimulated(0, 9);
    expect(rings.record(frame(0, 4))).toBe('late');
    expect(rings.lateInputs).toBe(1);
    expect(rings.frameFor(0, 4)).toBeDefined();
  });

  it('repeats the last known frame for a missing tick and asks for no frame before the first', () => {
    const rings = new InputRings({ seats: [0] });
    rings.record(frame(0, 3, 1));
    const collected = rings.collect(0, 6);
    expect(collected.frame?.tick).toBe(3);
    expect(collected.gapped).toBe(true);
    expect(new InputRings({ seats: [0] }).collect(0, 1).frame).toBeUndefined();
  });

  it('prunes to the 120-tick history and knows a tick deadline', () => {
    const rings = new InputRings({ seats: [0] });
    rings.record(frame(0, 1));
    rings.record(frame(0, 200));
    expect(rings.frameFor(0, 1)).toBeUndefined();
    expect(rings.deadlineFor(10, 1_000, 3)).toBe(1_000 + 13 * STEP_MS);
  });

  it('rejects a frame without a seat index', () => {
    const rings = new InputRings({ seats: [0] });
    expect(() => rings.record({ ...frame(0, 1), seat: -1 })).toThrow(RangeError);
  });
});
