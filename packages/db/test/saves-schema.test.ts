import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { migrate, openDb } from '../src/index.js';

describe('saves schema', () => {
  it('chains the generated snapshot after creator analytics at journal index 16', () => {
    const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const snapshot = JSON.parse(
      readFileSync(new URL('../migrations/meta/20261102023822_snapshot.json', import.meta.url), 'utf8'),
    ) as { prevId: string };

    expect(journal.entries.at(-1)).toMatchObject({ idx: 16, tag: '20261102023822_saves' });
    expect(snapshot.prevId).toBe('eefc9345-ddea-4b74-a251-483f7889bc52');
  });

  it('creates save slots, immutable revisions, and play leases', () => {
    const { sqlite } = openDb(':memory:');

    expect(migrate({ sqlite }).applied).toContain('20261102023822_saves.sql');
    expect(
      sqlite
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('save_slots', 'save_revisions', 'play_leases') ORDER BY name",
        )
        .all()
        .map(({ name }) => name),
    ).toEqual(['play_leases', 'save_revisions', 'save_slots']);
    expect(
      sqlite
        .prepare<[], { name: string; type: string }>(
          "SELECT name, type FROM sqlite_master WHERE name IN ('save_revisions_idempotency_unique', 'save_revisions_no_update') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: 'save_revisions_idempotency_unique', type: 'index' },
      { name: 'save_revisions_no_update', type: 'trigger' },
    ]);
  });
});
