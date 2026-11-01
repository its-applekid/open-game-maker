import type { DesignDoc, EditorCommand, OverrideKey, Patch, Transaction } from '@ogm/contracts';
import { applyPatches, enablePatches, produceWithPatches, type Patch as ImmerPatch } from 'immer';

import { validatePatches, type ValidationError } from './validate.js';

enablePatches();

export class UnknownTargetError extends Error {
  readonly targetId: string;

  constructor(targetId: string) {
    super(`unknown design target: ${targetId}`);
    this.name = 'UnknownTargetError';
    this.targetId = targetId;
  }
}

export class MissingBaseValueError extends Error {
  readonly key: OverrideKey;

  constructor(key: OverrideKey) {
    super(`missing base value for reset: ${key}`);
    this.name = 'MissingBaseValueError';
    this.key = key;
  }
}

export class InvalidPatchError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super(`invalid design patches: ${errors.map(({ code }) => code).join(', ')}`);
    this.name = 'InvalidPatchError';
    this.errors = errors;
  }
}

export type TransactionMeta = { baseValues?: Partial<Record<OverrideKey, unknown>> };
export type TransactionDraft = { doc: DesignDoc; patches: Patch[]; inverse: Patch[] };

export function makeTransaction(
  doc: DesignDoc,
  commands: readonly EditorCommand[],
  meta: TransactionMeta = {},
): TransactionDraft {
  const [next, patches, inverse] = produceWithPatches(doc, (draft) => {
    for (const command of commands) {
      if (command.op === 'invoke') continue;
      const targets = command.targets;
      if (targets === 'global') {
        const key = `${command.control}@global` as OverrideKey;
        if (command.op === 'set') {
          draft.globals[command.control] = command.value;
        } else {
          if (!(key in (meta.baseValues ?? {}))) throw new MissingBaseValueError(key);
          const baseValue = meta.baseValues?.[key];
          if (baseValue === undefined) delete draft.globals[command.control];
          else draft.globals[command.control] = baseValue;
        }
        continue;
      }

      for (const target of targets) {
        const entity = draft.entities[target];
        if (entity === undefined) throw new UnknownTargetError(target);
        if (command.op === 'set') {
          entity.props[command.control] = command.value;
        } else {
          const key = `${command.control}@${target}` as OverrideKey;
          if (!(key in (meta.baseValues ?? {}))) throw new MissingBaseValueError(key);
          const baseValue = meta.baseValues?.[key];
          if (baseValue === undefined) delete entity.props[command.control];
          else entity.props[command.control] = baseValue;
        }
      }
    }
  });

  return { doc: next, patches: patches as Patch[], inverse: inverse as Patch[] };
}

export function apply(doc: DesignDoc, patches: readonly Patch[]): DesignDoc {
  const validation = validatePatches(patches);
  if (!validation.ok) throw new InvalidPatchError(validation.errors);
  return applyPatches(doc, patches as unknown as ImmerPatch[]) as DesignDoc;
}

export function invert(tx: Pick<Transaction, 'inverse'>): Transaction['inverse'] {
  return tx.inverse;
}

export function toPointer(path: Patch['path']): string {
  return `/${path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
}
