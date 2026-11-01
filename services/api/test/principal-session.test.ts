import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyWsToken } from '../src/auth/ws-token.js';
import { signIn, WS_SECRET } from './auth-helpers.js';
import { makeApp } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const made = await makeApp();
  made.app.get('/api/v1/zz-test/whoami', (c) => c.json(c.get('principal')));
  const outbox = () =>
    made.deps.sqlite.prepare('SELECT text FROM mail_outbox ORDER BY created_at').all() as { text: string }[];
  const userId = (email: string) =>
    made.deps.sqlite.prepare('SELECT id FROM user WHERE email = ?').pluck().get(email) as string;
  return { ...made, outbox, userId };
}

const whoami = async (app: Awaited<ReturnType<typeof setup>>['app'], headers: Record<string, string>) =>
  (await app.request('/api/v1/zz-test/whoami', { headers })).json();

describe('session principal resolver', () => {
  it('resolves the session cookie and the bearer session token to the same familyless player', async () => {
    const { app, outbox, userId } = await setup();
    const { session, token } = await signIn(app, outbox, 'kim@example.com');
    const expected = {
      kind: 'user',
      userId: userId('kim@example.com'),
      familyId: '',
      platformRole: 'none',
      capability: 'player',
    };
    expect(expected.userId).toMatch(/^u_[0-9a-f-]{36}$/);
    expect(await whoami(app, { cookie: session })).toEqual(expected);
    expect(await whoami(app, { authorization: `Bearer ${token}` })).toEqual(expected);
  });

  it('stays anonymous for a forged session token', async () => {
    const { app } = await setup();
    expect(await whoami(app, { authorization: 'Bearer not-a-session-token' })).toEqual({ kind: 'anonymous' });
  });

  it('names maintainers from OGM_MAINTAINER_EMAILS, case-insensitively', async () => {
    vi.stubEnv('OGM_MAINTAINER_EMAILS', 'other@example.com, Kevin@Example.com');
    const { app, outbox } = await setup();
    const { session } = await signIn(app, outbox, 'kevin@example.com');
    expect(await whoami(app, { cookie: session })).toMatchObject({ platformRole: 'maintainer' });
  });

  it("reads the family, role and capability from OGM-012's family_members when that table exists", async () => {
    const { app, deps, outbox, userId } = await setup();
    const { session } = await signIn(app, outbox, 'sam@example.com');
    deps.sqlite.exec(
      'CREATE TABLE family_members (family_id TEXT, user_id TEXT, role TEXT, capability TEXT, joined_at TEXT)',
    );
    deps.sqlite
      .prepare("INSERT INTO family_members VALUES ('f_1', ?, 'admin', 'creator', '2026-11-01')")
      .run(userId('sam@example.com'));
    expect(await whoami(app, { cookie: session })).toMatchObject({
      familyId: 'f_1',
      platformRole: 'admin',
      capability: 'creator',
    });
  });
});

describe('POST /auth/ws-token', () => {
  it('needs a user principal', async () => {
    const { app } = await setup();
    expect((await app.request('/auth/ws-token', { method: 'POST' })).status).toBe(401);
  });

  it('mints a five-minute ogw1 token for the signed-in user', async () => {
    const { app, outbox, userId } = await setup();
    const { token } = await signIn(app, outbox, 'kim@example.com');
    const response = await app.request('/auth/ws-token', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; expiresAt: string };
    const claims = verifyWsToken(body.token, WS_SECRET);
    expect(claims).toMatchObject({ sub: userId('kim@example.com'), familyId: '' });
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(290_000);
    expect(verifyWsToken(body.token, WS_SECRET, Date.now() + 301_000)).toBeNull();
  });
});
