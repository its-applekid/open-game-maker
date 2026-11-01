import { describe, expect, it } from 'vitest';

import { JOB_TOKEN_TTL_SEC, signJobToken, verifyJobToken } from '../src/app/job-token.js';

const secret = 'job-token-secret-for-tests-0123456789';
const claims = {
  jobId: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
  gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
  familyId: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e02',
};
const now = Date.UTC(2026, 10, 1);

describe('job tokens', () => {
  it('round-trips claims with a 48 hour default expiry', () => {
    const token = signJobToken(claims, secret, now);
    expect(token).toMatch(/^gmj1\.[\w-]+\.[\w-]+$/);
    expect(verifyJobToken(token, secret, now)).toEqual({ ...claims, exp: now / 1000 + JOB_TOKEN_TTL_SEC });
    expect(JOB_TOKEN_TTL_SEC).toBe(172_800);
  });

  it('rejects an expired token', () => {
    const token = signJobToken(claims, secret, now);
    expect(verifyJobToken(token, secret, now + JOB_TOKEN_TTL_SEC * 1000)).toBeNull();
  });

  it('rejects a token with one character of its MAC changed', () => {
    const token = signJobToken(claims, secret, now);
    const last = token.at(-2) === 'A' ? 'B' : 'A';
    expect(verifyJobToken(`${token.slice(0, -2)}${last}${token.at(-1)}`, secret, now)).toBeNull();
  });

  it('rejects claims rewritten under the original MAC', () => {
    const [prefix, , mac] = signJobToken(claims, secret, now).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, exp: now / 1000 + 10 * JOB_TOKEN_TTL_SEC })).toString(
      'base64url',
    );
    expect(verifyJobToken(`${prefix}.${forged}.${mac}`, secret, now)).toBeNull();
  });

  it('rejects other secrets, other prefixes and garbage', () => {
    const token = signJobToken(claims, secret, now);
    expect(verifyJobToken(token, 'another-secret-0123456789', now)).toBeNull();
    expect(verifyJobToken(token.replace(/^gmj1/, 'gmj2'), secret, now)).toBeNull();
    expect(verifyJobToken('gmj1.x', secret, now)).toBeNull();
  });

  it('carries no secret material in the token', () => {
    const [, payload] = signJobToken(claims, secret, now).split('.');
    expect(Buffer.from(payload, 'base64url').toString('utf8')).not.toContain(secret);
  });
});
