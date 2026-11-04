import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adultCookie,
  APP_ORIGIN,
  followLink,
  requestMagicLink,
  SESSION_COOKIE,
  cookiePair,
  signIn,
} from './auth-helpers.js';
import { signAgeCookie } from '../src/auth/age.js';
import { createAuth, createAuthLogger } from '../src/auth/auth.js';
import { loadAuthEnv } from '../src/auth/env.js';
import { makeApp, makeDeps } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

type Deps = Awaited<ReturnType<typeof makeApp>>['deps'];
const outbox = (deps: Deps) => () =>
  deps.sqlite.prepare('SELECT * FROM mail_outbox ORDER BY created_at').all() as { to: string; text: string }[];
const users = (deps: Deps) =>
  deps.sqlite.prepare('SELECT email, age_band, age_attested_at FROM user').all() as Record<string, string>[];

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

function mutableAllowListAuth() {
  const deps = makeDeps();
  const env = loadAuthEnv();
  const allowedEmails = new Set(['kim@example.com']);
  const mails: { text: string }[] = [];
  const auth = createAuth({
    db: deps.db,
    env,
    allowedEmails,
    log: deps.log,
    mail: {
      send: async ({ text }) => {
        mails.push({ text });
        return { id: `mail-${mails.length}` };
      },
    },
  });
  const ageValue = signAgeCookie(
    { band: 'adult', attestedAt: new Date().toISOString(), exp: Math.floor(Date.now() / 1_000) + 3_600 },
    env.OGM_AGE_COOKIE_SECRET,
  );
  return { allowedEmails, auth, deps, mails, age: `ogm_age=${ageValue}` };
}

async function directMagicLink(auth: ReturnType<typeof mutableAllowListAuth>['auth'], age: string) {
  return auth.handler(post('/auth/sign-in/magic-link', { email: 'kim@example.com' }, { cookie: age }));
}

function mailLink(text: string): URL {
  const match = /https:\/\/\S+/.exec(text);
  if (!match) throw new Error('no link in mail text');
  return new URL(match[0]);
}

describe('age gate on Better Auth', () => {
  it('refuses a magic link without the age cookie and sends nothing', async () => {
    const { app, deps } = await makeApp();
    const response = await requestMagicLink(app, 'kim@example.com');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'AGE_REQUIRED' });
    expect(outbox(deps)()).toEqual([]);
  });

  it('refuses a tampered age cookie', async () => {
    const { app, deps } = await makeApp();
    const [name, value] = (await adultCookie(app)).split('=');
    const tampered = `${name}=${value.slice(0, -2)}${value.endsWith('A') ? 'B' : 'A'}`;
    expect((await requestMagicLink(app, 'kim@example.com', tampered)).status).toBe(403);
    expect(outbox(deps)()).toEqual([]);
  });

  it('with the cookie, enqueues one admin-inbox mail whose link creates an attested adult user', async () => {
    const { app, deps } = await makeApp();
    const age = await adultCookie(app);
    expect((await requestMagicLink(app, 'kim@example.com', age)).status).toBe(200);
    const mails = outbox(deps)();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('kim@example.com');
    expect(mails[0].text).toMatch(/https:\/\/makeopen\.games\/auth\/magic-link\/verify\?token=\S+/);

    const verified = await followLink(app, mails[0].text, age);
    expect(cookiePair(verified, SESSION_COOKIE)).toBeDefined();
    const [user] = users(deps);
    expect(user).toMatchObject({ email: 'kim@example.com', age_band: 'adult' });
    expect(Date.parse(user.age_attested_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('gives listed and unlisted addresses the same answer without storing or mailing for the unlisted address', async () => {
    vi.stubEnv('OGM_ALLOWED_EMAILS', ' KIM@Example.com, sam@example.com ');
    const { app, deps } = await makeApp();
    const age = await adultCookie(app);
    const listed = await requestMagicLink(app, 'kim@example.com', age);
    const unlisted = await requestMagicLink(app, 'stranger@example.com', age);
    const neutral = { status: true, message: 'If this address can sign in, a link is on its way' };

    expect(listed.status).toBe(200);
    expect(unlisted.status).toBe(200);
    expect(await listed.json()).toEqual(neutral);
    expect(await unlisted.json()).toEqual(neutral);
    expect(outbox(deps)().map(({ to }) => to)).toEqual(['kim@example.com']);
    expect(deps.sqlite.prepare('SELECT count(*) FROM verification').pluck().get()).toBe(1);
    expect(users(deps)).toEqual([]);
  });

  it('does not create an account when the link is opened without the age cookie', async () => {
    const { app, deps } = await makeApp();
    await requestMagicLink(app, 'kim@example.com', await adultCookie(app));
    const verified = await followLink(app, outbox(deps)()[0].text);
    expect(cookiePair(verified, SESSION_COOKIE)).toBeUndefined();
    expect(users(deps)).toEqual([]);
  });

  it('rechecks the allow-list in the shared user-creation hook before opening an issued link', async () => {
    const { allowedEmails, auth, deps, mails, age } = mutableAllowListAuth();
    expect((await directMagicLink(auth, age)).status).toBe(200);
    allowedEmails.clear();

    const response = await auth.handler(new Request(mailLink(mails[0].text), { headers: { cookie: age } }));

    expect(response.status).not.toBe(200);
    expect(deps.sqlite.prepare('SELECT count(*) FROM user').pluck().get()).toBe(0);
    expect(deps.sqlite.prepare('SELECT count(*) FROM session').pluck().get()).toBe(0);
  });

  it('refuses passkey registration when an existing user is removed from the allow-list', async () => {
    const { allowedEmails, auth, mails, age } = mutableAllowListAuth();
    await directMagicLink(auth, age);
    const signedIn = await auth.handler(new Request(mailLink(mails[0].text), { headers: { cookie: age } }));
    const session = cookiePair(signedIn, SESSION_COOKIE);
    expect(session).toBeDefined();
    allowedEmails.clear();

    const response = await auth.handler(
      new Request(`${APP_ORIGIN}/auth/passkey/generate-register-options`, {
        headers: { cookie: `${session}; ${age}`, origin: APP_ORIGIN },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SIGN_IN_NOT_ALLOWED' });
  });

  it('refuses passkey registration without the age cookie even with a session', async () => {
    const { app, deps } = await makeApp();
    const { age, session } = await signIn(app, outbox(deps), 'kim@example.com');
    const refused = await app.request('/auth/passkey/generate-register-options', { headers: { cookie: session } });
    expect(refused.status).toBe(403);
    const allowed = await app.request('/auth/passkey/generate-register-options', {
      headers: { cookie: `${session}; ${age}` },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ rp: { id: 'makeopen.games' } });
  });

  it('rate-limits magic links to 10 an hour per email and per client address', async () => {
    const { app } = await makeApp();
    const age = await adultCookie(app);
    const from = (ip: string) => ({ 'x-forwarded-for': ip });
    for (let index = 0; index < 10; index += 1) {
      expect((await requestMagicLink(app, 'kim@example.com', age, from(`203.0.113.${index}`))).status).toBe(200);
    }
    expect((await requestMagicLink(app, 'KIM@example.com', age, from('203.0.113.99'))).status).toBe(429);
    for (let index = 0; index < 10; index += 1) {
      expect((await requestMagicLink(app, `p${index}@example.com`, age, from('198.51.100.1'))).status).toBe(200);
    }
    expect((await requestMagicLink(app, 'sam@example.com', age, from('198.51.100.1'))).status).toBe(429);
    expect((await requestMagicLink(app, 'sam@example.com', age, from('198.51.100.2'))).status).toBe(200);
  });

  it('keeps the neutral response and logs when the SMTP sender fails', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:1');
    const { app, deps } = await makeApp();
    const response = await requestMagicLink(app, 'kim@example.com', await adultCookie(app));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: true,
      message: 'If this address can sign in, a link is on its way',
    });
    expect(deps.sqlite.prepare('SELECT count(*) FROM verification').pluck().get()).toBe(0);
    expect(deps.lines).toContainEqual({ event: 'auth-magic-link-mail-failed', level: 'error' });
  });

  it('does not copy untrusted request values into Better Auth logs', () => {
    const marker = 'untrusted-origin-marker';
    const lines: Record<string, unknown>[] = [];
    createAuthLogger((line) => lines.push(line)).log('error', `Invalid origin: ${marker}`, { marker });
    expect(lines).toEqual([{ event: 'better-auth', level: 'error' }]);
  });
});

describe('sign-in methods', () => {
  it('allows maintainers when the explicit allow-list is empty and logs one fail-closed warning', async () => {
    vi.stubEnv('OGM_ALLOWED_EMAILS', ' , ');
    vi.stubEnv('OGM_MAINTAINER_EMAILS', ' Other@example.com, KIM@example.com ');
    const { app, deps } = await makeApp();
    const response = await requestMagicLink(app, 'kim@example.com', await adultCookie(app));
    const denied = await requestMagicLink(app, 'stranger@example.com', await adultCookie(app));

    expect(response.status).toBe(200);
    expect(await denied.json()).toEqual({
      status: true,
      message: 'If this address can sign in, a link is on its way',
    });
    expect(outbox(deps)()).toHaveLength(1);
    expect(deps.lines.filter(({ event }) => event === 'auth-allowed-emails-empty')).toEqual([
      { event: 'auth-allowed-emails-empty', level: 'warn' },
    ]);
  });

  it('lists only the social providers configured at boot', async () => {
    const withoutGoogle = await makeApp();
    expect(await (await withoutGoogle.app.request('/auth/providers')).json()).toEqual({
      providers: ['magic-link', 'passkey'],
    });

    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
    const withGoogle = await makeApp();
    expect(await (await withGoogle.app.request('/auth/providers')).json()).toEqual({
      providers: ['magic-link', 'passkey', 'google'],
    });
  });

  it('has no password sign-up', async () => {
    const { app } = await makeApp();
    const age = await adultCookie(app);
    const body = { email: 'kim@example.com', password: 'correct horse battery', name: 'Kim' };
    expect((await app.request(post('/auth/sign-up/email', body, { cookie: age }))).status).toBe(400);
  });

  it('leaves Google out when its client id is unset, and gates its start on the age cookie', async () => {
    const { app } = await makeApp();
    expect((await app.request(post('/auth/sign-in/social', { provider: 'google' }))).status).toBe(403);
    const response = await app.request(
      post('/auth/sign-in/social', { provider: 'google' }, { cookie: await adultCookie(app) }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'PROVIDER_NOT_FOUND' });
  });

  it('starts Google with the app-origin callback when the client is configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
    const { app } = await makeApp();
    const response = await app.request(
      post('/auth/sign-in/social', { provider: 'google' }, { cookie: await adultCookie(app) }),
    );
    expect(response.status).toBe(200);
    const url = new URL(((await response.json()) as { url: string }).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://makeopen.games/auth/callback/google');
  });

  it('treats blank optional names as unset at boot', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('SMTP_URL', '');
    const { deps } = await makeApp();
    expect(deps.lines).toContainEqual({ event: 'auth-ready', mailSender: 'admin-inbox', google: false });
  });
});
