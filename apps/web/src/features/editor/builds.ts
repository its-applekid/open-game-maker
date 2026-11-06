import type { Job, ReapplyReport } from '@ogm/contracts/browser';

import type { DesignSnapshot, OptionalCapability } from './api';

export function readyBuildSignal(jobs: readonly Job[], branch: string): string | undefined {
  const ready = [...jobs]
    .filter((job) => job.branchId === branch && (job.stage === 'ready' || job.state === 'done'))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return ready === undefined ? undefined : `${ready.id}:${ready.updatedAt}:${ready.stage ?? ready.state}`;
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
