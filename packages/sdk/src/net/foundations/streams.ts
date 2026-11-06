import { SeededRng, type Rng } from '../../core/rng.js';
import { fold } from './checksum.js';

/**
 * The seeded random streams a per-seat match draws from (design §4.2, D-N2-9, D-N5-6).
 *
 * Every seat must draw the same shared sequence, and each seat its own — so `'shared'` is seeded from `net.start`'s
 * seed and seat `n` from `hash32(seed, n)`. Streams are created once per epoch and handed out again unchanged:
 * asking twice must not advance anything, or two call sites in the same step would consume a different sequence.
 *
 * The private stream is the one a seat must *not* be able to compute for anyone else: it is seeded from the
 * `privateSeed` the room minted for this seat alone and delivered in this seat's own `net.start` copy, never derived
 * from the shared seed every client holds. Deriving it would make a "private" draw public, so there is no
 * `privateSeed(otherSeat)` — only this seat's stream, and a throw when the room sent none.
 */
export interface Streams {
  shared(): Rng;
  seat(seat: number): Rng;
  /** This seat's own private stream; throws when the room sent no private seed for the epoch. */
  private(): Rng;
  /** Whether this epoch carries a private seed at all, so a caller can ask before it throws. */
  hasPrivate(): boolean;
}

export function hash32(seed: number, salt: number): number {
  if (!Number.isFinite(seed)) throw new RangeError('stream seed must be finite');
  if (!Number.isInteger(salt) || salt < 0) throw new RangeError('stream salt must be a non-negative integer');
  return fold([seed | 0, salt, 0x9e3779b1]) || 1;
}

export function createStreams(seed: number, privateSeed?: number): Streams {
  const shared = new SeededRng(seed);
  const seats = new Map<number, Rng>();
  // Seeded lazily so a repeated ask returns the same stream rather than advancing it, and so the missing-seed throw
  // happens at the ask rather than at `net.start`.
  let secret: Rng | undefined;
  const hasPrivate = () => typeof privateSeed === 'number' && Number.isInteger(privateSeed);

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
    private() {
      if (!hasPrivate()) throw new RangeError('no private seed for this epoch');
      secret ??= new SeededRng(privateSeed as number);
      return secret;
    },
    hasPrivate,
  };
}
