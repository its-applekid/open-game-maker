import { JOB_STAGE_WORDS, type Job, type ReapplyReport } from '@ogm/contracts/browser';

import type { DesignSnapshot, OptionalCapability } from './api';

const TERMINAL = new Set<Job['state']>(['done', 'failed', 'cancelled']);

export function activeBuildStatus(jobs: readonly Job[]): string | undefined {
  const active = [...jobs]
    .filter((job) => !TERMINAL.has(job.state))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (active === undefined) return undefined;
  if (active.stageText) return active.stageText;
  if (active.stage) return JOB_STAGE_WORDS[active.stage];
  return active.state === 'running' ? 'Building' : undefined;
}

export type BuildChange =
  | { kind: 'same' }
  | { kind: 'switch'; snapshot: DesignSnapshot }
  | { kind: 'review'; snapshot: DesignSnapshot; report: ReapplyReport };

export async function inspectBuildChange(
  current: DesignSnapshot,
  next: DesignSnapshot,
  getReapply: () => Promise<OptionalCapability<ReapplyReport>>,
): Promise<BuildChange> {
  if (current.buildId === next.buildId) return { kind: 'same' };
  const capability = await getReapply();
  return capability.available
    ? { kind: 'review', snapshot: next, report: capability.value }
    : { kind: 'switch', snapshot: next };
}
