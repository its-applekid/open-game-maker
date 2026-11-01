import { createHash, createHmac } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { roundExpiry, signBlobUrl, verifySignedGet, type BlobHash } from '../src/index.js';

function hashFor(value: Uint8Array): BlobHash {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function alterHex(value: string): string {
  return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
}

describe('signed blob URLs', () => {
  test('refuses a signing key shorter than 32 bytes', () => {
    const hash = hashFor(new Uint8Array());
    const exp = roundExpiry(new Date('2026-06-01T12:00:00Z'));

    expect(() => signBlobUrl('k'.repeat(31), hash, exp)).toThrow('Signing key must be at least 32 bytes');
    expect(() => signBlobUrl('', hash, exp)).toThrow(RangeError);
    expect(signBlobUrl('k'.repeat(32), hash, exp)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('roundExpiry uses the following UTC midnight plus 24 hours and is monotone', () => {
    const min = Date.parse('2026-01-01T00:00:00.000Z');
    const max = Date.parse('2030-12-31T23:59:59.999Z');

    fc.assert(
      fc.property(fc.integer({ min, max }), fc.integer({ min, max }), (leftMs, rightMs) => {
        const left = new Date(leftMs);
        const right = new Date(rightMs);
        const expiry = roundExpiry(left);
        const delta = expiry * 1000 - leftMs;

        expect(expiry % 86_400).toBe(0);
        expect(delta).toBeGreaterThan(86_400_000);
        expect(delta).toBeLessThanOrEqual(172_800_000);
        if (leftMs <= rightMs) expect(expiry).toBeLessThanOrEqual(roundExpiry(right));
      }),
      { numRuns: 200 },
    );

    expect(roundExpiry(new Date('2026-01-01T00:00:00.000Z'))).toBe(Date.parse('2026-01-03T00:00:00.000Z') / 1000);
  });

  test('valid signatures verify and single-character tampering fails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 32, maxLength: 64 }),
        fc.uint8Array({ maxLength: 256 }),
        fc.integer({ min: 2_000_000_000, max: 2_100_000_000 }),
        (key, bytes, exp) => {
          const hash = hashFor(bytes);
          const sig = signBlobUrl(key, hash, exp);

          expect(verifySignedGet(key, { hash, exp, sig }, 0)).toEqual({ ok: true });
          expect(verifySignedGet(key, { hash, exp, sig: alterHex(sig) }, 0)).toEqual({
            ok: false,
            reason: 'bad-signature',
          });
          expect(verifySignedGet(key, { hash, exp: exp + 1, sig }, 0)).toEqual({
            ok: false,
            reason: 'bad-signature',
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  test('signBlobUrl is the specified deterministic HMAC', () => {
    const key = 'known-key-padded-to-thirty-two-bytes!';
    const hash = hashFor(new TextEncoder().encode('known bytes'));
    const exp = 2_000_000_000;
    const expected = createHmac('sha256', key).update(`${hash}\n${exp}`).digest('hex');

    expect(signBlobUrl(key, hash, exp)).toBe(expected);
    expect(signBlobUrl(key, hash, exp)).toBe(signBlobUrl(key, hash, exp));
  });

  test('expired, malformed, and invalid-hash requests fail without throwing', () => {
    const key = 'test-key-padded-to-thirty-two-bytes!!';
    const hash = hashFor(new Uint8Array([1]));
    const exp = 100;
    const sig = signBlobUrl(key, hash, exp);

    expect(verifySignedGet(key, { hash, exp, sig }, 100_000)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verifySignedGet(key, { hash, exp: 101, sig: 'abc' }, 0)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(verifySignedGet(key, { hash: 'sha256:not-a-hash' as BlobHash, exp: 101, sig }, 0)).toEqual({
      ok: false,
      reason: 'bad-hash',
    });
  });
});
