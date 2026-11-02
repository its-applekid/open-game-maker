import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { defaultReleaseRuntime } from '../src/releases/routes.js';
import { makeDeps } from './helpers.js';

const gameId = 'g_00000000-0000-4000-8000-000000000002';
const now = '2026-11-02T10:00:00.000Z';

function seedHeadSave(deps: ReturnType<typeof makeDeps>, userId: string, saveSchemaVersion: number): void {
  deps.db.insert(schema.saveSlots).values({ userId, gameId, slotId: '1', kind: 'manual', headRevision: 1 }).run();
  deps.db
    .insert(schema.saveRevisions)
    .values({
      userId,
      gameId,
      slotId: '1',
      revision: 1,
      branchId: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      buildId: 'build_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      saveSchemaVersion,
      payload: Buffer.from('{}'),
      sha256: 'e'.repeat(64),
      deviceId: 'device',
      clientSeq: 0,
      reason: 'manual',
      createdAt: now,
    })
    .run();
}

describe('default release runtime', () => {
  // Rollback reports how many saves become incompatible_after_rollback; the production
  // runtime must count real head saves, not report "unknown".
  it('counts head saves newer than the rollback target schema from the saves store', async () => {
    const deps = makeDeps();
    deps.db
      .insert(schema.families)
      .values({ id: 'f_00000000-0000-4000-8000-000000000001', name: 'F', ownerUserId: 'u_a', createdAt: now })
      .run();
    deps.db
      .insert(schema.games)
      .values({
        id: gameId,
        familyId: 'f_00000000-0000-4000-8000-000000000001',
        ownerId: 'u_a',
        title: 'Game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: now,
      })
      .run();
    seedHeadSave(deps, 'u_a', 1);
    seedHeadSave(deps, 'u_b', 3);

    await expect(defaultReleaseRuntime(deps).countSavesAboveSchema(gameId, 2)).resolves.toBe(1);
  });

  // Release versions are publishes.builds-since-fork.transactions (D-VERSION), owned by @ogm/design-log.
  it('derives versions with the design-log version rule', () => {
    const runtime = defaultReleaseRuntime(makeDeps());
    expect(runtime.deriveVersion({ publishCount: 2, buildsSinceFork: 0, txSinceLatestBuild: 0 })).toBe('2.0.0');
    expect(() => runtime.deriveVersion({ publishCount: -1, buildsSinceFork: 0, txSinceLatestBuild: 0 })).toThrow(
      RangeError,
    );
  });
});
