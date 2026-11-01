import { createHmac, timingSafeEqual } from 'node:crypto';

import { assertBlobHash, isBlobHash, type BlobHash } from './hash.js';

const secondsPerDay = 86_400;
const signaturePattern = /^[0-9a-f]{64}$/;
const minimumKeyBytes = 32;

function assertSigningKey(key: string): void {
  if (Buffer.byteLength(key, 'utf8') < minimumKeyBytes) {
    throw new RangeError(`Signing key must be at least ${minimumKeyBytes} bytes`);
  }
}

export function roundExpiry(expiresAt: Date): number {
  const milliseconds = expiresAt.getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError('Invalid expiry date');

  const seconds = milliseconds / 1000;
  const nextMidnight = (Math.floor(seconds / secondsPerDay) + 1) * secondsPerDay;
  return nextMidnight + secondsPerDay;
}

export function signBlobUrl(key: string, hash: BlobHash, exp: number): string {
  assertSigningKey(key);
  assertBlobHash(hash);
  if (!Number.isSafeInteger(exp) || exp < 0) throw new RangeError('Invalid expiry');

  return createHmac('sha256', key).update(`${hash}\n${exp}`).digest('hex');
}

export function verifySignedGet(
  key: string,
  query: { hash: BlobHash; exp: number; sig: string },
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: 'expired' | 'bad-signature' | 'bad-hash' } {
  if (!isBlobHash(query.hash)) return { ok: false, reason: 'bad-hash' };
  if (!Number.isSafeInteger(query.exp) || query.exp < 0 || query.exp * 1000 <= nowMs) {
    return { ok: false, reason: 'expired' };
  }
  if (!signaturePattern.test(query.sig)) return { ok: false, reason: 'bad-signature' };

  const expected = Buffer.from(signBlobUrl(key, query.hash, query.exp), 'hex');
  const actual = Buffer.from(query.sig, 'hex');
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'bad-signature' };
  }

  return { ok: true };
}

export function normalizePathPrefix(pathPrefix = '/blobs'): string {
  const trimmed = pathPrefix.replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('?') || trimmed.includes('#')) {
    throw new TypeError('Invalid blob path prefix');
  }
  return `/${trimmed}`;
}
