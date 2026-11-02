import { describe, expect, it, vi } from 'vitest';

import type { Job, ReapplyReport } from '@ogm/contracts/browser';

import { activeBuildStatus, inspectBuildChange, readyBuildSignal } from './builds';
import type { DesignSnapshot, OptionalCapability } from './api';

const current = { rev: 4, buildId: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ', doc: {} } as DesignSnapshot;
const next = { rev: 4, buildId: 'b_01BX5ZZKBKACTAV9WEVGEMMVS0', doc: {} } as DesignSnapshot;

describe('editor build lifecycle', () => {
  it('uses the existing job stage copy without disabling editing', () => {
    const jobs = [{ state: 'running', stage: 'building', stageText: 'Building your game' }] as Job[];
    expect(activeBuildStatus(jobs)).toBe('Building your game');
  });

  it('uses the latest ready job revision as the branch inspection signal', () => {
    const jobs = [
      { id: 'old', branchId: 'main', state: 'done', stage: 'done', updatedAt: '2026-11-01T01:00:00Z' },
      { id: 'new', branchId: 'main', state: 'done', stage: 'ready', updatedAt: '2026-11-01T02:00:00Z' },
      { id: 'other', branchId: 'feature', state: 'done', stage: 'ready', updatedAt: '2026-11-01T03:00:00Z' },
    ] as Job[];

    expect(readyBuildSignal(jobs, 'main')).toBe('new:2026-11-01T02:00:00Z:ready');
  });

  it('switches immediately when the later-owned reapply capability returns exact 404', async () => {
    const reapply = vi.fn<() => Promise<OptionalCapability<ReapplyReport>>>().mockResolvedValue({ available: false });

    await expect(inspectBuildChange(current, next, reapply)).resolves.toEqual({ kind: 'switch', snapshot: next });
  });

  it('holds a changed build for review when a report is available', async () => {
    const report = { fromBuildId: current.buildId, toBuildId: next.buildId } as ReapplyReport;
    const reapply = vi.fn().mockResolvedValue({ available: true, value: report });

    await expect(inspectBuildChange(current, next, reapply)).resolves.toEqual({
      kind: 'review',
      snapshot: next,
      report,
    });
  });
});
