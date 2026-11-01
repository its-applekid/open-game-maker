import { describe, expect, it } from 'vitest';

import { schema } from '@ogm/db';

import { allowanceRemaining } from '../src/budget/allowance.js';
import { recordUsage, releaseReservation, reserve } from '../src/budget/ledger.js';
import { makeDeps } from './helpers.js';

const NOW = new Date('2026-11-01T16:00:00.000Z');

function seed(dailyMicroUsd = 5_000_000) {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: 'f_1', name: 'Family', ownerUserId: 'u_1', createdAt: NOW.toISOString() })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values({ familyId: 'f_1', userId: 'u_1', role: 'owner', capability: 'creator', joinedAt: NOW.toISOString() })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: 'g_1',
      familyId: 'f_1',
      ownerId: 'u_1',
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: NOW.toISOString(),
    })
    .run();
  deps.db.insert(schema.allowances).values({ familyId: 'f_1', userId: 'u_1', dailyMicroUsd }).run();
  deps.db
    .insert(schema.jobs)
    .values({
      id: 'j_1',
      gameId: 'g_1',
      branchId: 'main',
      familyId: 'f_1',
      creatorId: 'u_1',
      kind: 'feature',
      complexity: 2,
      state: 'running',
      start: 'now',
      slot: 'edit',
      plan: '{}',
      reservation: JSON.stringify({ amountMicroUsd: 3_000_000, sizeClass: 'medium', confidence: 'low' }),
      hardCapMicroUsd: 3_000_000,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })
    .run();
  return deps;
}

const defaults = { dailyAllowanceMicroUsd: 5_000_000, resetZone: 'America/Los_Angeles' };

describe('allowance arithmetic', () => {
  it('subtracts only reservations from the family-local current day', () => {
    const deps = seed();
    reserve({ db: deps.db, jobId: 'j_1', at: NOW, zone: defaults.resetZone });
    deps.db
      .insert(schema.budgetLedger)
      .values({
        id: 'l_yesterday',
        familyId: 'f_1',
        userId: 'u_1',
        jobId: 'j_1',
        kind: 'reservation',
        amountMicroUsd: 4_000_000,
        at: '2026-10-31T16:00:00.000Z',
        dayKey: '2026-10-31',
      })
      .run();

    expect(allowanceRemaining({ db: deps.db, familyId: 'f_1', userId: 'u_1', now: NOW, defaults })).toMatchObject({
      dailyMicroUsd: 5_000_000,
      remainingMicroUsd: 2_000_000,
    });
  });

  it('charges reconciled usage only beyond the reservation', () => {
    const deps = seed();
    reserve({ db: deps.db, jobId: 'j_1', at: NOW, zone: defaults.resetZone });
    recordUsage({ db: deps.db, jobId: 'j_1', microUsd: 3_500_000, runId: 'run-1', at: NOW, zone: defaults.resetZone });

    expect(allowanceRemaining({ db: deps.db, familyId: 'f_1', userId: 'u_1', now: NOW, defaults })).toMatchObject({
      remainingMicroUsd: 1_500_000,
    });
  });

  it('records usage deltas and releases unused reservation once', () => {
    const deps = seed();
    reserve({ db: deps.db, jobId: 'j_1', at: NOW, zone: defaults.resetZone });
    recordUsage({ db: deps.db, jobId: 'j_1', microUsd: 1_000_000, runId: 'run-1', at: NOW, zone: defaults.resetZone });
    recordUsage({ db: deps.db, jobId: 'j_1', microUsd: 1_500_000, runId: 'run-1', at: NOW, zone: defaults.resetZone });
    recordUsage({ db: deps.db, jobId: 'j_1', microUsd: 1_500_000, runId: 'run-1', at: NOW, zone: defaults.resetZone });

    expect(
      deps.db
        .select()
        .from(schema.budgetLedger)
        .all()
        .filter((row) => row.kind === 'usage')
        .map((row) => row.amountMicroUsd),
    ).toEqual([1_000_000, 500_000]);
    expect(releaseReservation({ db: deps.db, jobId: 'j_1', at: NOW, zone: defaults.resetZone })).toBe(1_500_000);
    expect(releaseReservation({ db: deps.db, jobId: 'j_1', at: NOW, zone: defaults.resetZone })).toBe(0);
  });
});
