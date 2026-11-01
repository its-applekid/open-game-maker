import { Activity, Rollup } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import type { AppDeps } from '../src/app/types.js';
import { makeApp } from './helpers.js';

const ids = {
  family: 'f_30000000-0000-4000-8000-000000000001',
  otherFamily: 'f_40000000-0000-4000-8000-000000000001',
  user: 'u_30000000-0000-4000-8000-000000000001',
  game: 'g_30000000-0000-4000-8000-000000000001',
  job: 'j_30000000-0000-4000-8000-000000000001',
};

function registerAdmin(deps: AppDeps, role: 'admin' | 'none' = 'admin') {
  deps.registry.principalResolvers.push(async (c) =>
    c.req.header('x-test-user')
      ? {
          kind: 'user',
          userId: ids.user,
          displayName: 'Test User',
          familyId: ids.family,
          platformRole: role,
          capability: 'creator',
        }
      : null,
  );
  deps.registry.gameResolver = async (gameId) =>
    gameId === ids.game ? { familyId: ids.family, ownerId: ids.user, visibility: 'private' } : null;
}

function insert(
  deps: AppDeps,
  input: {
    id: string;
    ts: string;
    boundary: 'start' | 'end' | 'point';
    activity?: string;
    family?: string;
    job?: string | null;
    principalKind?: 'job' | 'user';
    principalId?: string;
  },
) {
  const principalKind = input.principalKind ?? 'job';
  const principalId = input.principalId ?? ids.job;
  deps.sqlite
    .prepare(
      `INSERT INTO activity_events
       (id, ts, received_at, family_id, game_id, job_id, actor, activity, boundary, source, meta_json,
        principal_kind, principal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
    )
    .run(
      input.id,
      input.ts,
      input.ts,
      input.family ?? ids.family,
      ids.game,
      input.job === undefined ? ids.job : input.job,
      principalKind === 'job' ? 'agent' : 'human',
      input.activity ?? 'playtesting',
      input.boundary,
      principalKind === 'job' ? 'skill' : 'editor',
      principalKind,
      principalId,
    );
}

describe('GET /api/v1/analytics/rollups', () => {
  it('aggregates paired and point events with zero defaults inside one family', async () => {
    const { app, deps } = await makeApp();
    registerAdmin(deps);
    insert(deps, { id: 'i_30000000-0000-4000-8000-000000000001', ts: '2026-11-01T01:00:00Z', boundary: 'start' });
    insert(deps, { id: 'i_30000000-0000-4000-8000-000000000002', ts: '2026-11-01T01:00:02Z', boundary: 'end' });
    insert(deps, {
      id: 'i_30000000-0000-4000-8000-000000000003',
      ts: '2026-11-01T01:00:03Z',
      boundary: 'point',
      activity: 'audio',
    });
    insert(deps, { id: 'i_30000000-0000-4000-8000-000000000004', ts: '2026-11-01T01:00:04Z', boundary: 'start' });
    insert(deps, {
      id: 'i_40000000-0000-4000-8000-000000000001',
      ts: '2026-11-01T01:00:01Z',
      boundary: 'point',
      family: ids.otherFamily,
    });

    const params = new URLSearchParams({
      scope: 'game',
      id: ids.game,
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-01T09:00:00Z',
    });
    const response = await app.request(`/api/v1/analytics/rollups?${params}`, {
      headers: { 'x-test-user': '1' },
    });
    expect(response.status).toBe(200);
    const body = Rollup.parse(await response.json());
    expect(body).toMatchObject({ scope: 'game', id: ids.game, builds: 1, usageMicroUsd: null });
    expect(body.byActivity.playtesting).toEqual({ count: 1, durationMs: 2000 });
    expect(body.byActivity.audio).toEqual({ count: 1, durationMs: 0 });
    expect(Object.keys(body.byActivity)).toEqual(Activity.options);
    deps.sqlite.close();
  });

  it('uses principal ownership for member fallback and requires an admin', async () => {
    const { app, deps } = await makeApp();
    registerAdmin(deps);
    insert(deps, {
      id: 'i_30000000-0000-4000-8000-000000000010',
      ts: '2026-11-01T01:00:00Z',
      boundary: 'point',
      job: null,
      principalKind: 'user',
      principalId: ids.user,
    });
    const params = new URLSearchParams({
      scope: 'member',
      id: ids.user,
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-02T00:00:00Z',
    });
    const ok = await app.request(`/api/v1/analytics/rollups?${params}`, { headers: { 'x-test-user': '1' } });
    expect(Rollup.parse(await ok.json()).byActivity.playtesting.count).toBe(1);

    deps.registry.principalResolvers.splice(0);
    registerAdmin(deps, 'none');
    expect((await app.request(`/api/v1/analytics/rollups?${params}`, { headers: { 'x-test-user': '1' } })).status).toBe(
      403,
    );
    deps.sqlite.close();
  });

  it('uses optional job creator ownership and usage without crossing families', async () => {
    const { app, deps } = await makeApp();
    registerAdmin(deps);
    deps.sqlite.exec(
      'CREATE TABLE jobs (id TEXT PRIMARY KEY, family_id TEXT, creator_id TEXT, usage_micro_usd INTEGER)',
    );
    deps.sqlite.prepare('INSERT INTO jobs VALUES (?, ?, ?, ?)').run(ids.job, ids.family, ids.user, 3456);
    insert(deps, {
      id: 'i_30000000-0000-4000-8000-000000000020',
      ts: '2026-11-01T01:00:00Z',
      boundary: 'point',
    });
    const params = new URLSearchParams({
      scope: 'member',
      id: ids.user,
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-02T00:00:00Z',
    });
    const response = await app.request(`/api/v1/analytics/rollups?${params}`, {
      headers: { 'x-test-user': '1' },
    });
    expect(Rollup.parse(await response.json())).toMatchObject({ builds: 1, usageMicroUsd: 3456 });

    const gameParams = new URLSearchParams(params);
    gameParams.set('scope', 'game');
    gameParams.set('id', ids.game);
    const gameResponse = await app.request(`/api/v1/analytics/rollups?${gameParams}`, {
      headers: { 'x-test-user': '1' },
    });
    expect(Rollup.parse(await gameResponse.json())).toMatchObject({
      scope: 'game',
      builds: 1,
      usageMicroUsd: 3456,
    });

    const invalidRange = new URLSearchParams(params);
    invalidRange.set('from', '2026-11-03T00:00:00Z');
    expect(
      (await app.request(`/api/v1/analytics/rollups?${invalidRange}`, { headers: { 'x-test-user': '1' } })).status,
    ).toBe(400);

    deps.registry.gameResolver = async () => ({
      familyId: ids.otherFamily,
      ownerId: ids.user,
      visibility: 'private',
    });
    expect(
      (await app.request(`/api/v1/analytics/rollups?${gameParams}`, { headers: { 'x-test-user': '1' } })).status,
    ).toBe(403);
    deps.sqlite.close();
  });
});
