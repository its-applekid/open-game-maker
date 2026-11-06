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

  it('seeds the private stream from the seat’s own private seed and never derives it', () => {
    // Two seats in one match: same shared seed, different private seeds. A derived private seed would make these
    // equal, which is the leak D-N5-6 exists to prevent.
    const seat0 = createStreams(12_345, 0x1234_abcd);
    const seat1 = createStreams(12_345, 0x0f0f_0f0f);

    const own = [seat0.private().next(), seat0.private().next(), seat0.private().next()];
    expect(own).not.toEqual([seat1.private().next(), seat1.private().next(), seat1.private().next()]);
    expect(own).not.toEqual([createStreams(12_345, 0x1234_abcd).shared().next()]);

    // Idempotent per epoch: asking twice without drawing is the same stream, and the same seed replays the same run.
    const again = createStreams(12_345, 0x1234_abcd);
    expect(again.private()).toBe(again.private());
    expect([again.private().next(), again.private().next(), again.private().next()]).toEqual(own);
  });

  it('refuses a private stream when the epoch carries no private seed', () => {
    const streams = createStreams(1);
    expect(streams.hasPrivate()).toBe(false);
    expect(() => streams.private()).toThrow('no private seed for this epoch');
    expect(createStreams(1, 99).hasPrivate()).toBe(true);
  });

  it('rejects a seat that is not a non-negative integer', () => {
    const streams = createStreams(1, 99);
    expect(() => streams.seat(-1)).toThrow(RangeError);
    expect(() => streams.seat(1.5)).toThrow(RangeError);
    expect(hash32(3, 0)).toBeGreaterThan(0);
  });
});
