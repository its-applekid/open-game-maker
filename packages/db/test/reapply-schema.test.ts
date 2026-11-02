import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { reapplyReports } from '../src/schema/index.js';

describe('reapply report schema', () => {
  it('stores one report per branch and destination build', () => {
    const { sqlite, db } = openDb(':memory:');
    migrate({ sqlite });
    sqlite
      .prepare(`INSERT INTO families (id, name, owner_user_id, created_at) VALUES ('f_1', 'Family', 'u_1', 'now')`)
      .run();
    sqlite
      .prepare(
        `INSERT INTO games
           (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
         VALUES ('g_1', 'f_1', 'u_1', 'Game', 'private', 'private', 'now')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO branches
           (id, game_id, name, git_ref, head_rev, latest_build_id, status, created_by, created_at)
         VALUES ('b_1', 'g_1', 'main', 'refs/heads/main', 0, 'build_1', 'active', 'u_1', 'now')`,
      )
      .run();

    const row = {
      gameId: 'g_1',
      branchId: 'b_1',
      fromBuildId: 'build_1',
      toBuildId: 'build_2',
      reportJson: '{"carried":[]}',
      computedAt: '2026-11-01T20:00:00.000Z',
    };
    db.insert(reapplyReports).values(row).run();
    expect(() =>
      db
        .insert(reapplyReports)
        .values({ ...row, reportJson: '{}' })
        .run(),
    ).toThrow(/UNIQUE constraint/);
    expect(db.select().from(reapplyReports).get()).toEqual(row);
    sqlite.close();
  });
});
