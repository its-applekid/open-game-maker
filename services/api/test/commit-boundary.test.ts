import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { INTERNAL_TOKEN, makeApp, makeDeps } from './helpers.js';

const now = new Date('2026-11-01T00:00:00.000Z');
const headers = {
  authorization: `Bearer ${INTERNAL_TOKEN}`,
  'x-ogm-service': 'commit',
};

function seed(deps: ReturnType<typeof makeDeps>): void {
  deps.db
    .insert(schema.user)
    .values([
      {
        id: 'u-owner',
        name: 'Alice Example',
        email: 'alice@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'u-member',
        name: 'Bob Example',
        email: 'bob@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
  deps.db
    .insert(schema.families)
    .values({
      id: 'family-1',
      name: 'Family',
      ownerUserId: 'u-owner',
      createdAt: now.toISOString(),
    })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values([
      { familyId: 'family-1', userId: 'u-owner', role: 'owner', capability: 'creator', joinedAt: now.toISOString() },
      { familyId: 'family-1', userId: 'u-member', role: 'member', capability: 'player', joinedAt: now.toISOString() },
    ])
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: 'game-1',
      familyId: 'family-1',
      ownerId: 'u-owner',
      title: 'Castle Game',
      slug: 'castle-game',
      visibility: 'private',
      githubOwner: 'instance',
      githubRepo: 'games',
      githubPath: 'games/castle-game',
      repoVisibility: 'private',
      repoUrl: 'https://github.com/instance/games',
      createdAt: now.toISOString(),
    })
    .run();
}

describe('commit boundary internal routes', () => {
  it('lists active game repositories and returns in-memory PII terms for a game family', async () => {
    const deps = makeDeps();
    seed(deps);
    const { app } = await makeApp(deps);

    const repositories = await app.request('/internal/games/active-repos', { headers });
    expect(repositories.status).toBe(200);
    expect(await repositories.json()).toEqual({
      repositories: [
        {
          gameId: 'game-1',
          owner: 'instance',
          name: 'games',
          visibility: 'private',
          path: 'games/castle-game',
          slug: 'castle-game',
        },
      ],
    });

    const terms = await app.request('/internal/games/game-1/pii-terms', { headers });
    expect(terms.status).toBe(200);
    expect(await terms.json()).toEqual({
      terms: ['Alice Example', 'alice@example.com', 'Bob Example', 'bob@example.com'],
    });
  });

  it('resolves one game to its folder in the instance repository', async () => {
    const deps = makeDeps();
    seed(deps);
    // A row written before the instance monorepo has no recorded folder: it falls back to the slug and the instance repo.
    deps.db
      .insert(schema.games)
      .values({
        id: 'game-legacy',
        familyId: 'family-1',
        ownerId: 'u-owner',
        title: 'Legacy',
        slug: 'legacy-game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: now.toISOString(),
      })
      .run();
    const { app } = await makeApp(deps);

    const registered = await app.request('/internal/games/game-1/repo', { headers });
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({
      gameId: 'game-1',
      owner: 'instance',
      name: 'games',
      visibility: 'private',
      path: 'games/castle-game',
      slug: 'castle-game',
    });

    expect(await (await app.request('/internal/games/game-legacy/repo', { headers })).json()).toMatchObject({
      gameId: 'game-legacy',
      owner: 'instance',
      name: 'games',
      path: 'games/legacy-game',
      slug: 'legacy-game',
    });
    expect((await app.request('/internal/games/missing/repo', { headers })).status).toBe(404);
  });

  it('allows only the commit service and does not expose unknown games', async () => {
    const deps = makeDeps();
    seed(deps);
    const { app } = await makeApp(deps);

    expect((await app.request('/internal/games/active-repos')).status).toBe(401);
    expect(
      (
        await app.request('/internal/games/active-repos', {
          headers: { authorization: `Bearer ${INTERNAL_TOKEN}`, 'x-ogm-service': 'builder' },
        })
      ).status,
    ).toBe(403);
    expect((await app.request('/internal/games/missing/pii-terms', { headers })).status).toBe(404);
  });
});
