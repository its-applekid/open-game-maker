import type { Transaction } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { LeaseHeld, LeaseMismatch, acquireLease, heartbeatLease, releaseLease } from '../src/design/lease.js';
import {
  BranchArchived,
  StaleBaseRev,
  appendTransaction,
  ensureMainBranch,
  readTransactions,
} from '../src/design/store.js';
import { makeDeps } from './helpers.js';

const ids = {
  family: 'f_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  game: 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  owner: 'u_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  other: 'u_01BX5ZZKBKACTAV9WEVGEMMVRZ',
  build: 'build_01ARZ3NDEKTSV4RRFFQ69G5FAV',
} as const;

const now = new Date('2026-11-01T16:00:00.000Z');

function setup() {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.owner, createdAt: now.toISOString() })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.owner,
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: now.toISOString(),
    })
    .run();
  const branch = ensureMainBranch(deps.sqlite, ids.game, { now, id: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV' });
  return { deps, branch };
}

function transaction(
  branchId: string,
  overrides: Partial<Omit<Transaction, 'id' | 'rev' | 'createdAt'> & { sessionId?: string }> = {},
) {
  return {
    gameId: ids.game,
    branchId,
    baseRev: 0,
    leaseToken: 1,
    actor: ids.owner,
    kind: 'manual' as const,
    label: 'Change gravity',
    baseBuildId: ids.build,
    commands: [],
    patches: [{ op: 'add' as const, path: ['globals', 'world.gravity'], value: 9.8 }],
    inverse: [{ op: 'remove' as const, path: ['globals', 'world.gravity'] }],
    sessionId: 'session-a',
    ...overrides,
  };
}

describe('design store', () => {
  it('creates one lazy main branch for a game', () => {
    const { deps, branch } = setup();
    expect(branch).toMatchObject({ gameId: ids.game, name: 'main', gitRef: 'refs/heads/main', headRev: 0 });
    expect(ensureMainBranch(deps.sqlite, ids.game, { now, id: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ' })).toEqual(branch);
    expect(deps.db.select().from(schema.branches).all()).toHaveLength(1);
  });

  it('assigns revisions atomically and reports the live head for a stale base', () => {
    const { deps, branch } = setup();
    acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-a' },
      { now },
    );

    const first = appendTransaction(deps.sqlite, transaction(branch.id), {
      id: 'tx_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      now,
    });
    expect(first).toMatchObject({ id: 'tx_01ARZ3NDEKTSV4RRFFQ69G5FAV', rev: 1, baseRev: 0 });
    expect(() => appendTransaction(deps.sqlite, transaction(branch.id), { now })).toThrow(
      expect.objectContaining({ name: 'StaleBaseRev', headRev: 1 }),
    );
    expect(readTransactions(deps.sqlite, branch.id, 0).map(({ rev }) => rev)).toEqual([1]);
    expect(deps.db.select().from(schema.branches).get()?.headRev).toBe(1);
  });

  it('accepts system writes with token zero and no edit lease', () => {
    const { deps, branch } = setup();
    expect(
      appendTransaction(deps.sqlite, transaction(branch.id, { kind: 'system', leaseToken: 0, sessionId: undefined }), {
        now,
      }).rev,
    ).toBe(1);
  });

  it('rejects writes after a branch is archived', () => {
    const { deps, branch } = setup();
    deps.sqlite.prepare("UPDATE branches SET status = 'archived' WHERE id = ?").run(branch.id);
    expect(() =>
      appendTransaction(deps.sqlite, transaction(branch.id, { kind: 'system', leaseToken: 0, sessionId: undefined }), {
        now,
      }),
    ).toThrow(BranchArchived);
  });

  it('exposes typed stale-head and lease errors', () => {
    expect(new StaleBaseRev(7)).toMatchObject({ headRev: 7 });
    expect(new LeaseMismatch()).toBeInstanceOf(Error);
    expect(new LeaseHeld(ids.other)).toMatchObject({ holderUserId: ids.other });
  });
});

describe('edit lease', () => {
  it('takes over for a new session of the same owner and fences the old session', () => {
    const { deps, branch } = setup();
    const first = acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-a' },
      { now },
    );
    const second = acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-b' },
      { now },
    );

    expect(first.token).toBe(1);
    expect(second.token).toBe(2);
    expect(() => appendTransaction(deps.sqlite, transaction(branch.id), { now })).toThrow(LeaseMismatch);
    expect(
      appendTransaction(deps.sqlite, transaction(branch.id, { leaseToken: second.token, sessionId: 'session-b' }), {
        now,
      }).rev,
    ).toBe(1);
  });

  it('rejects another user until expiry, then grants the next token', () => {
    const { deps, branch } = setup();
    acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-a' },
      { now, ttlMs: 1_000 },
    );
    expect(() =>
      acquireLease(
        deps.sqlite,
        { gameId: ids.game, branchId: branch.id, userId: ids.other, sessionId: 'session-b' },
        { now },
      ),
    ).toThrow(LeaseHeld);

    const afterExpiry = new Date(now.getTime() + 1_001);
    expect(
      acquireLease(
        deps.sqlite,
        { gameId: ids.game, branchId: branch.id, userId: ids.other, sessionId: 'session-b' },
        { now: afterExpiry },
      ).token,
    ).toBe(2);
  });

  it('heartbeats and releases only the matching fenced session', () => {
    const { deps, branch } = setup();
    const lease = acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-a' },
      { now },
    );
    const heartbeatAt = new Date(now.getTime() + 15_000);

    expect(
      heartbeatLease(
        deps.sqlite,
        {
          gameId: ids.game,
          branchId: branch.id,
          userId: ids.owner,
          sessionId: 'session-a',
          token: lease.token,
        },
        { now: heartbeatAt },
      ).expiresAt,
    ).toBe(new Date(heartbeatAt.getTime() + 120_000).toISOString());
    expect(
      releaseLease(deps.sqlite, {
        gameId: ids.game,
        branchId: branch.id,
        userId: ids.owner,
        sessionId: 'wrong-session',
        token: lease.token,
      }),
    ).toBe(false);
    expect(
      releaseLease(deps.sqlite, {
        gameId: ids.game,
        branchId: branch.id,
        userId: ids.owner,
        sessionId: 'session-a',
        token: lease.token,
      }),
    ).toBe(true);
    const reacquired = acquireLease(
      deps.sqlite,
      { gameId: ids.game, branchId: branch.id, userId: ids.owner, sessionId: 'session-a' },
      { now: new Date(heartbeatAt.getTime() + 1) },
    );
    expect(reacquired.token).toBe(lease.token + 1);
    expect(() =>
      appendTransaction(deps.sqlite, transaction(branch.id, { leaseToken: lease.token }), {
        now: new Date(heartbeatAt.getTime() + 2),
      }),
    ).toThrow(LeaseMismatch);
  });
});
