import { describe, expect, it } from 'vitest';

import { branchFor, isCurrent, readCorePin, shortSha } from '../src/pin.js';

const SHA = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678';

describe('readCorePin', () => {
  it('reads the pinned core commit', () => {
    const read = readCorePin(JSON.stringify({ core: { sha: SHA, ref: 'main' } }));

    expect(read).toEqual({ ok: true, pin: { sha: SHA.toLowerCase() } });
  });

  it('rejects a file that is not JSON', () => {
    expect(readCorePin('not json')).toEqual({ ok: false, reason: 'vendor/core.json is not JSON' });
  });

  it('rejects a file without a core object', () => {
    expect(readCorePin(JSON.stringify({ packages: {} }))).toEqual({
      ok: false,
      reason: 'vendor/core.json has no core object',
    });
  });

  it('rejects a short or non-hexadecimal commit', () => {
    for (const sha of ['abc123', `${'z'.repeat(40)}`, 42]) {
      expect(readCorePin(JSON.stringify({ core: { sha } })).ok).toBe(false);
    }
  });
});

describe('isCurrent', () => {
  it('compares case-insensitively', () => {
    expect(isCurrent({ sha: SHA.toLowerCase() }, SHA)).toBe(true);
    expect(isCurrent({ sha: SHA.toLowerCase() }, 'b'.repeat(40))).toBe(false);
  });
});

describe('branchFor', () => {
  it('names the branch after the first twelve characters of the commit', () => {
    expect(branchFor(SHA)).toBe('core-bump/a1b2c3d4e5f6');
    expect(shortSha(SHA)).toBe('a1b2c3d4e5f6');
  });
});
