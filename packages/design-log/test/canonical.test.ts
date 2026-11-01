import { describe, expect, it } from 'vitest';

import { CanonicalError, canonical, sha256Canonical } from '../src/canonical.js';

describe('canonical JSON', () => {
  it('sorts object keys recursively without whitespace', () => {
    expect(canonical({ z: 1, a: { y: 2, b: [3, { d: 4, c: 5 }] } })).toBe('{"a":{"b":[3,{"c":5,"d":4}],"y":2},"z":1}');
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });

  it('hashes the canonical bytes', () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => undefined, 1n])(
    'rejects non-JSON value %s',
    (value) => {
      expect(() => canonical(value)).toThrow(CanonicalError);
    },
  );

  it('rejects circular values', () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => canonical(value)).toThrow(CanonicalError);
  });

  it('rejects sparse arrays as non-JSON values', () => {
    expect(() => canonical(Array(2))).toThrow(CanonicalError);
  });
});
