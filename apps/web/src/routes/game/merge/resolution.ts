import type { MergeConflict, MergePlan } from '@ogm/contracts/browser';

export type ConflictResolution = NonNullable<MergeConflict['resolution']>;
export type ResolutionMap = Record<string, ConflictResolution>;
export type ResolutionAction =
  { type: 'set'; conflictId: string; resolution: ConflictResolution } | { type: 'replace'; resolutions: ResolutionMap };

export function reduceResolutions(state: ResolutionMap, action: ResolutionAction): ResolutionMap {
  if (action.type === 'replace') return action.resolutions;
  return { ...state, [action.conflictId]: action.resolution };
}

export function initialResolutions(conflicts: readonly MergeConflict[]): ResolutionMap {
  return Object.fromEntries(
    conflicts.flatMap(({ id, resolution }) => (resolution === undefined ? [] : [[id, resolution]])),
  );
}

export function allMine(conflicts: readonly MergeConflict[]): ResolutionMap {
  return Object.fromEntries(conflicts.map(({ id }) => [id, 'ours' as const]));
}

export function canPreview(plan: MergePlan, resolutions: ResolutionMap): boolean {
  return (
    (plan.status === 'planned' || plan.status === 'resolving') &&
    plan.conflicts.every(({ id, resolution }) => resolutions[id] !== undefined || resolution !== undefined)
  );
}

export function canLand(plan: MergePlan): boolean {
  return plan.status === 'previewing' && plan.previewBuildId !== undefined;
}

export function allowsBoth(conflict: MergeConflict): boolean {
  return conflict.kind === 'delete_vs_edit';
}
