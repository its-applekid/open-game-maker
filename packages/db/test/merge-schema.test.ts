import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { migrate, openDb } from '../src/index.js';
import { mergePlans } from '../src/schema/index.js';

describe('merge plan schema', () => {
  it('chains the generated migration after scope sessions at journal index 19', () => {
    const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const previous = JSON.parse(
      readFileSync(new URL('../migrations/meta/20261102033839_snapshot.json', import.meta.url), 'utf8'),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(new URL('../migrations/meta/20261102052022_snapshot.json', import.meta.url), 'utf8'),
    ) as { prevId: string };

    expect(journal.entries.at(-1)).toMatchObject({ idx: 19, tag: '20261102052022_merge_plans' });
    expect(snapshot.prevId).toBe(previous.id);
  });

  it('stores a plan for two distinct branches and enforces its state', () => {
    const { sqlite, db } = openDb(':memory:');
    migrate({ sqlite });
    sqlite.exec(`
      INSERT INTO families (id, name, owner_user_id, created_at)
      VALUES ('f_1', 'Family', 'u_1', 'now');
      INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
      VALUES ('g_1', 'f_1', 'u_1', 'Game', 'private', 'private', 'now');
      INSERT INTO branches (id, game_id, name, git_ref, head_rev, status, created_by, created_at)
      VALUES
        ('b_1', 'g_1', 'main', 'refs/heads/main', 1, 'active', 'u_1', 'now'),
        ('b_2', 'g_1', 'branch', 'branch/b_2', 1, 'active', 'u_1', 'now');
    `);
    const row = {
      id: 'merge_1',
      gameId: 'g_1',
      sourceBranchId: 'b_2',
      targetBranchId: 'b_1',
      baseRev: 0,
      targetHeadRev: 1,
      planJson: '{}',
      status: 'resolving' as const,
      landedTxId: null,
      rolledBackTxId: null,
      createdAt: '2026-11-01T20:30:00.000Z',
    };

    db.insert(mergePlans).values(row).run();
    expect(db.select().from(mergePlans).get()).toEqual(row);
    expect(() =>
      db
        .insert(mergePlans)
        .values({ ...row, id: 'merge_2', sourceBranchId: 'b_1' })
        .run(),
    ).toThrow(/merge_plans_distinct_branches_check/);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO merge_plans
             (id, game_id, source_branch_id, target_branch_id, base_rev, target_head_rev,
              plan_json, status, created_at)
           VALUES ('merge_3', 'g_1', 'b_2', 'b_1', 0, 1, '{}', 'invalid', 'now')`,
        )
        .run(),
    ).toThrow(/merge_plans_status_check/);
    sqlite.close();
  });
});
