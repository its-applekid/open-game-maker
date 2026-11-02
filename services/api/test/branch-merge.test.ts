import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Branch, GameManifest, MergePlan } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { abandonMergePlan, getMergePlan, previewMergePlan } from '../src/branches/merge.js';
import { FsBaseDocSource, type BaseDocSource } from '../src/design/base-doc.js';
import { appendTransaction, ensureMainBranch, resolveBranch } from '../src/design/store.js';
import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

const now = '2026-11-01T20:30:00.000Z';
const ids = {
  family: 'f_01K8Z6Y7X8P9Q0R1S2T3V4W5X6',
  creator: 'u_01K8Z6Y7X8P9Q0R1S2T3V4W5X7',
  other: 'u_01K8Z6Y7X8P9Q0R1S2T3V4W5X8',
  game: 'g_01K8Z6Y7X8P9Q0R1S2T3V4W5X9',
  build: 'build_01K8Z6Y7X8P9Q0R1S2T3V4W5XA',
  entity: 'e_01K8Z6Y7X8P9Q0R1S2T3V4W5XB',
} as const;

const creator: TestUser = {
  kind: 'user',
  userId: ids.creator,
  email: 'creator@example.test',
  familyId: ids.family,
  platformRole: 'none',
  capability: 'creator',
};
const other: TestUser = {
  kind: 'user',
  userId: ids.other,
  email: 'other@example.test',
  familyId: ids.family,
  platformRole: 'none',
  capability: 'creator',
};

function manifest(): GameManifest {
  return {
    id: 'fixture',
    sdk: '^1.0.0',
    title: 'Fixture',
    inputs: { actions: {} },
    presentation: { orientation: 'any', minLogical: { w: 320, h: 180 }, fit: 'responsive' },
    view: 'topdown',
    dimension: '2d',
    capabilities: [],
    palette: { categories: [], items: [] },
    tools: [],
    gizmos: {},
    saves: false,
    controls: [
      {
        id: 'door.locked',
        label: 'Locked',
        scope: 'instance',
        path: '/props/door.locked',
        widget: { kind: 'toggle' },
        default: false,
      },
    ],
    overrides: { aliases: {}, retired: [] },
  } as GameManifest;
}

function writeBuild(root: string) {
  const buildRoot = join(root, ids.game, ids.build);
  mkdirSync(join(buildRoot, 'design'), { recursive: true });
  writeFileSync(
    join(buildRoot, 'design', 'design.json'),
    JSON.stringify({
      schemaVersion: 1,
      globals: {},
      entities: {
        [ids.entity]: {
          id: ids.entity,
          prefab: 'door',
          level: 'level_1',
          origin: 'creator',
          props: { 'door.locked': false },
        },
      },
    }),
  );
  writeFileSync(join(buildRoot, 'manifest.json'), JSON.stringify(manifest()));
}

async function setup() {
  const deps = makeDeps();
  installUsers(deps, [creator, other]);
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.creator, createdAt: now })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values([
      { familyId: ids.family, userId: ids.creator, role: 'owner', capability: 'creator', joinedAt: now },
      { familyId: ids.family, userId: ids.other, role: 'member', capability: 'creator', joinedAt: now },
    ])
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.creator,
      title: 'Merge fixture',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: now,
    })
    .run();
  writeBuild(deps.config.gamesRoot);
  const main = ensureMainBranch(deps.sqlite, ids.game);
  deps.sqlite.prepare('UPDATE branches SET latest_build_id = ? WHERE id = ?').run(ids.build, main.id);
  const { app } = await makeApp(deps);
  const headers = { ...asUser(ids.creator), 'content-type': 'application/json' };
  const created = await app.request(`/api/v1/games/${ids.game}/branches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Branch B' }),
  });
  expect(created.status).toBe(201);
  const branch = (await created.json()) as Branch;

  appendTransaction(deps.sqlite, {
    gameId: ids.game,
    branchId: branch.id,
    baseRev: 0,
    leaseToken: 0,
    actor: ids.creator,
    kind: 'system',
    label: 'Branch explicitly keeps door unlocked',
    baseBuildId: ids.build,
    commands: [],
    patches: [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false }],
    inverse: [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false }],
  });
  appendTransaction(deps.sqlite, {
    gameId: ids.game,
    branchId: main.id,
    baseRev: 0,
    leaseToken: 0,
    actor: ids.creator,
    kind: 'system',
    label: 'Main locks the door',
    baseBuildId: ids.build,
    commands: [],
    patches: [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: true }],
    inverse: [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false }],
  });
  return { app, branch, deps, headers, main: resolveBranch(deps.sqlite, ids.game, 'main') };
}

async function createPlan(context: Awaited<ReturnType<typeof setup>>, target: string, source: string) {
  const response = await context.app.request(`/api/v1/games/${ids.game}/branches/${target}/merges`, {
    method: 'POST',
    headers: context.headers,
    body: JSON.stringify({ sourceBranchId: source }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as MergePlan;
}

async function resolveOurs(context: Awaited<ReturnType<typeof setup>>, target: string, plan: MergePlan) {
  const response = await context.app.request(
    `/api/v1/games/${ids.game}/branches/${target}/merges/${plan.id}/conflicts/${plan.conflicts[0]!.id}`,
    {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ resolution: 'ours' }),
    },
  );
  expect(response.status).toBe(200);
}

async function preview(context: Awaited<ReturnType<typeof setup>>, target: string, plan: MergePlan) {
  return context.app.request(`/api/v1/games/${ids.game}/branches/${target}/merges/${plan.id}/preview`, {
    method: 'POST',
    headers: context.headers,
  });
}

async function lease(context: Awaited<ReturnType<typeof setup>>, target: string) {
  const response = await context.app.request(`/api/v1/games/${ids.game}/branches/${target}/lease`, {
    method: 'POST',
    headers: context.headers,
    body: JSON.stringify({ sessionId: 'merge-screen' }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { token: number };
}

describe('branch merge routes', () => {
  it('plans AE3, previews, lands exactly one merge transaction, and rolls it back', async () => {
    const context = await setup();
    const plan = await createPlan(context, 'main', context.branch.id);
    expect(plan).toMatchObject({
      baseRev: 0,
      status: 'resolving',
      conflicts: [{ kind: 'both_changed', path: `/entities/${ids.entity}/props/door.locked` }],
    });
    expect(
      context.deps.sqlite
        .prepare<[string], { target_head_rev: number }>('SELECT target_head_rev FROM merge_plans WHERE id = ?')
        .get(plan.id),
    ).toEqual({ target_head_rev: 1 });

    const unresolved = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/land`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'merge-screen', token: 1 }),
    });
    expect(unresolved.status).toBe(409);
    expect(await unresolved.json()).toMatchObject({ error: 'unresolved_conflict' });

    await resolveOurs(context, 'main', plan);
    const previewed = await preview(context, 'main', plan);
    expect(previewed.status).toBe(200);
    expect(await previewed.json()).toMatchObject({
      previewBuildId: ids.build,
      rev: 1,
      doc: { entities: { [ids.entity]: { props: { 'door.locked': false } } } },
    });

    const editLease = await lease(context, 'main');
    const landed = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/land`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'merge-screen', token: editLease.token }),
    });
    expect(landed.status).toBe(200);
    expect(await landed.json()).toEqual({ rev: 2 });
    expect(
      context.deps.sqlite
        .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM design_transactions WHERE kind = 'merge'")
        .get(),
    ).toEqual({ count: 1 });
    expect(resolveBranch(context.deps.sqlite, ids.game, context.branch.id).status).toBe('merged');
    const mergedDesign = await context.app.request(`/api/v1/games/${ids.game}/branches/main/design?rev=head`, {
      headers: asUser(ids.creator),
    });
    expect(await mergedDesign.json()).toMatchObject({
      rev: 2,
      doc: { entities: { [ids.entity]: { props: { 'door.locked': false } } } },
    });

    const rolledBack = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/rollback`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'merge-screen', token: editLease.token }),
    });
    expect(rolledBack.status).toBe(200);
    expect(await rolledBack.json()).toEqual({ rev: 3 });
    const design = await context.app.request(`/api/v1/games/${ids.game}/branches/main/design?rev=head`, {
      headers: asUser(ids.creator),
    });
    expect(await design.json()).toMatchObject({
      rev: 3,
      doc: { entities: { [ids.entity]: { props: { 'door.locked': true } } } },
    });
  });

  it('rejects landing when the target moved after planning', async () => {
    const context = await setup();
    const plan = await createPlan(context, 'main', context.branch.id);
    await resolveOurs(context, 'main', plan);
    expect((await preview(context, 'main', plan)).status).toBe(200);
    appendTransaction(context.deps.sqlite, {
      gameId: ids.game,
      branchId: context.main.id,
      baseRev: 1,
      leaseToken: 0,
      actor: ids.creator,
      kind: 'system',
      label: 'Target moved',
      baseBuildId: ids.build,
      commands: [],
      patches: [{ op: 'add', path: ['globals', 'moved'], value: true }],
      inverse: [{ op: 'remove', path: ['globals', 'moved'] }],
    });
    const editLease = await lease(context, 'main');
    const landed = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/land`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'merge-screen', token: editLease.token }),
    });
    expect(landed.status).toBe(409);
    expect(await landed.json()).toEqual({ error: 'target_moved' });
  });

  it('merges main into a branch without changing main status', async () => {
    const context = await setup();
    const plan = await createPlan(context, context.branch.id, 'main');
    await resolveOurs(context, context.branch.id, plan);
    const previewed = await preview(context, context.branch.id, plan);
    expect(await previewed.json()).toMatchObject({
      doc: { entities: { [ids.entity]: { props: { 'door.locked': true } } } },
    });
    const editLease = await lease(context, context.branch.id);
    const landed = await context.app.request(
      `/api/v1/games/${ids.game}/branches/${context.branch.id}/merges/${plan.id}/land`,
      {
        method: 'POST',
        headers: context.headers,
        body: JSON.stringify({ sessionId: 'merge-screen', token: editLease.token }),
      },
    );
    expect(landed.status).toBe(200);
    expect(resolveBranch(context.deps.sqlite, ids.game, 'main').status).toBe('active');
    expect(resolveBranch(context.deps.sqlite, ids.game, context.branch.id).status).toBe('active');
  });

  it('gets, resolves all, previews, and abandons a plan without landing it', async () => {
    const context = await setup();
    const plan = await createPlan(context, 'main', context.branch.id);
    const fetched = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}`, {
      headers: asUser(ids.creator),
    });
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ id: plan.id, status: 'resolving' });

    const invalidBoth = await context.app.request(
      `/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/conflicts/${plan.conflicts[0]!.id}`,
      {
        method: 'POST',
        headers: context.headers,
        body: JSON.stringify({ resolution: 'both' }),
      },
    );
    expect(invalidBoth.status).toBe(422);

    const resolved = await context.app.request(
      `/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/resolve-all`,
      {
        method: 'POST',
        headers: context.headers,
        body: JSON.stringify({ resolution: 'ours' }),
      },
    );
    expect(resolved.status).toBe(200);
    expect((await resolved.json()) as MergePlan).toMatchObject({
      conflicts: [{ resolution: 'ours' }],
      status: 'resolving',
    });
    expect((await preview(context, 'main', plan)).status).toBe(200);

    const abandoned = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges/${plan.id}/abandon`, {
      method: 'POST',
      headers: context.headers,
    });
    expect(abandoned.status).toBe(200);
    expect(await abandoned.json()).toMatchObject({ status: 'abandoned' });
    expect(
      context.deps.sqlite
        .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM design_transactions WHERE kind = 'merge'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('does not let a slow preview overwrite a concurrent abandon', async () => {
    const context = await setup();
    const plan = await createPlan(context, 'main', context.branch.id);
    await resolveOurs(context, 'main', plan);
    const baseSource = new FsBaseDocSource(context.deps.config.gamesRoot);
    let releaseManifest!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const manifestGate = new Promise<void>((resolve) => {
      releaseManifest = resolve;
    });
    const slowSource: BaseDocSource = {
      load: (gameId, buildId) => baseSource.load(gameId, buildId),
      manifest: async (gameId, buildId) => {
        markStarted();
        await manifestGate;
        return baseSource.manifest(gameId, buildId);
      },
    };

    const previewing = previewMergePlan(context.deps.sqlite, slowSource, ids.game, plan.id);
    await started;
    abandonMergePlan(context.deps.sqlite, ids.game, plan.id);
    releaseManifest();

    await expect(previewing).rejects.toMatchObject({ status: 'abandoned' });
    expect(getMergePlan(context.deps.sqlite, ids.game, plan.id).status).toBe('abandoned');
  });

  it('returns the established 413 response when combined merge patches are too large', async () => {
    const context = await setup();
    const plan = await createPlan(context, 'main', context.branch.id);
    const oversizedPlan: MergePlan = {
      ...plan,
      auto: [{ op: 'add', path: ['globals', 'large'], value: 'x'.repeat(256 * 1024) }],
      conflicts: [],
      status: 'planned',
    };
    context.deps.sqlite
      .prepare('UPDATE merge_plans SET plan_json = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(oversizedPlan), oversizedPlan.status, plan.id);

    const response = await preview(context, 'main', oversizedPlan);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'patch_too_large' });
  });

  it('requires game edit permission for merge plans', async () => {
    const context = await setup();
    const response = await context.app.request(`/api/v1/games/${ids.game}/branches/main/merges`, {
      method: 'POST',
      headers: { ...asUser(ids.other), 'content-type': 'application/json' },
      body: JSON.stringify({ sourceBranchId: context.branch.id }),
    });
    expect(response.status).toBe(403);
  });
});
