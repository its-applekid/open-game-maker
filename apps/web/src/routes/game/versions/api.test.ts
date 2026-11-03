import { afterEach, describe, expect, it, vi } from 'vitest';

import { archiveVersion, createVersion, listBuilds, listVersionBranches } from './api';

describe('version requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('encodes identifiers and sends the merged branch request shapes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ branches: [], builds: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await listVersionBranches('game/one');
    await createVersion('game/one', { name: 'boss run', fromBranchId: 'branch/source' });
    await archiveVersion('game/one', 'branch/source');
    await listBuilds('game/one');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/games/game%2Fone/branches',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/games/game%2Fone/branches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'boss run', fromBranchId: 'branch/source' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/games/game%2Fone/branches/branch%2Fsource/archive',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/games/game%2Fone/builds', expect.any(Object));
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
