/**
 * The digest word helpers every per-seat checksum is built from (netcode design §4.4, D-N2-8).
 *
 * A digest is a flat list of 32-bit integers in canonical order — seats ascending, then entity ids sorted by code
 * unit — so two clients that fold the same numbers get the same sum. `toUnits` is the only place a float becomes a
 * word, and `fold` is the only place a word list becomes a checksum.
 */

/** 1/256 of a unit: exact in binary floating point, finer than any visible position at a typical camera scale. */
export const DIGEST_SCALE = 256;

/** A value beyond this many units is outside the 32-bit range `fold` reads. */
export const DIGEST_MAX_UNITS = 8_388_607;

const FNV_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Quantises one value to integer units. `-0` is normalised so it never reaches a digest. */
export function toUnits(value: number, scale = DIGEST_SCALE): number {
  if (!Number.isFinite(value)) throw new RangeError('digest values must be finite');
  if (!Number.isInteger(scale) || scale <= 0) throw new RangeError('digest scale must be a positive integer');
  const units = Math.round(value * scale) | 0;
  return units === 0 ? 0 : units;
}

/** FNV-1a 32 over each word's four bytes, least significant first. */
export function fold(words: readonly number[]): number {
  let hash = FNV_BASIS;
  for (const word of words) {
    if (!Number.isInteger(word)) throw new TypeError('digest words must be integers');
    const value = word >>> 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash = Math.imul(hash ^ ((value >>> shift) & 0xff), FNV_PRIME) >>> 0;
    }
  }
  return hash >>> 0;
}

export function sameWords(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

/** Sorts entity ids by code unit so two clients fold the same order regardless of insertion order. */
export function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
