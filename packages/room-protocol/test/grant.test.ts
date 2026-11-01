import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';

import { signGrant, verifyGrant, type GrantClaims } from '../src/grant.js';
import { FIXTURE_SECRET, OTHER_SECRET } from './fixtures/secret.js';

const claims: GrantClaims = { sub: 'u_01J', roomId: 'r_01J', gameId: 'g_01J', role: 'player', name: 'Sam' };
const now = 1_761_899_400_000;
const nowSec = now / 1000;

describe('signGrant / verifyGrant', () => {
  it('round-trips the claims with a 10-minute exp and a jti', async () => {
    const result = await verifyGrant(await signGrant(claims, FIXTURE_SECRET, now), FIXTURE_SECRET, now);
    expect(result).toEqual({
      ok: true,
      grant: { ...claims, iat: nowSec, exp: nowSec + 600, jti: expect.stringMatching(/.{8,}/) },
    });
  });

  it('never issues a grant longer than 10 minutes', async () => {
    const payload = decodeJwt(await signGrant({ ...claims, ttlSec: 3600 }, FIXTURE_SECRET, now));
    expect(payload.exp! - payload.iat!).toBe(600);
  });

  it('rejects a grant signed with another secret', async () => {
    const token = await signGrant(claims, OTHER_SECRET, now);
    expect(await verifyGrant(token, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('rejects a tampered signature', async () => {
    const token = await signGrant(claims, FIXTURE_SECRET, now);
    const last = token.at(-2) === 'A' ? 'B' : 'A';
    const tampered = `${token.slice(0, -2)}${last}${token.at(-1)}`;
    expect(await verifyGrant(tampered, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('rejects a tampered payload', async () => {
    const [header, , signature] = (await signGrant(claims, FIXTURE_SECRET, now)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'owner', iat: nowSec, exp: nowSec + 600, jti: 'x' }));
    const token = `${header}.${forged.toString('base64url')}.${signature}`;
    expect(await verifyGrant(token, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('allows 30 s of clock skew after exp and no more', async () => {
    const token = await signGrant(claims, FIXTURE_SECRET, now);
    const exp = now + 600_000;
    expect((await verifyGrant(token, FIXTURE_SECRET, exp + 29_000)).ok).toBe(true);
    expect(await verifyGrant(token, FIXTURE_SECRET, exp + 31_000)).toEqual({ ok: false, code: 'GRANT_EXPIRED' });
  });

  it('rejects a grant without a jti', async () => {
    const token = await new SignJWT({ ...claims, iat: nowSec, exp: nowSec + 600 })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(FIXTURE_SECRET);
    expect(await verifyGrant(token, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('rejects a correctly signed grant that outlives 10 minutes', async () => {
    const token = await new SignJWT({ ...claims, iat: nowSec + 3600, exp: nowSec + 4200, jti: 'j_01J' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(FIXTURE_SECRET);
    expect(await verifyGrant(token, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('rejects a grant signed with another HMAC algorithm', async () => {
    const token = await new SignJWT({ ...claims, iat: nowSec, exp: nowSec + 600, jti: 'j_01J' })
      .setProtectedHeader({ alg: 'HS512' })
      .sign(FIXTURE_SECRET);
    expect(await verifyGrant(token, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('rejects an unsigned token', async () => {
    const body = Buffer.from(JSON.stringify({ ...claims, iat: nowSec, exp: nowSec + 600, jti: 'j' })).toString(
      'base64url',
    );
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    expect(await verifyGrant(`${header}.${body}.`, FIXTURE_SECRET, now)).toEqual({ ok: false, code: 'GRANT_INVALID' });
  });

  it('refuses a short secret', async () => {
    await expect(signGrant(claims, new Uint8Array(8), now)).rejects.toThrow(/at least 32 bytes/);
  });
});
