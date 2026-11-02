import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { CommitServiceRepoProvisioner, NullRepoProvisioner } from '../src/games/repo-provisioner.js';
import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

const now = '2026-11-01T00:00:00.000Z';
const familyId = 'f-family';
const creator: TestUser = {
  kind: 'user',
  userId: 'u-creator',
  displayName: 'Creator',
  email: 'creator@example.com',
  familyId,
  platformRole: 'none',
  capability: 'creator',
};
const admin: TestUser = {
  kind: 'user',
  userId: 'u-admin',
  displayName: 'Admin',
  email: 'admin@example.com',
  familyId,
  platformRole: 'admin',
  capability: 'creator',
};
const player: TestUser = {
  kind: 'user',
  userId: 'u-player',
  displayName: 'Player',
  email: 'player@example.com',
  familyId,
  platformRole: 'none',
  capability: 'player',
};

function seedFamily(deps: ReturnType<typeof makeDeps>) {
  installUsers(deps, [creator, admin, player]);
  deps.db
    .insert(schema.families)
    .values({ id: familyId, name: 'Household', ownerUserId: admin.userId, createdAt: now })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values([
      { familyId, userId: admin.userId, role: 'owner', capability: 'creator', joinedAt: now },
      { familyId, userId: creator.userId, role: 'member', capability: 'creator', joinedAt: now },
      { familyId, userId: player.userId, role: 'member', capability: 'player', joinedAt: now },
    ])
    .run();
}

async function connect(app: Awaited<ReturnType<typeof makeApp>>['app'], user = creator) {
  return app.request('/api/v1/github/connect', {
    method: 'POST',
    headers: { ...asUser(user.userId), 'content-type': 'application/json' },
    body: JSON.stringify({ installationId: '12345' }),
  });
}

async function createGame(app: Awaited<ReturnType<typeof makeApp>>['app'], user = creator) {
  return app.request('/api/v1/games', {
    method: 'POST',
    headers: { ...asUser(user.userId), 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Castle Game', repoVisibility: 'private' }),
  });
}

describe('games routes', () => {
  it('provisions and stores a creator game, then resolves it through the registry', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    const provisioner = new NullRepoProvisioner();
    deps.registry.repoProvisioner = provisioner;
    deps.registry.githubInstallations = { loginFor: async () => 'creator-gh' };
    const { app } = await makeApp(deps);

    expect((await connect(app)).status).toBe(200);
    const response = await createGame(app);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; repo: { owner: string; name: string; url: string } };
    expect(body.repo).toEqual({
      owner: 'creator-gh',
      name: `gm-${body.id}`,
      url: `https://github.com/creator-gh/gm-${body.id}`,
    });
    expect(provisioner.calls).toEqual([
      {
        id: body.id,
        title: 'Castle Game',
        owner: { login: 'creator-gh', installationId: '12345' },
        visibility: 'private',
      },
    ]);
    expect(deps.db.select().from(schema.games).get()).toMatchObject({
      id: body.id,
      ownerId: creator.userId,
      githubOwner: 'creator-gh',
      githubRepo: `gm-${body.id}`,
      repoUrl: `https://github.com/creator-gh/gm-${body.id}`,
    });
    await expect(deps.registry.gameResolver?.(body.id)).resolves.toEqual({
      familyId,
      ownerId: creator.userId,
      visibility: 'private',
    });
  });

  it('refuses game creation by a player before provisioning', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    const provisioner = new NullRepoProvisioner();
    deps.registry.repoProvisioner = provisioner;
    const { app } = await makeApp(deps);
    const response = await createGame(app, player);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'creator_required' });
    expect(provisioner.calls).toEqual([]);
  });

  it('requires a GitHub connection before creating a game row', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    deps.registry.repoProvisioner = new NullRepoProvisioner();
    const { app } = await makeApp(deps);
    const response = await createGame(app);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'github_not_connected' });
    expect(deps.db.select().from(schema.games).all()).toEqual([]);
  });

  it('refuses an admin patch of another adult game', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    deps.db
      .insert(schema.games)
      .values({
        id: 'g-owned',
        familyId,
        ownerId: creator.userId,
        title: 'Original',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: now,
      })
      .run();
    const { app } = await makeApp(deps);
    const response = await app.request('/api/v1/games/g-owned', {
      method: 'PATCH',
      headers: { ...asUser(admin.userId), 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Taken over' }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_owner' });
  });

  it('keeps a failed provision row and lets its owner retry', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    deps.registry.repoProvisioner = {
      provision: async () => {
        throw new Error('commit service unavailable');
      },
    };
    deps.registry.githubInstallations = { loginFor: async () => 'creator-gh' };
    const { app } = await makeApp(deps);
    await connect(app);
    const failed = await createGame(app);
    expect(failed.status).toBe(502);
    const failure = (await failed.json()) as { error: string; details: { gameId: string } };
    expect(failure).toEqual({
      error: 'repo_provisioning_failed',
      details: { gameId: expect.stringMatching(/^g_/) },
    });
    const row = deps.db.select().from(schema.games).get();
    expect(row).toMatchObject({ repoUrl: null, ownerId: creator.userId });
    expect(failure.details.gameId).toBe(row?.id);

    deps.registry.repoProvisioner = new NullRepoProvisioner();
    const retried = await app.request(`/api/v1/games/${row?.id}/provision`, {
      method: 'POST',
      headers: asUser(creator.userId),
    });
    expect(retried.status).toBe(200);
    expect(deps.db.select().from(schema.games).get()?.repoUrl).toContain('https://github.com/creator-gh/');
  });

  it('lists family-visible games plus the caller private games', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    deps.db
      .insert(schema.games)
      .values([
        {
          id: 'g-listed',
          familyId,
          ownerId: admin.userId,
          title: 'Listed',
          visibility: 'listed',
          repoVisibility: 'private',
          createdAt: now,
        },
        {
          id: 'g-private-own',
          familyId,
          ownerId: creator.userId,
          title: 'Mine',
          visibility: 'private',
          repoVisibility: 'private',
          createdAt: now,
        },
        {
          id: 'g-private-other',
          familyId,
          ownerId: admin.userId,
          title: 'Hidden',
          visibility: 'private',
          repoVisibility: 'private',
          createdAt: now,
        },
      ])
      .run();
    const { app } = await makeApp(deps);
    const response = await app.request('/api/v1/games', { headers: asUser(creator.userId) });
    expect(((await response.json()) as { games: { id: string }[] }).games.map(({ id }) => id).sort()).toEqual([
      'g-listed',
      'g-private-own',
    ]);
  });

  it('does not load or list a caller-owned game from another family', async () => {
    const deps = makeDeps();
    seedFamily(deps);
    deps.db
      .insert(schema.families)
      .values({ id: 'f-other', name: 'Other', ownerUserId: 'u-other', createdAt: now })
      .run();
    deps.db
      .insert(schema.games)
      .values({
        id: 'g-other',
        familyId: 'f-other',
        ownerId: creator.userId,
        title: 'Old family game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: now,
      })
      .run();
    const { app } = await makeApp(deps);
    const listed = await app.request('/api/v1/games', { headers: asUser(creator.userId) });
    expect(await listed.json()).toEqual({ games: [] });
    const fetched = await app.request('/api/v1/games/g-other', { headers: asUser(creator.userId) });
    expect(fetched.status).toBe(404);
    expect(await fetched.json()).toEqual({ error: 'game_not_found' });
  });
});

describe('CommitServiceRepoProvisioner', () => {
  it('posts create_repo with the service token and derives the repository URL', async () => {
    const requests: { input: string; init?: RequestInit }[] = [];
    const provisioner = new CommitServiceRepoProvisioner({
      baseUrl: 'http://127.0.0.1:4301',
      token: 'secret-token',
      templateRef: 'templates/custom@v2',
      fetch: async (input, init) => {
        requests.push({ input: String(input), init });
        return new Response(JSON.stringify({ ok: true, sha: 'abc' }), { status: 200 });
      },
    });
    await expect(
      provisioner.provision({
        id: 'g-1',
        title: 'Castle',
        owner: { login: 'maker', installationId: '999' },
        visibility: 'public',
      }),
    ).resolves.toEqual({ owner: 'maker', repo: 'gm-g-1', url: 'https://github.com/maker/gm-g-1' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe('http://127.0.0.1:4301/internal/commit');
    expect(requests[0]?.init?.headers).toMatchObject({ authorization: 'Bearer secret-token' });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      kind: 'create_repo',
      gameId: 'g-1',
      owner: 'maker',
      visibility: 'public',
      templateRef: 'templates/custom@v2',
    });
  });
});
