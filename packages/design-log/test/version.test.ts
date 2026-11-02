import { describe, expect, it } from 'vitest';

import { InvalidVersionCounts, deriveVersion } from '../src/version.js';

describe('deriveVersion', () => {
  it.each([
    [{ publishCount: 0, buildsSinceFork: 0, txSinceLatestBuild: 0 }, '0.0.0'],
    [{ publishCount: 1, buildsSinceFork: 0, txSinceLatestBuild: 0 }, '1.0.0'],
    [{ publishCount: 1, buildsSinceFork: 3, txSinceLatestBuild: 2 }, '1.3.2'],
  ] as const)('derives $publishCount.$buildsSinceFork.$txSinceLatestBuild', (counts, version) => {
    expect(deriveVersion(counts)).toBe(version);
  });

  it.each([
    { publishCount: -1, buildsSinceFork: 0, txSinceLatestBuild: 0 },
    { publishCount: 0, buildsSinceFork: 1.5, txSinceLatestBuild: 0 },
    { publishCount: 0, buildsSinceFork: 0, txSinceLatestBuild: Number.NaN },
  ])('rejects invalid counts: %j', (counts) => {
    expect(() => deriveVersion(counts)).toThrow(InvalidVersionCounts);
  });
});
