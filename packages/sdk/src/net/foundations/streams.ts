import { SeededRng, type Rng } from '../../core/rng.js';
import { fold } from './checksum.js';

/**
 * The seeded random streams a per-seat match draws from (design §4.5, D-N2-9).
 *
 * Every seat must draw the same shared sequence, and each seat its own — so `'shared'` is seeded from `net.start`'s
 * seed and seat `n` from `hash32(seed, n)`. Streams are created once per epoch and handed out again unchanged:
 * asking twice must not advance anything, or two call sites in the same step would consume a different sequence.
 *
 * The private per-seat seed is stored but unwired: visibility filtering is N5's, and a game written before N5 must
 * not rely on a secrecy the SDK does not yet enforce.
 */
export interface Streams {
  shared(): Rng;
  seat(seat: number): Rng;
  privateSeed(seat: number): number;
}

export function hash32(seed: number, salt: number): number {
  if (!Number.isFinite(seed)) throw new RangeError('stream seed must be finite');
  if (!Number.isInteger(salt) || salt < 0) throw new RangeError('stream salt must be a non-negative integer');
  return fold([seed | 0, salt, 0x9e3779b1]) || 1;
}

export function createStreams(seed: number, privateSeed = 0): Streams {
  const shared = new SeededRng(seed);
  const seats = new Map<number, Rng>();

  return {
    shared: () => shared,
    seat(seat) {
      if (!Number.isInteger(seat) || seat < 0) throw new RangeError('stream seat must be a non-negative integer');
      let stream = seats.get(seat);
      if (!stream) {
        stream = new SeededRng(hash32(seed, seat));
        seats.set(seat, stream);
      }
      return stream;
    },
    privateSeed(seat) {
      if (!Number.isInteger(seat) || seat < 0) throw new RangeError('stream seat must be a non-negative integer');
      return hash32(privateSeed, seat);
    },
  };
}
