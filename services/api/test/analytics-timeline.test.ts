import { BuildTimeline } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import type { AppDeps } from '../src/app/types.js';
import { recordAiurPhase } from '../src/analytics/phases.js';
import { makeApp } from './helpers.js';

const ids = {
  family: 'f_10000000-0000-4000-8000-000000000001',
  otherFamily: 'f_20000000-0000-4000-8000-000000000001',
  user: 'u_10000000-0000-4000-8000-000000000001',
  game: 'g_10000000-0000-4000-8000-000000000001',
  job: 'j_10000000-0000-4000-8000-000000000001',
};

function registerUser(deps: AppDeps, role: 'admin' | 'none' = 'admin') {
  deps.registry.principalResolvers.push(async (c) =>
    c.req.header('x-test-user')
      ? { kind: 'user', userId: ids.user, familyId: ids.family, platformRole: role, capability: 'creator' }
      : null,
  );
}

function insertEvent(
  deps: AppDeps,
  input: { id: string; ts: string; boundary: string; familyId?: string; activity?: string },
) {
  deps.sqlite
    .prepare(
      `INSERT INTO activity_events
       (id, ts, received_at, family_id, game_id, job_id, actor, activity, boundary, source, meta_json,
        principal_kind, principal_id)
       VALUES (?, ?, ?, ?, ?, ?, 'agent', ?, ?, 'skill', '{}', 'job', ?)`,
    )
    .run(
      input.id,
      input.ts,
      input.ts,
      input.familyId ?? ids.family,
      ids.game,
      ids.job,
      input.activity ?? 'playtesting',
      input.boundary,
      ids.job,
    );
}

describe('analytics timelines', () => {
  it('pairs activities deterministically and returns optional job metrics', async () => {
    const { app, deps } = await makeApp();
    registerUser(deps);
    const events = [
      ['i_10000000-0000-4000-8000-000000000001', '2026-11-01T01:00:00.000Z', 'start'],
      ['i_10000000-0000-4000-8000-000000000002', '2026-11-01T01:00:02.000Z', 'end'],
      ['i_10000000-0000-4000-8000-000000000003', '2026-11-01T01:00:03.000Z', 'start'],
      ['i_10000000-0000-4000-8000-000000000004', '2026-11-01T01:00:04.000Z', 'start'],
      ['i_10000000-0000-4000-8000-000000000005', '2026-11-01T01:00:05.000Z', 'point'],
      ['i_10000000-0000-4000-8000-000000000006', '2026-11-01T01:00:06.000Z', 'end'],
      ['i_10000000-0000-4000-8000-000000000007', '2026-11-01T01:00:07.000Z', 'start'],
    ] as const;
    for (const [id, ts, boundary] of events) insertEvent(deps, { id, ts, boundary });

    recordAiurPhase(deps.db, {
      jobId: ids.job,
      phase: 'work',
      at: '2026-11-01T01:00:00-07:00',
      transition: 'rework',
      source: 'events_feed',
    });
    recordAiurPhase(deps.db, {
      jobId: ids.job,
      phase: 'work',
      at: '2026-11-01T08:00:00.000Z',
      transition: 'rework',
      source: 'events_feed',
    });
    expect(deps.sqlite.prepare('SELECT count(*) FROM aiur_phase_events').pluck().get()).toBe(1);
    expect(() =>
      recordAiurPhase(deps.db, {
        jobId: ids.job,
        phase: 'ship' as 'work',
        at: '2026-11-01T08:00:00.000Z',
        source: 'events_feed',
      }),
    ).toThrow();

    const withoutJobs = await app.request(`/api/v1/analytics/builds/${ids.job}/timeline`, {
      headers: { 'x-test-user': '1' },
    });
    expect(withoutJobs.status).toBe(200);
    const body = BuildTimeline.parse(await withoutJobs.json());
    expect(body.aiur).toMatchObject({ usageMicroUsd: null, retries: null });
    expect(body.aiur.phases).toEqual([{ phase: 'work', at: '2026-11-01T08:00:00.000Z', transition: 'rework' }]);
    expect(body.activities.map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([
      ['2026-11-01T01:00:00.000Z', '2026-11-01T01:00:02.000Z'],
      ['2026-11-01T01:00:03.000Z', '2026-11-01T01:00:04.000Z'],
      ['2026-11-01T01:00:04.000Z', '2026-11-01T01:00:06.000Z'],
      ['2026-11-01T01:00:05.000Z', '2026-11-01T01:00:05.000Z'],
      ['2026-11-01T01:00:07.000Z', null],
    ]);

    deps.sqlite.exec(
      'CREATE TABLE jobs (id TEXT PRIMARY KEY, family_id TEXT, creator_id TEXT, usage_micro_usd INTEGER)',
    );
    deps.sqlite.prepare('INSERT INTO jobs VALUES (?, ?, ?, ?)').run(ids.job, ids.family, ids.user, 1234);
    const withJobs = await app.request(`/api/v1/analytics/builds/${ids.job}/timeline`, {
      headers: { 'x-test-user': '1' },
    });
    expect((await withJobs.json()).aiur).toMatchObject({ usageMicroUsd: 1234, retries: 1 });
    deps.sqlite.close();
  });

  it('requires an admin in the build family', async () => {
    const { app, deps } = await makeApp();
    registerUser(deps, 'none');
    insertEvent(deps, {
      id: 'i_10000000-0000-4000-8000-000000000010',
      ts: '2026-11-01T01:00:00.000Z',
      boundary: 'point',
    });
    expect(
      (await app.request(`/api/v1/analytics/builds/${ids.job}/timeline`, { headers: { 'x-test-user': '1' } })).status,
    ).toBe(403);

    deps.registry.principalResolvers.splice(0);
    registerUser(deps, 'admin');
    deps.sqlite.prepare('UPDATE activity_events SET family_id = ?').run(ids.otherFamily);
    expect(
      (await app.request(`/api/v1/analytics/builds/${ids.job}/timeline`, { headers: { 'x-test-user': '1' } })).status,
    ).toBe(403);

    expect(
      (
        await app.request('/api/v1/analytics/builds/j_99999999-9999-4999-8999-999999999999/timeline', {
          headers: { 'x-test-user': '1' },
        })
      ).status,
    ).toBe(404);
    deps.sqlite.close();
  });
});
