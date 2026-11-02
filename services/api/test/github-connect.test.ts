import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { schema } from '@ogm/db';
import { afterEach, describe, expect, it } from 'vitest';

import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

// The creation flow refuses 409 `github_not_connected` until a creator has a github_connections row.
// The connect screen only knows the installation id GitHub hands back, so the API must resolve the login
// itself (through the commit service, the only holder of App credentials) and never trust a browser login.

const now = '2026-11-02T00:00:00.000Z';
const familyId = 'f-family';
const user = (userId: string): TestUser => ({
  kind: 'user',
  userId,
  displayName: userId,
  email: `${userId}@example.com`,
  familyId,
  platformRole: 'none',
  capability: 'creator',
});
const creator = user('u-creator');
const other = user('u-other');

function seed(deps: ReturnType<typeof makeDeps>) {
  installUsers(deps, [creator, other]);
  deps.db
    .insert(schema.families)
    .values({ id: familyId, name: 'Household', ownerUserId: creator.userId, createdAt: now })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values(
      [creator, other].map((u) => ({
        familyId,
        userId: u.userId,
        role: 'member',
        capability: 'creator',
        joinedAt: now,
      })),
    )
    .run();
}

type App = Awaited<ReturnType<typeof makeApp>>['app'];
const json = (who: TestUser, body: unknown) => ({
  method: 'POST',
  headers: { ...asUser(who.userId), 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const connect = (app: App, installationId: string, who = creator) =>
  app.request('/api/v1/github/connect', json(who, { installationId }));
const status = async (app: App, who = creator) =>
  (await app.request('/api/v1/github/connection', { headers: asUser(who.userId) })).json();

async function appWith(loginFor: (id: string) => Promise<string | null>) {
  const deps = makeDeps();
  seed(deps);
  deps.registry.githubInstallations = { loginFor };
  return { deps, ...(await makeApp(deps)) };
}

describe('GitHub connect routes', () => {
  it('stores the login the App installation belongs to and reports it', async () => {
    const asked: string[] = [];
    const { app, deps } = await appWith(async (id) => {
      asked.push(id);
      return 'octocat';
    });

    expect(await status(app)).toEqual({ connected: false });
    const response = await connect(app, '4242');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true, login: 'octocat' });
    expect(asked).toEqual(['4242']);
    expect(await status(app)).toEqual({ connected: true, login: 'octocat' });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([
      expect.objectContaining({ userId: creator.userId, login: 'octocat', installationId: '4242' }),
    ]);
  });

  it('refuses a login supplied by the browser', async () => {
    const { app } = await appWith(async () => 'octocat');
    const response = await app.request(
      '/api/v1/github/connect',
      json(creator, { installationId: '1', login: 'someone-else' }),
    );
    expect(response.status).toBe(400);
  });

  it('answers 404 for an installation GitHub does not know and stores nothing', async () => {
    const { app, deps } = await appWith(async () => null);
    const response = await connect(app, '99');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'github_installation_not_found' });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([]);
  });

  it('answers 502 when the lookup fails', async () => {
    const { app } = await appWith(async () => {
      throw new Error('commit service down');
    });
    expect((await connect(app, '7')).status).toBe(502);
  });

  it('refuses an installation already connected by another creator', async () => {
    const { app } = await appWith(async () => 'octocat');
    expect((await connect(app, '4242')).status).toBe(200);
    const response = await connect(app, '4242', other);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'github_installation_in_use' });
    expect(await status(app, other)).toEqual({ connected: false });
    // Reconnecting the same installation by its own creator still works.
    expect((await connect(app, '4242')).status).toBe(200);
  });
});

// The ticket's acceptance run: a real loopback HTTP fake of the commit service behind the production
// lookup and provisioner clients (#280 "Tested head cites a run against the fake commit server").
describe('connect then create against the fake commit server', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('connects from an installation id and then creates a game (201)', async () => {
    const seen: { method: string; url: string; authorization?: string; body?: unknown }[] = [];
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        seen.push({
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        });
        response.setHeader('content-type', 'application/json');
        if (request.method === 'GET' && request.url === '/internal/installations/4242') {
          response.end(JSON.stringify({ login: 'octocat' }));
        } else if (request.method === 'POST' && request.url === '/internal/commit') {
          response.end(JSON.stringify({ ok: true, sha: 'repo-created' }));
        } else {
          response.statusCode = 404;
          response.end(JSON.stringify({ error: 'installation_not_found' }));
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    const deps = makeDeps();
    deps.config.commitInternalUrl = `http://127.0.0.1:${port}`;
    seed(deps);
    const { app } = await makeApp(deps);

    expect((await connect(app, '4242')).status).toBe(200);
    const created = await app.request(
      '/api/v1/games',
      json(creator, { title: 'Castle Game', repoVisibility: 'private' }),
    );
    expect(created.status).toBe(201);
    expect(((await created.json()) as { repo: { owner: string } }).repo.owner).toBe('octocat');

    expect(seen.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET /internal/installations/4242',
      'POST /internal/commit',
    ]);
    expect(seen.every(({ authorization }) => authorization === `Bearer ${deps.config.commitServiceToken}`)).toBe(true);
    expect(seen[1]?.body).toMatchObject({ kind: 'create_repo', owner: 'octocat', visibility: 'private' });
  });
});
