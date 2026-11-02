import { isDeepStrictEqual } from 'node:util';

import type {
  ControlDecl,
  DesignDoc,
  FieldChange,
  GameManifest,
  MergeConflict,
  MergePlan,
  Patch,
  SideDelta,
  Transaction,
} from '@ogm/contracts';

import { apply, toPointer } from './apply.js';
import { validateValue } from './validate.js';

type ConflictSide = MergeConflict['ours'];

export class UnresolvedConflict extends Error {
  constructor(readonly conflictId: string) {
    super(`merge conflict is unresolved: ${conflictId}`);
    this.name = 'UnresolvedConflict';
  }
}

export class InvalidResolution extends Error {
  constructor(readonly conflictId: string) {
    super(`invalid merge resolution: ${conflictId}`);
    this.name = 'InvalidResolution';
  }
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function valueAt(doc: DesignDoc, path: readonly (string | number)[]): unknown {
  let value: unknown = doc;
  for (const part of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string | number, unknown>)[part];
  }
  return value;
}

function fromPointer(pointer: string): Patch['path'] {
  if (!pointer.startsWith('/')) throw new Error(`invalid JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function normalizedPath(path: Patch['path'], baseDoc: DesignDoc, finalDoc: DesignDoc): Patch['path'] {
  if (path[0] === 'entities' && typeof path[1] === 'string') {
    const entityId = path[1];
    if (path.length === 2 || baseDoc.entities[entityId] === undefined || finalDoc.entities[entityId] === undefined) {
      return ['entities', entityId];
    }
  }
  const chunks = path.findIndex((part) => part === 'chunks');
  return chunks >= 0 && path.length > chunks + 1 ? path.slice(0, chunks + 2) : path;
}

function entityRoot(pointer: string): string | undefined {
  const path = fromPointer(pointer);
  return path[0] === 'entities' && typeof path[1] === 'string' ? toPointer(['entities', path[1]]) : undefined;
}

function isFieldChange(side: ConflictSide | SideDelta[string] | undefined): side is FieldChange {
  return typeof side === 'object' && side !== null && 'path' in side;
}

function patchForChange(change: FieldChange, forceReplace = false): Patch {
  const path = fromPointer(change.path);
  if (change.after === undefined) return { op: 'remove', path };
  if (forceReplace || change.before !== undefined) {
    return { op: 'replace', path, value: cloneValue(change.after) };
  }
  return { op: 'add', path, value: cloneValue(change.after) };
}

function removePatch(pointer: string): Patch {
  return { op: 'remove', path: fromPointer(pointer) };
}

function conflictId(index: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let value = index;
  let encoded = '';
  do {
    encoded = alphabet[value % 32] + encoded;
    value = Math.floor(value / 32);
  } while (value > 0);
  return `conflict_${encoded.padStart(26, '0')}`;
}

/**
 * Reduces one side of a branch merge to the final explicit write for each
 * design path. Entity creates/deletes stay at the entity root, while stroke
 * cell edits collapse to their chunk key.
 */
export function sideDelta(baseDoc: DesignDoc, transactions: readonly Transaction[]): SideDelta {
  const sorted = [...transactions].sort((left, right) => left.rev - right.rev);
  const finalDoc = apply(
    baseDoc,
    sorted.flatMap((transaction) => transaction.patches),
  );

  const touched = new Map<string, { path: Patch['path']; txId: string }>();
  for (const transaction of sorted) {
    for (const patch of transaction.patches) {
      const path = normalizedPath(patch.path, baseDoc, finalDoc);
      touched.set(toPointer(path), { path, txId: transaction.id });
    }
  }

  for (const [pointer, { path }] of [...touched]) {
    for (let length = 1; length < path.length; length += 1) {
      if (touched.has(toPointer(path.slice(0, length)))) {
        touched.delete(pointer);
        break;
      }
    }
  }

  const result: SideDelta = {};
  for (const [pointer, touchedPath] of [...touched.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const after = valueAt(finalDoc, touchedPath.path);
    if (touchedPath.path.length === 2 && touchedPath.path[0] === 'entities' && after === undefined) {
      result[pointer] = 'deleted';
      continue;
    }
    result[pointer] = {
      path: pointer,
      before: cloneValue(valueAt(baseDoc, touchedPath.path)),
      after: cloneValue(after),
      txId: touchedPath.txId,
    };
  }
  return result;
}

function controlForPath(manifest: GameManifest, pointer: string): ControlDecl | undefined {
  const controls = (manifest as GameManifest & { controls?: ControlDecl[] }).controls ?? [];
  return controls.find((control) => pointer === control.path || pointer.endsWith(control.path));
}

function controlRemoved(
  pointer: string,
  ours: SideDelta[string] | undefined,
  theirs: SideDelta[string] | undefined,
  oursManifest: GameManifest,
  theirsManifest: GameManifest,
): { controlId: string; ours: ConflictSide; theirs: ConflictSide } | undefined {
  if (isFieldChange(ours)) {
    const control = controlForPath(oursManifest, pointer);
    const targetControl = control ? controlForPath(theirsManifest, pointer) : undefined;
    if (control && (!targetControl || theirsManifest.overrides.retired.includes(control.id))) {
      return { controlId: control.id, ours, theirs: 'removed_by_build' };
    }
  }
  if (isFieldChange(theirs)) {
    const control = controlForPath(theirsManifest, pointer);
    const sourceControl = control ? controlForPath(oursManifest, pointer) : undefined;
    if (control && (!sourceControl || oursManifest.overrides.retired.includes(control.id))) {
      return { controlId: control.id, ours: 'removed_by_build', theirs };
    }
  }
  return undefined;
}

function changesUnder(delta: SideDelta, root: string): Array<[string, SideDelta[string]]> {
  return Object.entries(delta)
    .filter(([pointer]) => pointer === root || pointer.startsWith(`${root}/`))
    .sort(([left], [right]) => left.localeCompare(right));
}

function materializeEntityChange(baseDoc: DesignDoc, delta: SideDelta, entityId: string): FieldChange {
  const root = toPointer(['entities', entityId]);
  const entries = changesUnder(delta, root).filter((entry): entry is [string, FieldChange] => isFieldChange(entry[1]));
  const patches = entries.map(([, change]) => patchForChange(change));
  const result = apply(baseDoc, patches);
  return {
    path: root,
    before: cloneValue(baseDoc.entities[entityId]),
    after: cloneValue(result.entities[entityId]),
    txId: entries.at(-1)?.[1].txId ?? 'tx_00000000000000000000000000',
  };
}

function entityIdForRoot(pointer: string): string | undefined {
  const path = fromPointer(pointer);
  return path.length === 2 && path[0] === 'entities' && typeof path[1] === 'string' ? path[1] : undefined;
}

export type PlanMergeInput = {
  baseDoc: DesignDoc;
  ours: SideDelta;
  theirs: SideDelta;
  oursManifest: GameManifest;
  theirsManifest: GameManifest;
};

/** Plans the source ("ours") changes that must be applied to the target ("theirs"). */
export function planMerge(input: PlanMergeInput): { auto: Patch[]; conflicts: MergeConflict[] } {
  const consumed = new Set<string>();
  const auto: Patch[] = [];
  const conflicts: MergeConflict[] = [];

  const deletedRoots = new Set(
    [...Object.entries(input.ours), ...Object.entries(input.theirs)]
      .filter(([, change]) => change === 'deleted')
      .map(([pointer]) => pointer),
  );
  for (const root of [...deletedRoots].sort()) {
    const entityId = entityIdForRoot(root);
    if (!entityId) continue;
    const oursEntries = changesUnder(input.ours, root);
    const theirsEntries = changesUnder(input.theirs, root);
    const oursDeleted = input.ours[root] === 'deleted';
    const theirsDeleted = input.theirs[root] === 'deleted';
    if (oursDeleted && theirsDeleted) {
      oursEntries.forEach(([pointer]) => consumed.add(pointer));
      theirsEntries.forEach(([pointer]) => consumed.add(pointer));
      continue;
    }
    const oppositeEntries = oursDeleted ? theirsEntries : oursEntries;
    if (oppositeEntries.length === 0) continue;

    const edited = materializeEntityChange(input.baseDoc, oursDeleted ? input.theirs : input.ours, entityId);
    conflicts.push({
      id: conflictId(conflicts.length),
      path: root,
      entityId,
      kind: 'delete_vs_edit',
      ours: oursDeleted ? 'deleted' : edited,
      theirs: theirsDeleted ? 'deleted' : edited,
    });
    oursEntries.forEach(([pointer]) => consumed.add(pointer));
    theirsEntries.forEach(([pointer]) => consumed.add(pointer));
  }

  const pointers = [...new Set([...Object.keys(input.ours), ...Object.keys(input.theirs)])].sort();
  for (const pointer of pointers) {
    if (consumed.has(pointer)) continue;
    const ours = input.ours[pointer];
    const theirs = input.theirs[pointer];

    const removed = controlRemoved(pointer, ours, theirs, input.oursManifest, input.theirsManifest);
    if (removed) {
      const entityId = entityRoot(pointer);
      conflicts.push({
        id: conflictId(conflicts.length),
        path: pointer,
        ...(entityId ? { entityId: fromPointer(entityId)[1] as string } : {}),
        controlId: removed.controlId,
        kind: 'control_removed',
        ours: removed.ours,
        theirs: removed.theirs,
      });
      continue;
    }

    if (ours === undefined) continue;
    if (theirs === undefined) {
      if (ours === 'deleted') auto.push(removePatch(pointer));
      else auto.push(patchForChange(ours));
      continue;
    }
    if (ours === 'deleted' && theirs === 'deleted') continue;
    if (ours === 'deleted' || theirs === 'deleted') {
      conflicts.push({
        id: conflictId(conflicts.length),
        path: pointer,
        kind: 'delete_vs_edit',
        ours,
        theirs,
      });
      continue;
    }
    if (isDeepStrictEqual(ours.after, theirs.after)) {
      if (ours.after !== undefined) auto.push(patchForChange(ours, true));
      continue;
    }
    const control = controlForPath(input.oursManifest, pointer) ?? controlForPath(input.theirsManifest, pointer);
    const root = entityRoot(pointer);
    conflicts.push({
      id: conflictId(conflicts.length),
      path: pointer,
      ...(root ? { entityId: fromPointer(root)[1] as string } : {}),
      ...(control ? { controlId: control.id } : {}),
      kind: 'both_changed',
      ours,
      theirs,
    });
  }

  return {
    auto: auto.sort((left, right) => toPointer(left.path).localeCompare(toPointer(right.path))),
    conflicts: conflicts.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function sourceResolutionPatch(conflict: MergeConflict): Patch | undefined {
  if (conflict.ours === 'deleted' || conflict.ours === 'removed_by_build') {
    return removePatch(conflict.path);
  }
  if (!isFieldChange(conflict.ours)) return undefined;
  if (conflict.ours.after === undefined) return removePatch(conflict.path);
  const targetMissing = conflict.theirs === 'deleted' || conflict.theirs === 'removed_by_build';
  return {
    op: targetMissing ? 'add' : 'replace',
    path: fromPointer(conflict.path),
    value: cloneValue(conflict.ours.after),
  };
}

/**
 * Produces the patches that land on the target. Choosing "theirs" is a no-op
 * because the target already contains that side of the plan.
 */
export function applyResolutions(
  plan: Pick<MergePlan, 'auto' | 'conflicts'>,
  controls: readonly ControlDecl[],
): Patch[] {
  const patches = plan.auto.map((patch) => structuredClone(patch));
  const controlsById = new Map(controls.map((control) => [control.id, control]));

  for (const conflict of plan.conflicts) {
    const resolution = conflict.resolution;
    if (resolution === undefined) throw new UnresolvedConflict(conflict.id);
    if (resolution === 'theirs') continue;
    if (resolution === 'ours') {
      const patch = sourceResolutionPatch(conflict);
      if (patch) patches.push(patch);
      continue;
    }
    if (resolution === 'both') {
      if (conflict.kind !== 'delete_vs_edit') throw new InvalidResolution(conflict.id);
      if (isFieldChange(conflict.ours)) {
        const patch = sourceResolutionPatch(conflict);
        if (patch) patches.push(patch);
      }
      continue;
    }

    const control = conflict.controlId ? controlsById.get(conflict.controlId) : undefined;
    if (!control || !validateValue(control, resolution.value).ok) {
      throw new InvalidResolution(conflict.id);
    }
    patches.push({
      op: 'add',
      path: fromPointer(conflict.path),
      value: cloneValue(resolution.value),
    });
  }
  return patches;
}
