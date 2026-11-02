import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { createVersionCounts } from '../src/branches/version-counts.js';
import { ensureMainBranch, insertBranch } from '../src/design/store.js';
import { makeDeps } from './helpers.js';

const now = '2026-11-02T10:00:00.000Z';
const gameId = 'g_00000000-0000-4000-8000-000000000002';
const at = (minutes: number) => new Date(new Date(now).getTime() + minutes * 60_000).toISOString();

function setup() {
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
  const main = ensureMainBranch(deps.sqlite, gameId, { id: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV', now: new Date(now) });
  return { deps, main };
}

function build(
  deps: ReturnType<typeof makeDeps>,
  id: string,
  branchId: string,
  createdAt: string,
  status: 'tested' | 'failed' = 'tested',
) {
  deps.db
    .insert(schema.builds)
    .values({
      id,
      gameId,
      branchId,
      gitSha: 'a'.repeat(40),
      sdkVersion: '1.0.0',
      saveSchemaVersion: 1,
      achievementCatalogHash: 'b'.repeat(64),
      status,
      artifact: 'present',
      artifactPath: `/artifacts/${id}`,
      createdAt,
    })
    .run();
}

function release(deps: ReturnType<typeof makeDeps>, seq: number, kind: 'publish' | 'rollback', publishedAt: string) {
  const snapshotId = `snap_${seq}`;
  deps.db
    .insert(schema.overrideSnapshots)
    .values({
      id: snapshotId,
      gameId,
      branchId: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      buildId: 'build_released',
      headRev: 0,
      sha256: String(seq).repeat(64),
      entriesJson: '[]',
      entityOpsJson: '[]',
      foldSha: 'c'.repeat(40),
      createdAt: publishedAt,
    })
    .run();
  deps.db
    .insert(schema.releases)
    .values({
      id: `rel_${seq}`,
      gameId,
      seq,
      version: `${seq}.0.0`,
      buildId: 'build_released',
      snapshotId,
      gitTag: `gm/${gameId}/v${seq}.0.0`,
      kind,
      changelogJson: '{"summary":"Updates","items":[]}',
      publishedBy: 'u_a',
      publishedAt,
    })
    .run();
}

describe('release-backed version counts', () => {
  // D-VERSION: the major is the number of releases, and a rollback is a new release (a new major).
  it('counts publishes and rollbacks toward publishCount', async () => {
    const { deps, main } = setup();
    build(deps, 'build_released', main.id, at(1));
    release(deps, 1, 'publish', at(2));
    release(deps, 2, 'rollback', at(3));

    await expect(createVersionCounts(deps.sqlite).publishCount(gameId)).resolves.toBe(2);
  });

  // The minor counts agent builds since the last release on main, ignoring failed ones.
  it('counts tested main builds after the latest release', async () => {
    const { deps, main } = setup();
    build(deps, 'build_released', main.id, at(1));
    release(deps, 1, 'publish', at(2));
    build(deps, 'build_after_one', main.id, at(3));
    build(deps, 'build_after_two', main.id, at(4));
    build(deps, 'build_failed', main.id, at(5), 'failed');

    const counts = createVersionCounts(deps.sqlite);
    await expect(counts.buildsSinceFork(main)).resolves.toBe(2);
    await expect(counts.versionFor(main)).resolves.toBe('1.2.0');
  });

  // On a fork, the minor counts that branch's own tested builds since it was created.
  it('counts a forked branch builds since its creation', async () => {
    const { deps, main } = setup();
    build(deps, 'build_main', main.id, at(1));
    const branch = insertBranch(deps.sqlite, {
      id: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ',
      gameId,
      name: 'Side quest',
      gitRef: 'refs/heads/side-quest',
      forkPoint: { parentBranchId: main.id, parentRev: 0, gitSha: null },
      headRev: 0,
      latestBuildId: null,
      status: 'active',
      createdBy: 'u_a',
      createdAt: at(2),
    });
    build(deps, 'build_branch', branch.id, at(3));

    await expect(createVersionCounts(deps.sqlite).buildsSinceFork(branch)).resolves.toBe(1);
  });
});
