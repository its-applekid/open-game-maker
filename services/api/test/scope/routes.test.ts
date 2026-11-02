import { schema } from '@ogm/db';
import type { AiurClient } from '@ogm/aiur-client';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { asUser, installUsers, makeApp, makeDeps } from '../helpers.js';

const ids = {
  family: 'f_89000000-0000-4000-8000-000000000001',
  creator: 'u_89000000-0000-4000-8000-000000000001',
  player: 'u_89000000-0000-4000-8000-000000000002',
  game: 'g_89000000-0000-4000-8000-000000000001',
};

const choices = {
  genre: 'platformer',
  vibe: 'cozy',
  family: 'chunky-low-poly',
  world: 'floating islands',
  players: 'single',
  pov: 'isometric',
  other: 'A helpful fox runs the workshop.',
};

function setup() {
  const deps = makeDeps();
  const at = '2026-11-01T18:00:00.000Z';
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.creator, createdAt: at })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values([
      { familyId: ids.family, userId: ids.creator, role: 'owner', capability: 'creator', joinedAt: at },
      { familyId: ids.family, userId: ids.player, role: 'member', capability: 'player', joinedAt: at },
    ])
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.creator,
      title: 'Fox Workshop',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: at,
    })
    .run();
  deps.db
    .insert(schema.allowances)
    .values({ familyId: ids.family, userId: ids.creator, dailyMicroUsd: 20_000_000 })
    .run();
  installUsers(deps, [
    {
      kind: 'user',
      userId: ids.creator,
      familyId: ids.family,
      platformRole: 'none',
      capability: 'creator',
      email: 'creator@example.test',
    },
    {
      kind: 'user',
      userId: ids.player,
      familyId: ids.family,
      platformRole: 'none',
      capability: 'player',
      email: 'player@example.test',
    },
  ]);
  return deps;
}

function create(app: Awaited<ReturnType<typeof makeApp>>['app'], userId = ids.creator) {
  return app.request(`/api/v1/games/${ids.game}/scope/sessions`, {
    method: 'POST',
    headers: { ...asUser(userId), 'content-type': 'application/json' },
    body: JSON.stringify({ choices }),
  });
}

describe('scope session routes', () => {
  it('admits one small scope job and returns the existing open session on retry', async () => {
    const deps = setup();
    const { app } = await makeApp(deps);

    const first = await create(app);
    expect(first.status).toBe(201);
    const created = (await first.json()) as { sessionId: string; jobId: string };
    expect(deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, created.jobId)).get()).toMatchObject({
      kind: 'scope',
      complexity: 1,
      state: 'admitted',
    });
    expect(deps.db.select().from(schema.scopeSessions).all()).toHaveLength(1);

    const retry = await create(app);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(created);
    expect(deps.db.select().from(schema.jobs).all()).toHaveLength(1);

    const read = await app.request(`/api/v1/games/${ids.game}/scope/sessions/${created.sessionId}`, {
      headers: asUser(ids.creator),
    });
    expect(await read.json()).toMatchObject({ status: 'open', chatJobId: created.jobId, choices });
  });

  it('refuses a player and abandons an open session with its job', async () => {
    const deps = setup();
    const { app } = await makeApp(deps);
    expect((await create(app, ids.player)).status).toBe(403);

    const created = (await (await create(app)).json()) as { sessionId: string; jobId: string };
    const abandoned = await app.request(`/api/v1/games/${ids.game}/scope/sessions/${created.sessionId}/abandon`, {
      method: 'POST',
      headers: asUser(ids.creator),
    });
    expect(abandoned.status).toBe(200);
    expect(await abandoned.json()).toMatchObject({ status: 'abandoned', chatJobId: created.jobId });
    expect(deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, created.jobId)).get()?.state).toBe('cancelled');
  });

  it('claims a filed session before cancelling its upstream ticket', async () => {
    const deps = setup();
    const { app } = await makeApp(deps);
    const created = (await (await create(app)).json()) as { sessionId: string; jobId: string };
    deps.db
      .update(schema.jobs)
      .set({ state: 'filed', aiurRepo: 'owner/game', aiurIssueNumber: 42 })
      .where(eq(schema.jobs.id, created.jobId))
      .run();
    const cancel = vi.fn(async () => {
      expect(deps.db.select().from(schema.scopeSessions).get()?.status).toBe('abandoned');
      expect(deps.db.select().from(schema.jobs).get()?.state).toBe('cancelled');
    });
    deps.aiurClientForRepo = async () => ({ cancel }) as unknown as AiurClient;

    const abandoned = await app.request(`/api/v1/games/${ids.game}/scope/sessions/${created.sessionId}/abandon`, {
      method: 'POST',
      headers: asUser(ids.creator),
    });

    expect(abandoned.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith('42');
  });
});
