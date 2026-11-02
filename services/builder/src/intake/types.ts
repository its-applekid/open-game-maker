import type { AiurClient } from '@ogm/aiur-client';
import type { Db } from '@ogm/db';

import type { IssuesClient } from '../github/issues.js';
import type { EnsureResult, Fleet } from '../fleet/fleet.js';

export type FileResult =
  | { filed: true; issues: number[] }
  | { deferred: 'capacity' | 'github' | 'aiur' }
  | { skipped: string }
  | { failed: 'preflight'; reasons: string[] };

export type IntakeAlert = {
  code: 'preflight_failed' | 'github_failed' | 'spend_cap_failed' | 'nudge_failed' | 'sweep_failed';
  jobId: string;
  reasons: string[];
};

export type IntakeDeps = {
  db: Db;
  fleet:
    | Pick<Fleet, 'ensureDaemon'>
    | { ensureDaemon(repo: string, kind: 'new_game' | 'feature' | 'repair'): Promise<EnsureResult> };
  issues: IssuesClient;
  aiurForRepo: (repo: string) => Promise<Pick<AiurClient, 'setSpendCap' | 'nudgeTodo'>>;
  shippedSkills: readonly string[];
  failJob: (jobId: string) => void;
  subscribeAdmitted?: (listener: (jobId: string) => void) => () => void;
  onJobChanged?: (event: { jobId: string; gameId: string; familyId: string; state: 'filed' | 'paused_budget' }) => void;
  alert?: (event: IntakeAlert) => void | Promise<void>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  sweepMs?: number;
};
