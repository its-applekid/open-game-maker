import type { ActivityEvent } from '@ogm/contracts/browser';

import type { GameLoadMeasurement } from '../../features/editor/frame';

export function gameLoadActivity(
  gameId: string,
  measurement: GameLoadMeasurement,
  result: 'ok' | 'fail',
  at = new Date(),
): ActivityEvent {
  return {
    ts: at.toISOString(),
    activity: 'playtesting',
    boundary: 'point',
    source: 'editor',
    actor: 'human',
    gameId,
    meta: {
      system: 'game-load',
      command: measurement.fetchedBytes === 0 ? 'hit' : measurement.cachedBytes === 0 ? 'miss' : 'partial',
      count: Math.round(measurement.fetchedBytes / 1024),
      durationMs: Math.max(0, Math.round(measurement.ms)),
      result,
    },
  };
}
