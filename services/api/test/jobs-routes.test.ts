import type { AiurClient } from '@ogm/aiur-client';
import { schema } from '@ogm/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { asUser, installUsers, makeApp, makeDeps } from './helpers.js';

const ids = {
  family: 'f_50000000-0000-4000-8000-000000000001',
  user: 'u_50000000-0000-4000-8000-000000000001',
  game: 'g_50000000-0000-4000-8000-000000000001',
};

const plan = {
  title: 'Goblin camp',
  summary: 'Add the camp',
  scope: { included: ['camp'], excluded: [] },
  tickets: [{ key: 'T1', skills: [], dependsOn: [], acceptanceCriteria: ['loads'] }],
};

function setup(platformRole: 'admin' | 'none' = 'none') {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.user, createdAt: '2026-11-01T16:00:00.000Z' })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values({
      familyId: ids.family,
      userId: ids.user,
      role: 'owner',
      capability: 'creator',
      joinedAt: '2026-11-01T16:00:00.000Z',
    })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.user,
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: '2026-11-01T16:00:00.000Z',
    })
    .run();
  installUsers(deps, [
    {
      kind: 'user',
      userId: ids.user,
      familyId: ids.family,
      platformRole,
      capability: 'creator',
      email: 'creator@example.test',
    },
  ]);
  return deps;
}

async function createJob(app: Awaited<ReturnType<typeof makeApp>>['app'], overrides: Record<string, unknown> = {}) {
  return app.request('/api/v1/jobs', {
    method: 'POST',
    headers: { ...asUser(ids.user), 'content-type': 'application/json' },
    body: JSON.stringify({
      gameId: ids.game,
      branchId: 'main',
      kind: 'feature',
      complexity: 1,
      plan,
      start: 'now',
      ...overrides,
    }),
  });
}

describe('jobs routes', () => {
  it('admits, lists, and reads a job with optional projection fields', async () => {
    const deps = setup();
    deps.db
      .insert(schema.allowances)
      .values({ familyId: ids.family, userId: ids.user, dailyMicroUsd: 20_000_000 })
      .run();
    const { app } = await makeApp(deps);

    const created = await createJob(app);
    expect(created.status).toBe(202);
    const { jobId } = (await created.json()) as { jobId: string };
    deps.db
      .insert(schema.jobProjections)
      .values({
        jobId,
        daemonSlug: 'owner-game',
        ticket: '142',
        stage: 'building',
        stageText: 'Building',
        phase: 'work',
        progressPercent: 40,
        reasonLabels: '[]',
        updatedAt: '2026-11-01T16:00:00.000Z',
      })
      .run();

    const listed = await app.request(`/api/v1/jobs?gameId=${ids.game}`, { headers: asUser(ids.user) });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ jobs: [{ id: jobId, stage: 'building', phase: 'work' }] });
    const read = await app.request(`/api/v1/jobs/${jobId}`, { headers: asUser(ids.user) });
    expect(await read.json()).toMatchObject({ id: jobId, stageText: 'Building', progressPercent: 40 });
  });

  it('returns the allowance refusal body at the top level', async () => {
    const deps = setup();
    deps.db
      .insert(schema.allowances)
      .values({ familyId: ids.family, userId: ids.user, dailyMicroUsd: 5_000_000 })
      .run();
    const { app } = await makeApp(deps);
    const response = await createJob(app, { complexity: 3 });
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: 'allowance_exceeded',
      remainingMicroUsd: 5_000_000,
      offers: ['trim', 'split', 'queue', 'ask_admin'],
    });
  });

  it('edits and cancels only a queued job, releasing its reservation', async () => {
    const deps = setup();
    deps.db
      .insert(schema.allowances)
      .values({ familyId: ids.family, userId: ids.user, dailyMicroUsd: 20_000_000 })
      .run();
    const { app } = await makeApp(deps);
    const created = await createJob(app, { start: 'at_reset' });
    const { jobId } = (await created.json()) as { jobId: string };
    const nextPlan = { ...plan, title: 'Changed camp' };

    const patched = await app.request(`/api/v1/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { ...asUser(ids.user), 'content-type': 'application/json' },
      body: JSON.stringify({ plan: nextPlan }),
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ plan: { title: 'Changed camp' } });

    const cancelled = await app.request(`/api/v1/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: asUser(ids.user),
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ state: 'cancelled' });
    expect(
      deps.db
        .select()
        .from(schema.budgetLedger)
        .all()
        .map(({ kind }) => kind),
    ).toEqual(['reservation', 'release']);
  });

  it('lets an admin raise a filed job cap through its daemon', async () => {
    const deps = setup('admin');
    deps.db
      .insert(schema.allowances)
      .values({ familyId: ids.family, userId: ids.user, dailyMicroUsd: 20_000_000 })
      .run();
    const setSpendCap = vi.fn().mockResolvedValue({ amount: '2.000000', currency: 'USD' });
    deps.aiurClientForRepo = async () => ({ setSpendCap }) as unknown as AiurClient;
    const { app } = await makeApp(deps);
    const created = await createJob(app);
    const { jobId } = (await created.json()) as { jobId: string };
    deps.db
      .update(schema.jobs)
      .set({
        state: 'paused_budget',
        pausedReason: 'budget_exhausted',
        aiurRepo: 'owner/game',
        aiurIssueNumber: 142,
        aiurSpendCapMicroUsd: 1_500_000,
      })
      .where(eq(schema.jobs.id, jobId))
      .run();

    const response = await app.request(`/api/v1/jobs/${jobId}/raise-cap`, {
      method: 'POST',
      headers: { ...asUser(ids.user), 'content-type': 'application/json' },
      body: JSON.stringify({ amountMicroUsd: 2_000_000 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'running', hardCapMicroUsd: 2_000_000 });
    expect(setSpendCap).toHaveBeenCalledWith('142', '2.000000');
  });
});
