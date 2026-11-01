import type { OverrideEntry, OverrideKey, WorkingSet } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { fold } from '../src/fold.js';
import { baseDoc, ids } from './helpers.js';

const txId = 'tx_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const createdEntity = 'e_01BX5ZZKBKACTAV9WEVGEMMVRZ';

function entry(
  key: OverrideKey,
  status: OverrideEntry['status'],
  value: unknown,
  targetId: string | 'global' = ids.entity,
): OverrideEntry {
  const [controlId] = key.split('@');
  return {
    key,
    controlId,
    targetId,
    value,
    baseValueAtEdit: null,
    txId,
    rev: 1,
    status,
  };
}

function workingSet(entries: OverrideEntry[], reverseEntityOps = false): WorkingSet {
  const entityOps = reverseEntityOps
    ? {
        [ids.entity]: { kind: 'delete' as const, entityId: ids.entity, txId },
        [createdEntity]: {
          kind: 'create' as const,
          entityId: createdEntity,
          parent: 'level_2',
          prefab: 'chest',
          props: { 'chest.open': false },
          txId,
        },
      }
    : {
        [createdEntity]: {
          kind: 'create' as const,
          entityId: createdEntity,
          parent: 'level_2',
          prefab: 'chest',
          props: { 'chest.open': false },
          txId,
        },
        [ids.entity]: { kind: 'delete' as const, entityId: ids.entity, txId },
      };
  return {
    gameId: ids.game,
    branchId: ids.branch,
    buildId: ids.build,
    headRev: 1,
    entries: Object.fromEntries(entries.map((item) => [item.key, item])),
    entityOps,
  };
}

describe('fold', () => {
  it('is byte-identical across repeated folds and key-order permutations', () => {
    const entries = [
      entry('chest.open@e_01BX5ZZKBKACTAV9WEVGEMMVRZ', 'carried', true, createdEntity),
      entry('world.gravity@global', 'renamed', 4.9, 'global'),
    ];

    const first = fold(baseDoc(), workingSet(entries));
    const repeated = fold(baseDoc(), workingSet(entries));
    const permuted = fold(baseDoc(), workingSet([...entries].reverse(), true));

    expect(repeated).toEqual(first);
    expect(permuted).toEqual(first);
    expect(first.files).toEqual([{ path: 'design/design.json', content: expect.stringMatching(/\n$/) }]);
  });

  it('includes only carried and renamed entries', () => {
    const statuses: OverrideEntry['status'][] = ['carried', 'renamed', 'needs_choice', 'conflict', 'dropped'];
    const entries = statuses.map((status, index) =>
      entry(`control.${status}@global` as OverrideKey, status, index, 'global'),
    );

    const result = fold(baseDoc(), workingSet(entries));

    expect(result.doc.globals).toMatchObject({ 'control.carried': 0, 'control.renamed': 1 });
    expect(result.doc.globals).not.toHaveProperty('control.needs_choice');
    expect(result.doc.globals).not.toHaveProperty('control.conflict');
    expect(result.doc.globals).not.toHaveProperty('control.dropped');
  });

  it('applies creates and deletes before setting entity values', () => {
    const result = fold(
      baseDoc(),
      workingSet([entry(`chest.open@${createdEntity}`, 'carried', true, createdEntity)]),
    );

    expect(result.doc.entities[ids.entity]).toBeUndefined();
    expect(result.doc.entities[createdEntity]).toEqual({
      id: createdEntity,
      prefab: 'chest',
      level: 'level_2',
      origin: 'creator',
      props: { 'chest.open': true },
    });
  });
});
