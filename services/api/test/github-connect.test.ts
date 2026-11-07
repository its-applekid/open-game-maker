import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { schema } from '@ogm/db';
import { afterEach, describe, expect, it } from 'vitest';

import type { GitHubInstallationLookup } from '../src/app/registry.js';
import { GitHubOAuthUnavailableError } from '../src/github/installations.js';
import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

// Creators never connect GitHub: the instance operator installed the App on the instance repository once, so a
// game is created without a github_connections row. The connect routes stay for the maintainer GitHub panel, and
// the connect screen knows only the installation id and the OAuth code GitHub hands back. The commit service alone
// holds the App credentials and answers the login only when that code proves the creator controls the installation.

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
const connect = (app: App, installationId: string, code = 'code-abc', who = creator) =>
  app.request('/api/v1/github/connect', json(who, { installationId, code }));
const status = async (app: App, who = creator) =>
  (await app.request('/api/v1/github/connection', { headers: asUser(who.userId) })).json();

async function appWith(
  loginFor: GitHubInstallationLookup['loginFor'] = async () => 'octocat',
  revalidate: GitHubInstallationLookup['revalidate'] = async () => 'octocat',
) {
  const deps = makeDeps();
  seed(deps);
  deps.registry.githubInstallations = { loginFor, revalidate };
  return { deps, ...(await makeApp(deps)) };
}

describe('GitHub connect routes', () => {
  it('stores the login the authorized installation belongs to and reports it', async () => {
    const proved: [string, string][] = [];
    const { app, deps } = await appWith(async (id, code) => {
      proved.push([id, code]);
      return 'octocat';
    });

    expect(await status(app)).toEqual({ connected: false });
    const response = await connect(app, '4242');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true, login: 'octocat' });
    expect(proved).toEqual([['4242', 'code-abc']]);
    expect(await status(app)).toEqual({ connected: true, login: 'octocat' });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([
      expect.objectContaining({ userId: creator.userId, login: 'octocat', installationId: '4242' }),
    ]);
  });

  it('refuses a login supplied by the browser', async () => {
    const { app } = await appWith();
    const response = await app.request(
      '/api/v1/github/connect',
      json(creator, { installationId: '1', code: 'code-abc', login: 'someone-else' }),
    );
    expect(response.status).toBe(400);
  });

  it('requires the OAuth code GitHub appends to the setup URL', async () => {
    const proved: string[] = [];
    const { app } = await appWith(async (id) => {
      proved.push(id);
      return 'octocat';
    });
    for (const body of [
      { installationId: '4242' },
      { installationId: '4242', code: '' },
      { installationId: '4242', code: 'has space' },
      { installationId: '4242', code: 'x'.repeat(256) },
    ]) {
      expect((await app.request('/api/v1/github/connect', json(creator, body))).status).toBe(400);
    }
    expect(proved).toEqual([]);
  });

  it('refuses ids that are not a safe positive integer before asking GitHub', async () => {
    const proved: string[] = [];
    const { app } = await appWith(async (id) => {
      proved.push(id);
      return 'octocat';
    });
    for (const id of ['0', 'abc', '-1', '1234567890123456']) expect((await connect(app, id)).status).toBe(400);
    expect(proved).toEqual([]);
  });

  it('refuses a player, who cannot create games', async () => {
    const { app, deps } = await appWith();
    installUsers(deps, [{ ...user('u-player'), capability: 'player' }]);
    deps.db
      .insert(schema.familyMembers)
      .values({ familyId, userId: 'u-player', role: 'member', capability: 'player', joinedAt: now })
      .run();
    expect((await connect(app, '4242', 'code-abc', { ...user('u-player'), capability: 'player' })).status).toBe(403);
  });

  it('answers 404 when the code does not prove ownership of the installation', async () => {
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

  it('answers 503 when the App has no OAuth client configured', async () => {
    const { app, deps } = await appWith(async () => {
      throw new GitHubOAuthUnavailableError();
    });
    const response = await connect(app, '4242');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'github_oauth_unavailable' });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([]);
  });

  it('refuses an installation already connected by another creator', async () => {
    const { app } = await appWith();
    expect((await connect(app, '4242')).status).toBe(200);
    const response = await connect(app, '4242', 'code-abc', other);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'github_installation_in_use' });
    expect(await status(app, other)).toEqual({ connected: false });
    // Reconnecting the same installation by its own creator still works.
    expect((await connect(app, '4242')).status).toBe(200);
  });
});

// A stored row goes stale when the App is uninstalled or the account is renamed, so the status read revalidates it.
describe('GitHub connection revalidation', () => {
  it('drops a stored connection GitHub no longer reports', async () => {
    let revalidated: string | null = 'octocat';
    const { app, deps } = await appWith(
      async () => 'octocat',
      async () => revalidated,
    );
    expect((await connect(app, '4242')).status).toBe(200);
    expect(await status(app)).toEqual({ connected: true, login: 'octocat' });

    revalidated = null;
    expect(await status(app)).toEqual({ connected: false });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([]);
  });

  it('reports the login a renamed GitHub account now has', async () => {
    const { app, deps } = await appWith(
      async () => 'old-login',
      async () => 'new-login',
    );
    expect((await connect(app, '4242')).status).toBe(200);

    expect(await status(app)).toEqual({ connected: true, login: 'new-login' });
    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([
      expect.objectContaining({ userId: creator.userId, login: 'new-login' }),
    ]);
  });

  it('keeps the stored connection when GitHub cannot be reached', async () => {
    const { app, deps } = await appWith(
      async () => 'octocat',
      async () => {
        throw new Error('commit service down');
      },
    );
    expect((await connect(app, '4242')).status).toBe(200);

    expect(await status(app)).toEqual({ connected: true, login: 'octocat' });
    expect(deps.db.select().from(schema.githubConnections).all()).toHaveLength(1);
    expect(deps.lines).toContainEqual(expect.objectContaining({ event: 'github-connection-revalidate-failed' }));
  });
});

// The ticket's acceptance run: a real loopback HTTP fake of the commit service behind the production
// lookup and provisioner clients (#280 "Tested head cites a run against the fake commit server").
describe('create against the fake commit server', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('creates a game without a GitHub connection (201)', async () => {
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

    expect(deps.db.select().from(schema.githubConnections).all()).toEqual([]);
    const created = await app.request(
      '/api/v1/games',
      json(creator, { title: 'Castle Game', repoVisibility: 'private' }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { slug: string; repo: { owner: string; name: string; url: string } };
    expect(body.repo).toEqual({
      owner: 'instance',
      name: 'games',
      url: 'https://github.com/instance/games',
    });

    expect(seen.map(({ method, url }) => `${method} ${url}`)).toEqual(['POST /internal/commit']);
    expect(seen.every(({ authorization }) => authorization === `Bearer ${deps.config.commitServiceToken}`)).toBe(true);
    expect(seen[0]?.body).toMatchObject({ kind: 'create_game', slug: body.slug, visibility: 'private' });
  });

  it('proves ownership against the fake commit server end to end', async () => {
    const seen: { method: string; url: string; body?: unknown }[] = [];
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        seen.push({ method: request.method ?? '', url: request.url ?? '', body: raw ? JSON.parse(raw) : undefined });
        response.setHeader('content-type', 'application/json');
        if (request.method === 'POST' && request.url === '/internal/installations/4242/ownership') {
          response.end(JSON.stringify({ login: 'octocat' }));
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

    const response = await connect(app, '4242', 'code-from-github');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true, login: 'octocat' });
    expect(seen).toEqual([
      {
        method: 'POST',
        url: '/internal/installations/4242/ownership',
        body: { code: 'code-from-github' },
      },
    ]);
  });
});
