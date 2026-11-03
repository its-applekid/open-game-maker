import { describe, expect, it } from 'vitest';

import type { MergeConflict, MergePlan } from '@ogm/contracts/browser';

import { allMine, canLand, canPreview, reduceResolutions } from './resolution';

const conflict = (id: string, resolution?: MergeConflict['resolution']): MergeConflict => ({
  id,
  path: `/entities/${id}/x`,
  entityId: id,
  controlId: 'x',
  kind: 'both_changed',
  ours: { path: `/entities/${id}/x`, before: 0, after: 1, txId: `ours_${id}` },
  theirs: { path: `/entities/${id}/x`, before: 0, after: 2, txId: `theirs_${id}` },
  ...(resolution === undefined ? {} : { resolution }),
});

const plan = (overrides: Partial<MergePlan> = {}): MergePlan => ({
  id: 'plan_one',
  gameId: 'game_one',
  sourceBranchId: 'branch_source',
  targetBranchId: 'branch_main',
  baseRev: 2,
  auto: [],
  conflicts: [conflict('first'), conflict('second')],
  code: 'clean',
  status: 'resolving',
  ...overrides,
});

describe('merge resolution rules', () => {
  it('resolves every conflict to mine and waits for every choice before preview', () => {
    const current = plan();
    const mine = allMine(current.conflicts);

    expect(mine).toEqual({ first: 'ours', second: 'ours' });
    expect(canPreview(current, { first: 'ours' })).toBe(false);
    expect(canPreview(current, mine)).toBe(true);
  });

  it('keeps a custom scalar through the reducer and only lands previewing plans', () => {
    const custom = reduceResolutions({}, { type: 'set', conflictId: 'first', resolution: { value: 7 } });

    expect(custom.first).toEqual({ value: 7 });
    expect(canLand(plan({ status: 'resolving', previewBuildId: 'build_preview' }))).toBe(false);
    expect(canLand(plan({ status: 'previewing', previewBuildId: 'build_preview' }))).toBe(true);
  });
});
