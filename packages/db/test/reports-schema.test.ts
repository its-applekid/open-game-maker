import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';

describe('reports schema', () => {
  it('keeps one signature row per signature so duplicates attach instead of forking', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    const insert = sqlite.prepare(
      `INSERT INTO report_signatures (signature, scope, count, first_at, last_at, status)
       VALUES (?, 'platform', 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 'open')`,
    );
    insert.run('a'.repeat(64));
    expect(() => insert.run('a'.repeat(64))).toThrow(/UNIQUE/);
    sqlite.close();
  });

  it('rejects unknown routes and queue states', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO platform_issue_queue (id, title, body, labels_json, status, created_at)
           VALUES ('piq_1', 't', 'b', '[]', 'agent:todo', '2026-11-01T00:00:00Z')`,
        )
        .run(),
    ).toThrow(/CHECK/);
    sqlite.close();
  });
});
