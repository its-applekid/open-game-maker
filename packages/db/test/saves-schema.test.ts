import { describe, expect, it } from 'vitest';

import { migrate, openDb } from '../src/index.js';

describe('saves schema', () => {
  it('creates save slots, immutable revisions, and play leases', () => {
    const { sqlite } = openDb(':memory:');

    expect(migrate({ sqlite }).applied).toContain('20261101200000_saves.sql');
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
