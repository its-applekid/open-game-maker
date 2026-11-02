import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from '../../lib/api/client';
import type { Branch } from './types';

type BranchesResponse = Branch[] | { branches: Branch[] };

export function useBranches(gameId: string | null) {
  return useQuery({
    queryKey: ['games', gameId, 'branches'],
    enabled: gameId !== null,
    queryFn: async () => {
      if (gameId === null) return [];
      try {
        const response = await api<BranchesResponse>(`/games/${encodeURIComponent(gameId)}/branches`);
        return Array.isArray(response) ? response : response.branches;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return [mainBranch(gameId)];
        throw error;
      }
    },
  });
}

export function mainBranch(gameId: string): Branch {
  return {
    id: 'main',
    gameId,
    name: 'main',
    gitRef: 'main',
    forkPoint: null,
    headRev: 0,
    latestBuildId: null,
    status: 'active',
    createdBy: 'system',
    createdAt: '1970-01-01T00:00:00.000Z',
  };
}
