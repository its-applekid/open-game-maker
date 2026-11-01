import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { branches, designTransactions, editLeases, families, games } from '../src/schema/index.js';

const createdAt = '2026-11-01T16:00:00.000Z';

function seededDb() {
  const opened = openDb(':memory:');
  migrate({ sqlite: opened.sqlite });
  opened.db.insert(families).values({ id: 'f_1', name: 'Family', ownerUserId: 'u_1', createdAt }).run();
  opened.db
    .insert(games)
    .values({
      id: 'g_1',
      familyId: 'f_1',
      ownerId: 'u_1',
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt,
    })
    .run();
  opened.db
    .insert(branches)
    .values({
      id: 'b_1',
      gameId: 'g_1',
      name: 'main',
      gitRef: 'refs/heads/main',
      headRev: 0,
      status: 'active',
      createdBy: 'u_1',
      createdAt,
    })
    .run();
  return opened;
}

describe('design-log schema', () => {
  it('migrates branches, transactions, and edit leases', () => {
    const { sqlite } = seededDb();
    const tables = sqlite
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(({ name }) => name);

    expect(tables).toEqual(expect.arrayContaining(['branches', 'design_transactions', 'edit_leases']));
    sqlite.close();
  });

  it('enforces branch names, transaction revisions, and lease keys', () => {
    const { sqlite, db } = seededDb();
    expect(() =>
      db
        .insert(branches)
        .values({
          id: 'b_2',
          gameId: 'g_1',
          name: 'main',
          gitRef: 'refs/heads/other-main',
          headRev: 0,
          status: 'active',
          createdBy: 'u_1',
          createdAt,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    const tx = {
      id: 'tx_1',
      gameId: 'g_1',
      branchId: 'b_1',
      rev: 1,
      baseRev: 0,
      leaseToken: 1,
      actor: 'u_1',
      kind: 'manual' as const,
      label: 'first',
      baseBuildId: 'build_1',
      commandsJson: '[]',
      patchesJson: '[]',
      inverseJson: '[]',
      createdAt,
    };
    db.insert(designTransactions).values(tx).run();
    expect(() =>
      db
        .insert(designTransactions)
        .values({ ...tx, id: 'tx_2' })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    db.insert(editLeases)
      .values({
        gameId: 'g_1',
        branchId: 'b_1',
        holderUserId: 'u_1',
        sessionId: 's_1',
        token: 1,
        expiresAt: createdAt,
      })
      .run();
    expect(() =>
      db
        .insert(editLeases)
        .values({
          gameId: 'g_1',
          branchId: 'b_1',
          holderUserId: 'u_2',
          sessionId: 's_2',
          token: 2,
          expiresAt: createdAt,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
    sqlite.close();
  });

  it('rejects updates and deletes from the transaction log', () => {
    const { sqlite, db } = seededDb();
    db.insert(designTransactions)
      .values({
        id: 'tx_1',
        gameId: 'g_1',
        branchId: 'b_1',
        rev: 1,
        baseRev: 0,
        leaseToken: 1,
        actor: 'u_1',
        kind: 'manual',
        label: 'first',
        baseBuildId: 'build_1',
        commandsJson: '[]',
        patchesJson: '[]',
        inverseJson: '[]',
        createdAt,
      })
      .run();

    expect(() => sqlite.prepare("UPDATE design_transactions SET label = 'changed' WHERE id = 'tx_1'").run()).toThrow(
      /append-only/,
    );
    expect(() => sqlite.prepare("DELETE FROM design_transactions WHERE id = 'tx_1'").run()).toThrow(/append-only/);
    expect(sqlite.prepare('SELECT COUNT(*) FROM design_transactions').pluck().get()).toBe(1);
    sqlite.close();
  });
});
