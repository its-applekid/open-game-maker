import { useQuery } from '@tanstack/react-query';

import type { Branch, Build } from '@ogm/contracts/browser';

import { queryClient } from '../../../app/query';
import { api } from '../../../lib/api/client';
import type { VersionBranch } from './rules';

export const versionKeys = {
  branches: (gameId: string) => ['game', gameId, 'version-branches'] as const,
  builds: (gameId: string) => ['game', gameId, 'version-builds'] as const,
};

export function useVersionBranches(gameId: string) {
  return useQuery({
    queryKey: versionKeys.branches(gameId),
    queryFn: () => listVersionBranches(gameId),
    enabled: gameId !== '',
  });
}

export function useBuilds(gameId: string) {
  return useQuery({
    queryKey: versionKeys.builds(gameId),
    queryFn: () => listBuilds(gameId),
    enabled: gameId !== '',
  });
}

export async function listVersionBranches(gameId: string): Promise<VersionBranch[]> {
  const { branches } = await api<{ branches: VersionBranch[] }>(`/games/${segment(gameId)}/branches`);
  return branches;
}

export async function listBuilds(gameId: string): Promise<Build[]> {
  const { builds } = await api<{ builds: Build[] }>(`/games/${segment(gameId)}/builds`);
  return builds;
}

export async function createVersion(gameId: string, input: { name: string; fromBranchId?: string }): Promise<Branch> {
  const created = await api<Branch>(`/games/${segment(gameId)}/branches`, { method: 'POST', json: input });
  await queryClient.invalidateQueries({ queryKey: versionKeys.branches(gameId) });
  return created;
}

export async function archiveVersion(gameId: string, branchId: string): Promise<Branch> {
  const archived = await api<Branch>(`/games/${segment(gameId)}/branches/${segment(branchId)}/archive`, {
    method: 'POST',
  });
  await queryClient.invalidateQueries({ queryKey: versionKeys.branches(gameId) });
  return archived;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
