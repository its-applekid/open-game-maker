import { describe, expect, it } from 'vitest';

import { gameLoadActivity } from './load-analytics';

describe('gameLoadActivity', () => {
  it.each([
    [{ fetchedBytes: 0, cachedBytes: 4096 }, 'hit'],
    [{ fetchedBytes: 2048, cachedBytes: 2048 }, 'partial'],
    [{ fetchedBytes: 4096, cachedBytes: 0 }, 'miss'],
  ] as const)('classifies cache results as %s', (bytes, command) => {
    expect(
      gameLoadActivity(
        'g_01BX5ZZKBKACTAV9WEVGEMMVRZ',
        { ...bytes, ms: 375 },
        'ok',
        new Date('2026-11-02T12:00:00.000Z'),
      ),
    ).toEqual({
      ts: '2026-11-02T12:00:00.000Z',
      activity: 'playtesting',
      boundary: 'point',
      source: 'editor',
      actor: 'human',
      gameId: 'g_01BX5ZZKBKACTAV9WEVGEMMVRZ',
      meta: {
        system: 'game-load',
        command,
        count: Math.round(bytes.fetchedBytes / 1024),
        durationMs: 375,
        result: 'ok',
      },
    });
  });

  it('keeps the cache classification for a stalled load and marks it failed', () => {
    expect(
      gameLoadActivity(
        'g_01BX5ZZKBKACTAV9WEVGEMMVRZ',
        { fetchedBytes: 1024, cachedBytes: 1024, ms: 20_000 },
        'fail',
        new Date('2026-11-02T12:00:00.000Z'),
      ).meta,
    ).toMatchObject({ command: 'partial', result: 'fail' });
  });
});
