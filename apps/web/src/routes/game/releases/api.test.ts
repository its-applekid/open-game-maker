import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPublishPreview, getRollbackPreview, listReleases, publishRelease, rollbackRelease } from './api';

describe('release requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps preview reads separate from release writes and encodes identifiers', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ releases: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await listReleases('game/one');
    await getPublishPreview('game/one', 'build/one');
    await publishRelease('game/one', 'build/one', { summary: 'Boss room', items: [] });
    await getRollbackPreview('game/one', 'release/one');
    await rollbackRelease('game/one', 'release/one');

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/games/game%2Fone/releases',
      '/api/v1/games/game%2Fone/publish-preview?buildId=build%2Fone',
      '/api/v1/games/game%2Fone/publish',
      '/api/v1/games/game%2Fone/rollback-preview?releaseId=release%2Fone',
      '/api/v1/games/game%2Fone/rollback',
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ buildId: 'build/one', changelog: { summary: 'Boss room', items: [] } }),
      }),
    );
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ releaseId: 'release/one' }) }),
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
