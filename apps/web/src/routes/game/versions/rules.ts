import type { Branch, Build } from '@ogm/contracts/browser';

export type VersionBranch = Branch & { version: string };

export function canCreateVersion(branches: readonly Branch[]): boolean {
  return branches.filter(({ status }) => status === 'active').length < 5;
}

export function publishableBuild(branch: Branch, builds: readonly Build[]): Build | undefined {
  if (branch.name !== 'main' || branch.latestBuildId === null) return undefined;
  return builds.find(
    ({ id, branchId, status }) => id === branch.latestBuildId && branchId === branch.id && status === 'tested',
  );
}
