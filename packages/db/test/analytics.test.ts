import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { activityEvents, aiurPhaseEvents } from '../src/schema/index.js';

describe('analytics storage', () => {
  it('migrates the analytics tables and indexes once', () => {
    const { sqlite, db } = openDb(':memory:');
    expect(migrate({ sqlite }).applied).toContain('20261101145358_analytics.sql');

    expect(db.select().from(activityEvents).all()).toEqual([]);
    expect(db.select().from(aiurPhaseEvents).all()).toEqual([]);
    expect(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND tbl_name = 'activity_events' AND name NOT LIKE 'sqlite_autoindex%'
           ORDER BY name`,
        )
        .pluck()
        .all(),
    ).toEqual(['activity_events_family_ts_idx', 'activity_events_game_ts_idx', 'activity_events_job_ts_idx']);
    expect(migrate({ sqlite }).applied).toEqual([]);
    sqlite.close();
  });

  it('rejects activity values outside the fixed taxonomy', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO activity_events
            (id, ts, received_at, family_id, game_id, actor, activity, boundary, source, meta_json,
             principal_kind, principal_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'i_00000000-0000-4000-8000-000000000001',
          '2026-11-01T00:00:00.000Z',
          '2026-11-01T00:00:00.000Z',
          'f_00000000-0000-4000-8000-000000000001',
          'g_00000000-0000-4000-8000-000000000001',
          'agent',
          'prompt_dump',
          'point',
          'skill',
          '{}',
          'job',
          'j_00000000-0000-4000-8000-000000000001',
        ),
    ).toThrow(/CHECK constraint failed/);
    sqlite.close();
  });
});
