import { describe, expect, it, vi } from 'vitest';

import { RepoResolver } from '../src/repo-resolver.js';

describe('RepoResolver', () => {
  it('resolves one game per request with the service bearer', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ owner: 'alice', name: 'gm-game-1', visibility: 'private' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const resolver = new RepoResolver('http://127.0.0.1:4300/', 'service-secret', fetchImpl);
    await expect(resolver.resolve('game/1')).resolves.toEqual({
      owner: 'alice',
      name: 'gm-game-1',
      visibility: 'private',
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4300/internal/games/game%2F1/repo', {
      headers: { authorization: 'Bearer service-secret' },
    });
  });

  it('refuses malformed API responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ owner: 'alice', name: 'gm-game-1', visibility: 'internal' })),
    );
    await expect(
      new RepoResolver('http://127.0.0.1:4300', 'service-secret', fetchImpl).resolve('game-1'),
    ).rejects.toThrow('invalid response');
  });
});
