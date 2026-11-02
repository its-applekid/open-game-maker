import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { usageSamples } from '../src/schema/index.js';

describe('usage samples schema', () => {
  it('stores one mutable sample per job run and the reconciliation guard columns', () => {
    const { sqlite, db } = openDb(':memory:');
    migrate({ sqlite });

    const tables = sqlite
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => name);
    expect(tables).toContain('usage_samples');

    const jobColumns = sqlite
      .prepare<[], { name: string }>('PRAGMA table_info(jobs)')
      .all()
      .map(({ name }) => name);
    expect(jobColumns).toEqual(expect.arrayContaining(['usage_coverage', 'aiur_run_id', 'released_at']));

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
    sqlite
      .prepare(
        `INSERT INTO jobs
         (id, game_id, branch_id, family_id, creator_id, kind, complexity, state, start, slot, plan, reservation,
          hard_cap_micro_usd, usage_micro_usd, created_at, updated_at)
         VALUES ('j_1', 'g_1', 'main', 'f_1', 'u_1', 'feature', 2, 'running', 'now', 'edit', '{}', '{}',
                 4000000, 0, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`,
      )
      .run();

    db.insert(usageSamples)
      .values({
        jobId: 'j_1',
        runId: 'r_1',
        repo: 'owner/game',
        issue: 142,
        providerReportedMicro: 0,
        apiEquivalentMicro: 734_512,
        coverageStatus: 'complete',
        observedAt: '2026-11-01T00:00:00.000Z',
      })
      .run();
    db.insert(usageSamples)
      .values({
        jobId: 'j_1',
        runId: 'r_1',
        repo: 'owner/game',
        issue: 142,
        providerReportedMicro: 10,
        apiEquivalentMicro: 800_000,
        coverageStatus: 'partial',
        observedAt: '2026-11-01T00:01:00.000Z',
      })
      .onConflictDoUpdate({
        target: [usageSamples.jobId, usageSamples.runId],
        set: { apiEquivalentMicro: 800_000, coverageStatus: 'partial' },
      })
      .run();

    expect(db.select().from(usageSamples).all()).toEqual([
      expect.objectContaining({ jobId: 'j_1', runId: 'r_1', apiEquivalentMicro: 800_000, coverageStatus: 'partial' }),
    ]);
    sqlite.close();
  });
});
