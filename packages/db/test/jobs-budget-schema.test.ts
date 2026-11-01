import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { sizeClasses } from '../src/schema/index.js';

describe('jobs and budget schema', () => {
  it('creates the job and budget tables with deterministic size-class seeds', () => {
    const { sqlite, db } = openDb(':memory:');
    migrate({ sqlite });

    const tables = sqlite
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => name);
    expect(tables).toEqual(
      expect.arrayContaining(['jobs', 'family_budget_settings', 'allowances', 'budget_ledger', 'size_classes']),
    );
    expect(db.select().from(sizeClasses).all()).toHaveLength(12);
    expect(
      db
        .select()
        .from(sizeClasses)
        .all()
        .find((row) => row.kind === 'repair' && row.sizeClass === 'large'),
    ).toMatchObject({ p50MicroUsd: 1_333_333, p80MicroUsd: 3_000_000, samples: 0 });

    sqlite.close();
  });

  it('enforces creator idempotency keys at the database boundary', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    const insert = sqlite.prepare(
      `INSERT INTO jobs
       (id, game_id, branch_id, family_id, creator_id, kind, complexity, state, start, slot, plan, reservation,
        hard_cap_micro_usd, usage_micro_usd, idempotency_key, created_at, updated_at)
       VALUES (?, ?, 'main', ?, ?, 'feature', 3, 'admitted', 'now', 'edit', '{}', '{}', 9000000, 0, ?, ?, ?)`,
    );
    sqlite
      .prepare('INSERT INTO families (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)')
      .run('f_1', 'Family', 'u_1', '2026-11-01T00:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO games
         (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
         VALUES (?, ?, ?, ?, 'private', 'private', ?)`,
      )
      .run('g_1', 'f_1', 'u_1', 'Game', '2026-11-01T00:00:00.000Z');
    const args = ['g_1', 'f_1', 'u_1', 'voice:s:1', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'];
    insert.run('j_1', ...args);
    expect(() => insert.run('j_2', ...args)).toThrow(/UNIQUE/);
    sqlite.close();
  });

  it('allows one job per filed aiur ticket', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    sqlite
      .prepare('INSERT INTO families (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)')
      .run('f_1', 'Family', 'u_1', '2026-11-01T00:00:00.000Z');
    sqlite
      .prepare(
        `INSERT INTO games
         (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
         VALUES (?, ?, ?, ?, 'private', 'private', ?)`,
      )
      .run('g_1', 'f_1', 'u_1', 'Game', '2026-11-01T00:00:00.000Z');
    const insert = sqlite.prepare(
      `INSERT INTO jobs
       (id, game_id, branch_id, family_id, creator_id, kind, complexity, state, start, slot, plan, reservation,
        hard_cap_micro_usd, usage_micro_usd, aiur_repo, aiur_issue_number, created_at, updated_at)
       VALUES (?, 'g_1', 'main', 'f_1', 'u_1', 'feature', 3, 'filed', 'now', 'edit', '{}', '{}', 9000000, 0,
               'owner/game', 142, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`,
    );
    insert.run('j_1');
    expect(() => insert.run('j_2')).toThrow(/UNIQUE/);
    sqlite.close();
  });
});
