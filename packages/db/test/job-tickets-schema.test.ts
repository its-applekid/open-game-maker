import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { jobTickets } from '../src/schema/index.js';

describe('job ticket filing checkpoints', () => {
  it('persists one resumable row per job and plan-ticket key', () => {
    const { sqlite, db } = openDb(':memory:');
    migrate({ sqlite });
    sqlite.prepare('PRAGMA foreign_keys = OFF').run();
    db.insert(jobTickets)
      .values({
        jobId: 'j_1',
        key: 'T1',
        issueNumber: 42,
        repo: 'owner/game',
        sig: 'abc',
        capSetAt: null,
        todoAt: null,
        filedAt: null,
      })
      .run();

    expect(db.select().from(jobTickets).get()).toMatchObject({ jobId: 'j_1', key: 'T1', issueNumber: 42 });
    expect(() =>
      db
        .insert(jobTickets)
        .values({
          jobId: 'j_1',
          key: 'T1',
          issueNumber: 43,
          repo: 'owner/game',
          sig: 'def',
          capSetAt: null,
          todoAt: null,
          filedAt: null,
        })
        .run(),
    ).toThrow(/UNIQUE/);
    sqlite.close();
  });
});
