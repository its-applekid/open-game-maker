import { describe, expect, it } from 'vitest';

import { classifyGameRequest } from './game-cache.js';

describe('classifyGameRequest', () => {
  it.each([
    ['/g/a/b/assets/x.3f9a.glb', 'cache-first', 'gm-assets'],
    ['/g/a/b/index.html', 'network-first', 'gm-pages'],
    ['/g/a/b/main.js', 'stale-while-revalidate', 'gm-pages'],
  ] as const)('classifies %s as %s', (path, strategy, cacheName) => {
    expect(classifyGameRequest(new Request(`https://games.test${path}`), 'https://games.test')).toEqual({
      strategy,
      cacheName,
    });
  });

  it('passes non-GET and cross-origin requests through', () => {
    expect(classifyGameRequest(new Request('https://other.test/g/a/b/index.html'), 'https://games.test')).toEqual({
      strategy: 'pass',
    });
    expect(
      classifyGameRequest(new Request('https://games.test/g/a/b/index.html', { method: 'POST' }), 'https://games.test'),
    ).toEqual({ strategy: 'pass' });
  });
});
