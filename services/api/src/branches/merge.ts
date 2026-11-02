import type {
  Branch,
  ControlDecl,
  DesignDoc,
  GameManifest,
  MergeConflict,
  MergePlan,
  Patch,
  Transaction,
} from '@ogm/contracts';
import { MergePlanSchema } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';
import { InvalidResolution, apply, applyResolutions, planMerge, sideDelta } from '@ogm/design-log';

import type { BaseDocSource } from '../design/base-doc.js';
import { assertLeaseForWrite } from '../design/lease.js';
import { snapshotAt } from '../design/snapshot.js';
import { appendTransaction, findTransaction, readTransactions, resolveBranch, stableId } from '../design/store.js';
import { setStatus } from './service.js';

type Resolution = NonNullable<MergeConflict['resolution']>;
type MergeLease = { actor: string; sessionId: string; token: number };
type PlanRow = {
  plan_json: string;
  status: MergePlan['status'];
  target_head_rev: number;
  landed_tx_id: string | null;
  rolled_back_tx_id: string | null;
};

export class MergePlanNotFound extends Error {
  constructor() {
    super('merge plan not found');
    this.name = 'MergePlanNotFound';
  }
}

export class InvalidBranchPair extends Error {
  constructor() {
    super('branches do not share a direct fork point');
    this.name = 'InvalidBranchPair';
  }
}

export class TargetMoved extends Error {
  constructor() {
    super('merge target moved after planning');
    this.name = 'TargetMoved';
  }
}

export class WrongMergeStatus extends Error {
  constructor(readonly status: MergePlan['status']) {
    super(`merge plan cannot perform this operation from ${status}`);
    this.name = 'WrongMergeStatus';
  }
}

export class MergeBuildMissing extends Error {
  constructor() {
    super('merge target has no build');
    this.name = 'MergeBuildMissing';
  }
}

function emptyManifest(): GameManifest {
  return {
    id: 'empty',
    sdk: '^1.0.0',
    title: 'Empty',
    inputs: { actions: {} },
    presentation: { orientation: 'any', minLogical: { w: 1, h: 1 }, fit: 'responsive' },
    view: 'topdown',
    dimension: '2d',
    capabilities: [],
    palette: { categories: [], items: [] },
    tools: [],
    gizmos: {},
    saves: false,
    controls: [],
    overrides: { aliases: {}, retired: [] },
  } as GameManifest;
}

async function manifestFor(source: BaseDocSource, branch: Branch): Promise<GameManifest> {
  return branch.latestBuildId ? source.manifest(branch.gameId, branch.latestBuildId) : emptyManifest();
}

function controlsOf(manifest: GameManifest): ControlDecl[] {
  return (manifest as GameManifest & { controls?: ControlDecl[] }).controls ?? [];
}

function planRow(sqlite: Sqlite, gameId: string, planId: string): PlanRow {
  const row = sqlite
    .prepare<[string, string], PlanRow>('SELECT * FROM merge_plans WHERE game_id = ? AND id = ?')
    .get(gameId, planId);
  if (!row) throw new MergePlanNotFound();
  return row;
}

function parsedPlan(row: PlanRow): MergePlan {
  return MergePlanSchema.parse({ ...JSON.parse(row.plan_json), status: row.status });
}

function writePlan(sqlite: Sqlite, plan: MergePlan): void {
  const updated = sqlite
    .prepare(
      `UPDATE merge_plans
       SET plan_json = ?, status = ?
       WHERE game_id = ? AND id = ?`,
    )
    .run(JSON.stringify(plan), plan.status, plan.gameId, plan.id);
  if (updated.changes !== 1) throw new MergePlanNotFound();
}

export function getMergePlan(sqlite: Sqlite, gameId: string, planId: string): MergePlan {
  return parsedPlan(planRow(sqlite, gameId, planId));
}

function directFork(
  source: Branch,
  target: Branch,
): { baseBranchId: string; baseRev: number; sourceAfter: number; targetAfter: number } {
  if (source.forkPoint?.parentBranchId === target.id) {
    return {
      baseBranchId: target.id,
      baseRev: source.forkPoint.parentRev,
      sourceAfter: 0,
      targetAfter: source.forkPoint.parentRev,
    };
  }
  if (target.forkPoint?.parentBranchId === source.id) {
    return {
      baseBranchId: source.id,
      baseRev: target.forkPoint.parentRev,
      sourceAfter: target.forkPoint.parentRev,
      targetAfter: 0,
    };
  }
  throw new InvalidBranchPair();
}

function transactionsThrough(sqlite: Sqlite, branch: Branch, afterRev: number): Transaction[] {
  return readTransactions(sqlite, branch.id, afterRev, Number.MAX_SAFE_INTEGER).filter(
    (transaction) => transaction.rev <= branch.headRev,
  );
}

export async function createMergePlan(
  sqlite: Sqlite,
  source: BaseDocSource,
  input: { gameId: string; sourceBranchId: string; targetBranchId: string },
  options: { id?: string; now?: Date } = {},
): Promise<MergePlan> {
  const sourceBranch = resolveBranch(sqlite, input.gameId, input.sourceBranchId);
  const targetBranch = resolveBranch(sqlite, input.gameId, input.targetBranchId);
  if (sourceBranch.id === targetBranch.id) throw new InvalidBranchPair();
  const fork = directFork(sourceBranch, targetBranch);
  const [{ doc: baseDoc }, oursManifest, theirsManifest] = await Promise.all([
    snapshotAt(sqlite, source, fork.baseBranchId, fork.baseRev),
    manifestFor(source, sourceBranch),
    manifestFor(source, targetBranch),
  ]);
  const ours = sideDelta(baseDoc, transactionsThrough(sqlite, sourceBranch, fork.sourceAfter));
  const theirs = sideDelta(baseDoc, transactionsThrough(sqlite, targetBranch, fork.targetAfter));
  const merge = planMerge({ baseDoc, ours, theirs, oursManifest, theirsManifest });
  const now = options.now ?? new Date();
  const plan: MergePlan = {
    id: options.id ?? stableId('merge', now),
    gameId: input.gameId,
    sourceBranchId: sourceBranch.id,
    targetBranchId: targetBranch.id,
    baseRev: fork.baseRev,
    auto: merge.auto,
    conflicts: merge.conflicts,
    code: 'clean',
    status: merge.conflicts.length > 0 ? 'resolving' : 'planned',
  };
  sqlite
    .prepare(
      `INSERT INTO merge_plans
         (id, game_id, source_branch_id, target_branch_id, base_rev, target_head_rev,
          plan_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      plan.id,
      plan.gameId,
      plan.sourceBranchId,
      plan.targetBranchId,
      plan.baseRev,
      targetBranch.headRev,
      JSON.stringify(plan),
      plan.status,
      now.toISOString(),
    );
  return plan;
}

export function resolveMergeConflict(
  sqlite: Sqlite,
  gameId: string,
  planId: string,
  conflictId: string,
  resolution: Resolution,
): MergePlan {
  const plan = getMergePlan(sqlite, gameId, planId);
  if (plan.status !== 'resolving') throw new WrongMergeStatus(plan.status);
  const conflict = plan.conflicts.find((candidate) => candidate.id === conflictId);
  if (!conflict) throw new MergePlanNotFound();
  if (resolution === 'both' && conflict.kind !== 'delete_vs_edit') {
    throw new InvalidResolution(conflict.id);
  }
  conflict.resolution = resolution;
  writePlan(sqlite, plan);
  return plan;
}

export function resolveAllMergeConflicts(
  sqlite: Sqlite,
  gameId: string,
  planId: string,
  resolution: 'ours' | 'theirs',
): MergePlan {
  const plan = getMergePlan(sqlite, gameId, planId);
  if (plan.status !== 'resolving') throw new WrongMergeStatus(plan.status);
  plan.conflicts.forEach((conflict) => {
    conflict.resolution = resolution;
  });
  writePlan(sqlite, plan);
  return plan;
}

function assertMutable(plan: MergePlan): void {
  if (plan.status === 'landed' || plan.status === 'abandoned') throw new WrongMergeStatus(plan.status);
}

async function controlsForPlan(sqlite: Sqlite, source: BaseDocSource, plan: MergePlan): Promise<ControlDecl[]> {
  const sourceBranch = resolveBranch(sqlite, plan.gameId, plan.sourceBranchId);
  const targetBranch = resolveBranch(sqlite, plan.gameId, plan.targetBranchId);
  const [ours, theirs] = await Promise.all([manifestFor(source, sourceBranch), manifestFor(source, targetBranch)]);
  return [...new Map([...controlsOf(ours), ...controlsOf(theirs)].map((control) => [control.id, control])).values()];
}

export async function previewMergePlan(
  sqlite: Sqlite,
  source: BaseDocSource,
  gameId: string,
  planId: string,
): Promise<{ previewBuildId: string; doc: DesignDoc; rev: number }> {
  const row = planRow(sqlite, gameId, planId);
  const plan = parsedPlan(row);
  assertMutable(plan);
  const target = resolveBranch(sqlite, gameId, plan.targetBranchId);
  const [controls, snapshot] = await Promise.all([
    controlsForPlan(sqlite, source, plan),
    snapshotAt(sqlite, source, target.id, row.target_head_rev),
  ]);
  if (!snapshot.buildId) throw new MergeBuildMissing();
  return sqlite
    .transaction(() => {
      const currentRow = planRow(sqlite, gameId, planId);
      const currentPlan = parsedPlan(currentRow);
      assertMutable(currentPlan);
      const doc = apply(snapshot.doc, applyResolutions(currentPlan, controls));
      currentPlan.previewBuildId = snapshot.buildId!;
      currentPlan.status = 'previewing';
      writePlan(sqlite, currentPlan);
      return { previewBuildId: snapshot.buildId!, doc, rev: currentRow.target_head_rev };
    })
    .immediate();
}

function previousValue(doc: DesignDoc, path: Patch['path']): unknown {
  let value: unknown = doc;
  for (const part of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string | number, unknown>)[part];
  }
  return value;
}

function patchesWithInverse(doc: DesignDoc, patches: Patch[]): { patches: Patch[]; inverse: Patch[] } {
  let current = structuredClone(doc);
  const inverse: Patch[] = [];
  for (const patch of patches) {
    const before = previousValue(current, patch.path);
    const path = structuredClone(patch.path);
    if (patch.op === 'remove') {
      if (before !== undefined) inverse.unshift({ op: 'add', path, value: structuredClone(before) });
    } else if (before === undefined) {
      inverse.unshift({ op: 'remove', path });
    } else {
      inverse.unshift({ op: 'replace', path, value: structuredClone(before) });
    }
    current = apply(current, [patch]);
  }
  return { patches, inverse };
}

export async function landMergePlan(
  sqlite: Sqlite,
  source: BaseDocSource,
  gameId: string,
  planId: string,
  lease: MergeLease,
  options: { now?: Date } = {},
): Promise<Transaction> {
  const row = planRow(sqlite, gameId, planId);
  const plan = parsedPlan(row);
  const controls = await controlsForPlan(sqlite, source, plan);
  const patches = applyResolutions(plan, controls);
  if (plan.status !== 'previewing') throw new WrongMergeStatus(plan.status);
  const target = resolveBranch(sqlite, gameId, plan.targetBranchId);
  if (target.headRev !== row.target_head_rev) throw new TargetMoved();
  if (!target.latestBuildId) throw new MergeBuildMissing();
  const snapshot = await snapshotAt(sqlite, source, target.id, row.target_head_rev);
  const prepared = patchesWithInverse(snapshot.doc, patches);
  const now = options.now ?? new Date();

  return sqlite
    .transaction(() => {
      const currentRow = planRow(sqlite, gameId, planId);
      const currentPlan = parsedPlan(currentRow);
      const currentTarget = resolveBranch(sqlite, gameId, currentPlan.targetBranchId);
      if (currentPlan.status !== 'previewing') throw new WrongMergeStatus(currentPlan.status);
      if (currentTarget.headRev !== currentRow.target_head_rev) throw new TargetMoved();
      assertLeaseForWrite(
        sqlite,
        {
          gameId,
          branchId: currentTarget.id,
          userId: lease.actor,
          sessionId: lease.sessionId,
          token: lease.token,
        },
        now,
      );
      const sourceBranch = resolveBranch(sqlite, gameId, currentPlan.sourceBranchId);
      const transaction = appendTransaction(
        sqlite,
        {
          gameId,
          branchId: currentTarget.id,
          baseRev: currentTarget.headRev,
          leaseToken: 0,
          actor: lease.actor,
          kind: 'merge',
          label: `Merged ${sourceBranch.name} into ${currentTarget.name}`,
          baseBuildId: currentTarget.latestBuildId!,
          commands: [{ op: 'invoke', command: 'merge.land', args: { planId } }],
          patches: prepared.patches,
          inverse: prepared.inverse,
        },
        { now },
      );
      currentPlan.status = 'landed';
      writePlan(sqlite, currentPlan);
      sqlite.prepare('UPDATE merge_plans SET landed_tx_id = ? WHERE id = ?').run(transaction.id, planId);
      if (currentTarget.name === 'main') setStatus(sqlite, sourceBranch.id, 'merged');
      return transaction;
    })
    .immediate();
}

export function abandonMergePlan(sqlite: Sqlite, gameId: string, planId: string): MergePlan {
  const plan = getMergePlan(sqlite, gameId, planId);
  assertMutable(plan);
  plan.status = 'abandoned';
  writePlan(sqlite, plan);
  return plan;
}

export function rollbackMergePlan(
  sqlite: Sqlite,
  gameId: string,
  planId: string,
  lease: MergeLease,
  options: { now?: Date } = {},
): Transaction {
  const now = options.now ?? new Date();
  return sqlite
    .transaction(() => {
      const row = planRow(sqlite, gameId, planId);
      const plan = parsedPlan(row);
      if (plan.status !== 'landed' || !row.landed_tx_id || row.rolled_back_tx_id) {
        throw new WrongMergeStatus(plan.status);
      }
      const landed = findTransaction(sqlite, row.landed_tx_id);
      if (!landed) throw new MergePlanNotFound();
      const target = resolveBranch(sqlite, gameId, plan.targetBranchId);
      if (!target.latestBuildId) throw new MergeBuildMissing();
      assertLeaseForWrite(
        sqlite,
        {
          gameId,
          branchId: target.id,
          userId: lease.actor,
          sessionId: lease.sessionId,
          token: lease.token,
        },
        now,
      );
      const sourceBranch = resolveBranch(sqlite, gameId, plan.sourceBranchId);
      const transaction = appendTransaction(
        sqlite,
        {
          gameId,
          branchId: target.id,
          baseRev: target.headRev,
          leaseToken: 0,
          actor: lease.actor,
          kind: 'merge',
          label: `Undid merge of ${sourceBranch.name}`,
          baseBuildId: target.latestBuildId,
          commands: [{ op: 'invoke', command: 'merge.rollback', args: { planId } }],
          patches: landed.inverse,
          inverse: landed.patches,
        },
        { now },
      );
      sqlite.prepare('UPDATE merge_plans SET rolled_back_tx_id = ? WHERE id = ?').run(transaction.id, planId);
      return transaction;
    })
    .immediate();
}
