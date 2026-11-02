import type { JobKind } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import { listCheckpoints, parseCheckpoint } from '../build-chat/store.js';

export type CheckpointBudget = { used: number; max: 1 | 3 };

export function checkpointBudget(sqlite: Sqlite, jobId: string, kind: JobKind): CheckpointBudget {
  return {
    used: listCheckpoints(sqlite, jobId).filter((row) => parseCheckpoint(row)?.status !== 'moot').length,
    max: kind === 'new_game' ? 3 : 1,
  };
}
