import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { INTERNAL_TOKEN, makeApp, makeDeps } from './helpers.js';

const now = new Date('2026-11-01T00:00:00.000Z');
const headers = {
  authorization: `Bearer ${INTERNAL_TOKEN}`,
  'x-ogm-service': 'commit',
};

function seed(deps: ReturnType<typeof makeDeps>): void {
  deps.db.insert(schema.user).values([
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
  ]).run();
  deps.db.insert(schema.families).values({
    id: 'family-1',
    name: 'Family',
    ownerUserId: 'u-owner',
    createdAt: now.toISOString(),
  }).run();
  deps.db.insert(schema.familyMembers).values([
    { familyId: 'family-1', userId: 'u-owner', role: 'owner', capability: 'creator', joinedAt: now.toISOString() },
    { familyId: 'family-1', userId: 'u-member', role: 'member', capability: 'player', joinedAt: now.toISOString() },
  ]).run();
  deps.db.insert(schema.games).values({
    id: 'game-1',
    familyId: 'family-1',
    ownerId: 'u-owner',
    title: 'Castle Game',
    visibility: 'private',
    githubOwner: 'alice',
    githubRepo: 'gm-game-1',
    repoVisibility: 'private',
    repoUrl: 'https://github.com/alice/gm-game-1',
    createdAt: now.toISOString(),
  }).run();
}

describe('commit boundary internal routes', () => {
  it('lists active game repositories and returns in-memory PII terms for a game family', async () => {
    const deps = makeDeps();
    seed(deps);
    const { app } = await makeApp(deps);

    const repositories = await app.request('/internal/games/active-repos', { headers });
    expect(repositories.status).toBe(200);
    expect(await repositories.json()).toEqual({
      repositories: [{ gameId: 'game-1', owner: 'alice', name: 'gm-game-1', visibility: 'private' }],
    });

    const terms = await app.request('/internal/games/game-1/pii-terms', { headers });
    expect(terms.status).toBe(200);
    expect(await terms.json()).toEqual({
      terms: ['Alice Example', 'alice@example.com', 'Bob Example', 'bob@example.com'],
    });
  });

  it('allows only the commit service and does not expose unknown games', async () => {
    const deps = makeDeps();
    seed(deps);
    const { app } = await makeApp(deps);

    expect((await app.request('/internal/games/active-repos')).status).toBe(401);
    expect((await app.request('/internal/games/active-repos', {
      headers: { authorization: `Bearer ${INTERNAL_TOKEN}`, 'x-ogm-service': 'builder' },
    })).status).toBe(403);
    expect((await app.request('/internal/games/missing/pii-terms', { headers })).status).toBe(404);
  });
});
