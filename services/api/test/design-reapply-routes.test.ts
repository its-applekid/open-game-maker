import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GameManifest } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { ensureMainBranch } from '../src/design/store.js';
import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

const now = '2026-11-01T21:00:00.000Z';
const ids = {
  family: 'f_01K8Z6Y7X8P9Q0R1S2T3V4W5X6',
  creator: 'u_01K8Z6Y7X8P9Q0R1S2T3V4W5X7',
  game: 'g_01K8Z6Y7X8P9Q0R1S2T3V4W5X9',
  from: 'build_01K8Z6Y7X8P9Q0R1S2T3V4W5XA',
  to: 'build_01K8Z6Y7X8P9Q0R1S2T3V4W5XB',
  failed: 'build_01K8Z6Y7X8P9Q0R1S2T3V4W5XC',
} as const;

const creator: TestUser = {
  kind: 'user',
  userId: ids.creator,
  email: 'creator@example.test',
  familyId: ids.family,
  platformRole: 'none',
  capability: 'creator',
};

function manifest(options: { max: number; default: number; seq: number; status?: string }): GameManifest {
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
    overrides: { aliases: {}, retired: [] },
    seq: options.seq,
    status: options.status ?? 'tested',
    controls: [
      {
        id: 'world.gravity',
        label: 'Gravity',
        scope: 'global',
        path: '/globals/world.gravity',
        widget: { kind: 'slider', min: 0, max: options.max },
        default: options.default,
      },
    ],
  } as GameManifest;
}

function writeBuild(root: string, buildId: string, gravity: number, value: GameManifest) {
  const buildRoot = join(root, ids.game, buildId);
  mkdirSync(join(buildRoot, 'design'), { recursive: true });
  writeFileSync(
    join(buildRoot, 'design', 'design.json'),
    JSON.stringify({ schemaVersion: 1, globals: { 'world.gravity': gravity }, entities: {} }),
  );
  writeFileSync(join(buildRoot, 'manifest.json'), JSON.stringify(value));
}

async function setup() {
  const deps = makeDeps();
  installUsers(deps, [creator]);
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.creator, createdAt: now })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values({ familyId: ids.family, userId: ids.creator, role: 'owner', capability: 'creator', joinedAt: now })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.creator,
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: now,
    })
    .run();
  writeBuild(deps.config.gamesRoot, ids.from, 1, manifest({ max: 20, default: 1, seq: 13 }));
  writeBuild(deps.config.gamesRoot, ids.to, 4, manifest({ max: 10, default: 4, seq: 14 }));
  writeBuild(deps.config.gamesRoot, ids.failed, 5, manifest({ max: 10, default: 5, seq: 15, status: 'failed' }));
  const branch = ensureMainBranch(deps.sqlite, ids.game);
  deps.sqlite.prepare('UPDATE branches SET latest_build_id = ? WHERE id = ?').run(ids.from, branch.id);
  const { app } = await makeApp(deps);
  const branchUrl = `/api/v1/games/${ids.game}/branches/main`;
  const headers = { ...asUser(ids.creator), 'content-type': 'application/json' };
  const leaseResponse = await app.request(`${branchUrl}/lease`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId: 'browser-one' }),
  });
  const lease = (await leaseResponse.json()) as { token: number };
  return { app, deps, branch, branchUrl, headers, lease };
}

async function setGravity(context: Awaited<ReturnType<typeof setup>>, value: number) {
  const response = await context.app.request(`${context.branchUrl}/transactions`, {
    method: 'POST',
    headers: context.headers,
    body: JSON.stringify({
      baseRev: 0,
      leaseToken: context.lease.token,
      sessionId: 'browser-one',
      kind: 'manual',
      label: `Set gravity to ${value}`,
      baseBuildId: ids.from,
      commands: [{ op: 'set', control: 'world.gravity', targets: 'global', value }],
      patches: [{ op: 'replace', path: ['globals', 'world.gravity'], value }],
      inverse: [{ op: 'replace', path: ['globals', 'world.gravity'], value: 1 }],
    }),
  });
  expect(response.status).toBe(200);
}

describe('design reapply routes', () => {
  it('answers a choice and switches to one tested-build transaction with the rebased design', async () => {
    const context = await setup();
    await setGravity(context, 15);

    const reportResponse = await context.app.request(`${context.branchUrl}/reapply/${ids.to}`, {
      headers: asUser(ids.creator),
    });
    expect(reportResponse.status).toBe(200);
    expect(await reportResponse.json()).toMatchObject({
      needsChoice: [{ key: 'world.gravity@global', mine: 15, allowed: 10 }],
    });

    const answered = await context.app.request(`${context.branchUrl}/reapply/${ids.to}/answers`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({
        sessionId: 'browser-one',
        token: context.lease.token,
        answers: [{ key: 'world.gravity@global', choice: 'use_allowed' }],
      }),
    });
    expect(answered.status).toBe(200);
    const refreshed = await context.app.request(`${context.branchUrl}/reapply/${ids.to}`, {
      headers: asUser(ids.creator),
    });
    expect(await refreshed.json()).toMatchObject({ carried: ['world.gravity@global'], needsChoice: [] });

    const switched = await context.app.request(`${context.branchUrl}/switch`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'browser-one', token: context.lease.token, buildId: ids.to }),
    });
    expect(switched.status).toBe(200);
    expect(await switched.json()).toMatchObject({ rev: 3 });

    const rows = context.deps.sqlite
      .prepare<[], { kind: string; label: string; base_build_id: string }>(
        'SELECT kind, label, base_build_id FROM design_transactions ORDER BY rev',
      )
      .all();
    expect(rows).toEqual([
      { kind: 'manual', label: 'Set gravity to 15', base_build_id: ids.from },
      { kind: 'system', label: 'Resolved world.gravity', base_build_id: ids.to },
      { kind: 'system', label: 'Switched to build 14', base_build_id: ids.to },
    ]);
    expect(
      context.deps.sqlite
        .prepare<[string], { latest_build_id: string }>('SELECT latest_build_id FROM branches WHERE id = ?')
        .get(context.branch.id),
    ).toEqual({ latest_build_id: ids.to });
    const designResponse = await context.app.request(`${context.branchUrl}/design?rev=head`, {
      headers: asUser(ids.creator),
    });
    expect(await designResponse.json()).toEqual({
      rev: 3,
      buildId: ids.to,
      doc: { schemaVersion: 1, globals: { 'world.gravity': 10 }, entities: {} },
    });
  });

  it('rejects unknown answers, missing leases, and non-tested builds', async () => {
    const context = await setup();
    await setGravity(context, 15);
    const malformed = await context.app.request(`${context.branchUrl}/reapply/not-a-build`, {
      headers: asUser(ids.creator),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: 'invalid_request' });

    const unknown = await context.app.request(`${context.branchUrl}/reapply/${ids.to}/answers`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({
        sessionId: 'browser-one',
        token: context.lease.token,
        answers: [{ key: 'door.locked@global', choice: 'use_allowed' }],
      }),
    });
    expect(unknown.status).toBe(409);

    const noLease = await context.app.request(`${context.branchUrl}/switch`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'other-browser', token: context.lease.token, buildId: ids.to }),
    });
    expect(noLease.status).toBe(423);

    const failed = await context.app.request(`${context.branchUrl}/switch`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'browser-one', token: context.lease.token, buildId: ids.failed }),
    });
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ error: 'build_not_tested' });

    writeFileSync(
      join(context.deps.config.gamesRoot, ids.game, ids.to, 'manifest.json'),
      JSON.stringify({ overrides: { aliases: {}, retired: [] } }),
    );
    const invalidManifest = await context.app.request(`${context.branchUrl}/switch`, {
      method: 'POST',
      headers: context.headers,
      body: JSON.stringify({ sessionId: 'browser-one', token: context.lease.token, buildId: ids.to }),
    });
    expect(invalidManifest.status).toBe(422);
    expect(await invalidManifest.json()).toEqual({
      error: 'build_manifest_invalid',
      details: { buildId: ids.to },
    });
  });
});
