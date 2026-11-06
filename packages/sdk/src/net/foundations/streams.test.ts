import { describe, expect, it } from 'vitest';

import { createStreams, hash32 } from './streams.js';

describe('seeded streams', () => {
  it('gives every seat the same shared sequence and a different own sequence', () => {
    const left = createStreams(12_345);
    const right = createStreams(12_345);

    const sharedFirst = [left.shared().next(), left.shared().next(), left.shared().next()];
    expect(sharedFirst).toEqual([right.shared().next(), right.shared().next(), right.shared().next()]);
    expect(left.seat(1).next()).not.toBe(sharedFirst[0]);
    expect(createStreams(12_345).seat(1).next()).toBe(createStreams(12_345).seat(1).next());
  });

  it('hands out one stream per epoch rather than a fresh one per call', () => {
    const streams = createStreams(7);
    const stream = streams.shared();
    expect(streams.shared()).toBe(stream);
    expect(streams.seat(1)).toBe(streams.seat(1));
    const first = stream.next();
    expect(stream.next()).not.toBe(first);
    expect(createStreams(7).shared().next()).toBe(first);
  });

  it('stores a private per-seat seed without wiring it', () => {
    const streams = createStreams(1, 99);
    expect(streams.privateSeed(0)).toBe(hash32(99, 0));
    expect(streams.privateSeed(1)).not.toBe(streams.privateSeed(0));
    expect(() => streams.seat(-1)).toThrow(RangeError);
    expect(() => streams.seat(1.5)).toThrow(RangeError);
    expect(hash32(3, 0)).toBeGreaterThan(0);
  });
});
