import { describe, expect, it } from 'vitest';

import type { Branch, Build } from '@ogm/contracts/browser';

import { canCreateVersion, publishableBuild, type VersionBranch } from './rules';

const branch = (overrides: Partial<VersionBranch> = {}): VersionBranch => ({
  id: 'branch_main',
  gameId: 'game_one',
  name: 'main',
  gitRef: 'refs/heads/main',
  forkPoint: null,
  headRev: 4,
  latestBuildId: 'build_latest',
  status: 'active',
  createdBy: 'user_one',
  createdAt: '2026-11-01T00:00:00.000Z',
  version: '1.2.0',
  ...overrides,
});

const build = (overrides: Partial<Build> = {}): Build => ({
  id: 'build_latest',
  gameId: 'game_one',
  branchId: 'branch_main',
  gitSha: 'a'.repeat(40),
  sdkVersion: '1.0.0',
  saveSchemaVersion: 1,
  achievementCatalogHash: 'b'.repeat(64),
  status: 'tested',
  artifact: 'present',
  createdAt: '2026-11-01T01:00:00.000Z',
  ...overrides,
});

describe('version rules', () => {
  it('limits creators to five active versions and ignores archived versions', () => {
    const active = Array.from({ length: 5 }, (_, index) => branch({ id: `branch_${index}`, name: `v${index}` }));

    expect(canCreateVersion(active)).toBe(false);
    expect(
      canCreateVersion([...active.slice(0, 4), branch({ status: 'archived' }), branch({ status: 'archived' })]),
    ).toBe(true);
  });

  it('publishes only the latest tested build from main', () => {
    const tested = build();

    expect(publishableBuild(branch(), [build({ id: 'older' }), tested])).toEqual(tested);
    expect(publishableBuild(branch({ name: 'draft' }), [tested])).toBeUndefined();
    expect(
      publishableBuild(branch({ latestBuildId: 'building' }), [build({ id: 'building', status: 'building' })]),
    ).toBeUndefined();
  });
});
