import { describe, expect, it } from 'vitest';

import { isAdult, signAgeCookie, verifyAgeCookie } from '../src/auth/age.js';
import { AGE_SECRET, cookiePair, postAge } from './auth-helpers.js';
import { makeApp } from './helpers.js';

const now = new Date('2026-10-31T12:00:00Z');

const rowCounts = (sqlite: Awaited<ReturnType<typeof makeApp>>['deps']['sqlite']) =>
  Object.fromEntries(
    ['user', 'session', 'account', 'verification', 'passkey', 'mail_outbox'].map((table) => [
      table,
      sqlite.prepare(`SELECT count(*) FROM "${table}"`).pluck().get(),
    ]),
  );

describe('isAdult (18th birthday month reached)', () => {
  it.each([
    ['turns 18 this month', 10, 2008, true],
    ['turns 18 next month', 11, 2008, false],
    ['is 17', 5, 2009, false],
    ['is 120', 1, 1906, true],
    ['worked example: May 2000', 5, 2000, true],
    ['worked example: December 2008', 12, 2008, false],
  ])('%s', (_label, month, year, adult) => {
    expect(isAdult(month, year, now)).toBe(adult);
  });
});

describe('age cookie', () => {
  const cookie = { band: 'adult', attestedAt: now.toISOString(), exp: now.getTime() / 1000 + 60 } as const;

  it('verifies its own signature until it expires', () => {
    const value = signAgeCookie(cookie, AGE_SECRET);
    expect(verifyAgeCookie(value, AGE_SECRET, now.getTime())).toEqual(cookie);
    expect(verifyAgeCookie(value, AGE_SECRET, now.getTime() + 61_000)).toBeNull();
  });

  it('refuses another secret, a tampered body and the refused marker', () => {
    const value = signAgeCookie(cookie, AGE_SECRET);
    expect(verifyAgeCookie(value, 'another-secret-0123456789', now.getTime())).toBeNull();
    const forged = Buffer.from(JSON.stringify({ ...cookie, exp: cookie.exp + 1e6 })).toString('base64url');
    expect(verifyAgeCookie(`${forged}.${value.split('.')[1]}`, AGE_SECRET, now.getTime())).toBeNull();
    expect(verifyAgeCookie('refused', AGE_SECRET, now.getTime())).toBeNull();
  });
});

describe('POST /auth/age', () => {
  it('answers an adult 204 with a signed, HttpOnly, Secure, Lax, 24 h cookie', async () => {
    const { app } = await makeApp();
    const response = await postAge(app, { birthMonth: 5, birthYear: 2000 });
    expect(response.status).toBe(204);
    const line = response.headers.getSetCookie().find((entry) => entry.startsWith('ogm_age='));
    expect(line).toMatch(/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax$/);
    const value = cookiePair(response, 'ogm_age')!.slice('ogm_age='.length);
    expect(verifyAgeCookie(value, AGE_SECRET)).toMatchObject({ band: 'adult' });
  });

  it('answers a minor 403, stores no row, logs no birth value, and leaves only the refused marker', async () => {
    const { app, deps } = await makeApp();
    const before = rowCounts(deps.sqlite);
    const response = await postAge(app, { birthMonth: 12, birthYear: 2015 });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'age_refused' });
    expect(cookiePair(response, 'ogm_age')).toBe('ogm_age=refused');
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=31536000');
    expect(rowCounts(deps.sqlite)).toEqual(before);
    expect(JSON.stringify(deps.lines)).not.toContain('2015');
  });

  it('does not let a refused browser retry', async () => {
    const { app } = await makeApp();
    const response = await postAge(app, { birthMonth: 5, birthYear: 2000 }, { cookie: 'ogm_age=refused' });
    expect(response.status).toBe(403);
    expect(cookiePair(response, 'ogm_age')).toBeUndefined();
  });

  it('rejects out-of-range values with 400', async () => {
    const { app } = await makeApp();
    for (const body of [{ birthMonth: 13, birthYear: 2000 }, { birthMonth: 1, birthYear: 1899 }, { birthMonth: 1 }]) {
      expect((await postAge(app, body)).status).toBe(400);
    }
    expect((await postAge(app, { birthMonth: 1, birthYear: new Date().getUTCFullYear() + 1 })).status).toBe(400);
  });

  it('rate-limits each client address to 10 answers an hour', async () => {
    const { app } = await makeApp();
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    for (let index = 0; index < 10; index += 1) {
      expect((await postAge(app, { birthMonth: 5, birthYear: 2000 }, headers)).status).toBe(204);
    }
    expect((await postAge(app, { birthMonth: 5, birthYear: 2000 }, headers)).status).toBe(429);
    expect((await postAge(app, { birthMonth: 5, birthYear: 2000 }, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(
      204,
    );
  });
});
