import { describe, expect, it } from 'vitest';

import { signWsToken, verifyWsToken } from '../src/auth/ws-token.js';
import { WS_SECRET } from './auth-helpers.js';

describe('ogw1 ws token', () => {
  it('round-trips its claims and expires after the TTL', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const { token, expiresAt } = signWsToken({ sub: 'u_1', familyId: 'f_1' }, WS_SECRET, 300, now);
    expect(token.startsWith('ogw1.')).toBe(true);
    expect(expiresAt).toBe('2026-10-31T12:05:00.000Z');
    expect(verifyWsToken(token, WS_SECRET, now + 299_000)).toMatchObject({ sub: 'u_1', familyId: 'f_1' });
    expect(verifyWsToken(token, WS_SECRET, now + 300_000)).toBeNull();
  });

  it('defaults to five minutes and a fresh nonce per token', () => {
    const now = Date.now();
    const a = signWsToken({ sub: 'u_1', familyId: '' }, WS_SECRET, undefined, now);
    const b = signWsToken({ sub: 'u_1', familyId: '' }, WS_SECRET, undefined, now);
    expect(verifyWsToken(a.token, WS_SECRET, now)!.exp).toBe(Math.floor(now / 1000) + 300);
    expect(verifyWsToken(a.token, WS_SECRET, now)!.nonce).not.toBe(verifyWsToken(b.token, WS_SECRET, now)!.nonce);
  });

  it('refuses another secret, a tampered body and other token kinds', () => {
    const { token } = signWsToken({ sub: 'u_1', familyId: 'f_1' }, WS_SECRET);
    expect(verifyWsToken(token, 'another-secret-0123456789')).toBeNull();
    const [, body, sig] = token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'u_2' })).toString('base64url');
    expect(verifyWsToken(`ogw1.${forged}.${sig}`, WS_SECRET)).toBeNull();
    expect(verifyWsToken(`gmj1.${body}.${sig}`, WS_SECRET)).toBeNull();
  });
});
