import { schema } from '@ogm/db';

import { reserve } from '../../src/budget/ledger.js';
import { installUsers, makeDeps } from '../helpers.js';

export const ids = {
  family: 'f_18000000-0000-4000-8000-000000000001',
  creator: 'u_18000000-0000-4000-8000-000000000001',
  other: 'u_18000000-0000-4000-8000-000000000002',
  admin: 'u_18000000-0000-4000-8000-000000000003',
  game: 'g_18000000-0000-4000-8000-000000000001',
  running: 'j_18000000-0000-4000-8000-000000000001',
};

// 13:00 on Oct 31 in Los Angeles: the next reset is midnight PDT, 07:00Z.
export const NOW = new Date('2026-10-31T20:00:00.000Z');
export const RESETS_AT = '2026-11-01T07:00:00.000Z';
export const ZONE = 'America/Los_Angeles';

export const plan = {
  title: 'Goblin camp',
  summary: 'Add the camp',
  scope: { included: ['camp'], excluded: [] },
  tickets: [{ key: 'T1', skills: [], dependsOn: [], acceptanceCriteria: ['loads'] }],
};

export function insertJob(
  deps: ReturnType<typeof makeDeps>,
  values: Partial<typeof schema.jobs.$inferInsert> & { id: string },
) {
  deps.db
    .insert(schema.jobs)
    .values({
      gameId: ids.game,
      branchId: 'main',
      familyId: ids.family,
      creatorId: ids.creator,
      kind: 'feature',
      complexity: 2,
      state: 'running',
      start: 'now',
      slot: 'edit',
      plan: JSON.stringify(plan),
      reservation: JSON.stringify({ amountMicroUsd: 3_000_000, sizeClass: 'medium', confidence: 'low' }),
      hardCapMicroUsd: 3_000_000,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      ...values,
    })
    .run();
}

// The worked data: energy at 100000 micro-USD a unit, 2000000 of 5000000 left, one edit slot held.
export function worked() {
  const deps = makeDeps();
  const at = NOW.toISOString();
  deps.db.insert(schema.families).values({ id: ids.family, name: 'F', ownerUserId: ids.creator, createdAt: at }).run();
  for (const [userId, role] of [
    [ids.creator, 'owner'],
    [ids.other, 'member'],
    [ids.admin, 'admin'],
  ] as const) {
    deps.db
      .insert(schema.familyMembers)
      .values({ familyId: ids.family, userId, role, capability: 'creator', joinedAt: at })
      .run();
  }
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.creator,
      title: 'Cave Run',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: at,
    })
    .run();
  insertJob(deps, { id: ids.running });
  reserve({ db: deps.db, jobId: ids.running, at: NOW, zone: ZONE, amountMicroUsd: 3_000_000 });
  installUsers(deps, [
    {
      kind: 'user',
      userId: ids.creator,
      familyId: ids.family,
      platformRole: 'none',
      capability: 'creator',
      email: 'c@example.test',
    },
    {
      kind: 'user',
      userId: ids.other,
      familyId: ids.family,
      platformRole: 'none',
      capability: 'creator',
      email: 'o@example.test',
    },
    {
      kind: 'user',
      userId: ids.admin,
      familyId: ids.family,
      platformRole: 'admin',
      capability: 'creator',
      email: 'a@example.test',
    },
  ]);
  return deps;
}
