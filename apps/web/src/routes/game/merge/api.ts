import { useQuery } from '@tanstack/react-query';

import type { DesignDoc, MergePlan } from '@ogm/contracts/browser';

import { queryClient } from '../../../app/query';
import { api } from '../../../lib/api/client';
import { versionKeys } from '../versions/api';
import type { ConflictResolution } from './resolution';

export type MergePreview = { previewBuildId: string; doc: DesignDoc; rev: number };

export const mergeKeys = {
  plan: (gameId: string, targetBranchId: string, planId: string) =>
    ['game', gameId, 'merge', targetBranchId, planId] as const,
};

export function useMergePlan(gameId: string, targetBranchId: string, planId: string) {
  return useQuery({
    queryKey: mergeKeys.plan(gameId, targetBranchId, planId),
    queryFn: () => getMergePlan(gameId, targetBranchId, planId),
    enabled: gameId !== '' && targetBranchId !== '' && planId !== '',
  });
}

export function startMerge(gameId: string, targetBranchId: string, sourceBranchId: string): Promise<MergePlan> {
  return api(mergePath(gameId, targetBranchId), { method: 'POST', json: { sourceBranchId } });
}

export function getMergePlan(gameId: string, targetBranchId: string, planId: string): Promise<MergePlan> {
  return api(mergePath(gameId, targetBranchId, planId));
}

export async function resolveMergeConflict(
  gameId: string,
  targetBranchId: string,
  planId: string,
  conflictId: string,
  resolution: ConflictResolution,
): Promise<MergePlan> {
  const plan = await api<MergePlan>(`${mergePath(gameId, targetBranchId, planId)}/conflicts/${segment(conflictId)}`, {
    method: 'POST',
    json: { resolution },
  });
  queryClient.setQueryData(mergeKeys.plan(gameId, targetBranchId, planId), plan);
  return plan;
}

export async function resolveAllMergeConflicts(
  gameId: string,
  targetBranchId: string,
  planId: string,
  resolution: 'ours' | 'theirs',
): Promise<MergePlan> {
  const plan = await api<MergePlan>(`${mergePath(gameId, targetBranchId, planId)}/resolve-all`, {
    method: 'POST',
    json: { resolution },
  });
  queryClient.setQueryData(mergeKeys.plan(gameId, targetBranchId, planId), plan);
  return plan;
}

export async function previewMerge(gameId: string, targetBranchId: string, planId: string): Promise<MergePreview> {
  const preview = await api<MergePreview>(`${mergePath(gameId, targetBranchId, planId)}/preview`, { method: 'POST' });
  await queryClient.invalidateQueries({ queryKey: mergeKeys.plan(gameId, targetBranchId, planId) });
  return preview;
}

export async function landMerge(
  gameId: string,
  targetBranchId: string,
  planId: string,
  lease: { sessionId: string; token: number },
): Promise<{ rev: number }> {
  const landed = await api<{ rev: number }>(`${mergePath(gameId, targetBranchId, planId)}/land`, {
    method: 'POST',
    json: lease,
  });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: mergeKeys.plan(gameId, targetBranchId, planId) }),
    queryClient.invalidateQueries({ queryKey: versionKeys.branches(gameId) }),
  ]);
  return landed;
}

export async function abandonMerge(gameId: string, targetBranchId: string, planId: string): Promise<MergePlan> {
  const plan = await api<MergePlan>(`${mergePath(gameId, targetBranchId, planId)}/abandon`, { method: 'POST' });
  queryClient.setQueryData(mergeKeys.plan(gameId, targetBranchId, planId), plan);
  return plan;
}

function mergePath(gameId: string, targetBranchId: string, planId?: string): string {
  const base = `/games/${segment(gameId)}/branches/${segment(targetBranchId)}/merges`;
  return planId === undefined ? base : `${base}/${segment(planId)}`;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
