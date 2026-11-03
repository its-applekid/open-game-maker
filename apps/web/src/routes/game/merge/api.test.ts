import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  abandonMerge,
  getMergePlan,
  landMerge,
  previewMerge,
  resolveAllMergeConflicts,
  resolveMergeConflict,
  startMerge,
} from './api';

describe('merge requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes every route segment and preserves merge request bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({})));
    vi.stubGlobal('fetch', fetchMock);

    await startMerge('game/one', 'target/one', 'source/one');
    await getMergePlan('game/one', 'target/one', 'plan/one');
    await resolveMergeConflict('game/one', 'target/one', 'plan/one', 'conflict/one', { value: 'mine' });
    await resolveAllMergeConflicts('game/one', 'target/one', 'plan/one', 'ours');
    await previewMerge('game/one', 'target/one', 'plan/one');
    await landMerge('game/one', 'target/one', 'plan/one', { sessionId: 'session/one', token: 4 });
    await abandonMerge('game/one', 'target/one', 'plan/one');

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone/conflicts/conflict%2Fone',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone/resolve-all',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone/preview',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone/land',
      '/api/v1/games/game%2Fone/branches/target%2Fone/merges/plan%2Fone/abandon',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceBranchId: 'source/one' }) }),
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ resolution: { value: 'mine' } }) }),
    );
    expect(fetchMock.mock.calls[5]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sessionId: 'session/one', token: 4 }) }),
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
