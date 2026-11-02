import { describe, expect, it } from 'vitest';

import { BranchSchema } from '../src/branches.js';

describe('BranchSchema', () => {
  it('keeps a fork point when its parent has no Git build yet', () => {
    expect(
      BranchSchema.parse({
        id: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        gameId: 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        name: 'Spooky monsters',
        gitRef: 'branch/b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        forkPoint: {
          parentBranchId: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ',
          parentRev: 40,
          gitSha: null,
        },
        headRev: 0,
        latestBuildId: null,
        status: 'active',
        createdBy: 'u_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        createdAt: '2026-11-01T16:00:00.000Z',
      }).forkPoint,
    ).toEqual({ parentBranchId: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ', parentRev: 40, gitSha: null });
  });
});
