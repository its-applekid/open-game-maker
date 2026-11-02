import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ControlDecl, DesignDoc, GameManifest, MergePlan, Patch } from '@ogm/contracts';

import { apply } from '../src/apply.js';
import { InvalidResolution, applyResolutions, planMerge, sideDelta } from '../src/merge.js';
import { baseDoc, ids, transaction } from './helpers.js';

const entityB = 'e_01BX5ZZKBKACTAV9WEVGEMMVRZ';

function control(id: string, path: string, kind: 'toggle' | 'count' = 'toggle'): ControlDecl {
  return {
    id,
    label: id,
    scope: path.startsWith('/globals/') ? 'global' : 'instance',
    path,
    widget: kind === 'toggle' ? { kind: 'toggle' } : { kind: 'count', min: 0, max: 10, semantics: 'param' },
    default: kind === 'toggle' ? false : 0,
  };
}

function manifest(controls: ControlDecl[], retired: string[] = []): GameManifest {
  return {
    id: 'fixture',
    sdk: '^1.0.0',
    title: 'Fixture',
    inputs: { actions: {} },
    presentation: { orientation: 'any', minLogical: { w: 320, h: 180 }, fit: 'responsive' },
    view: 'topdown',
    dimension: '2d',
    capabilities: [],
    palette: { categories: [], items: [] },
    tools: [],
    gizmos: {},
    saves: false,
    controls,
    overrides: { aliases: {}, retired },
  } as GameManifest;
}

function mergePlan(auto: Patch[], conflicts: MergePlan['conflicts']): MergePlan {
  return {
    id: 'merge_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    gameId: ids.game,
    sourceBranchId: ids.branchB,
    targetBranchId: ids.branch,
    baseRev: 40,
    auto,
    conflicts,
    code: 'clean',
    status: conflicts.length === 0 ? 'planned' : 'resolving',
  };
}

describe('sideDelta', () => {
  it('keeps the base before-value and last write, including an explicit write back to the base value', () => {
    const doc = baseDoc();
    const txs = [
      transaction(1, [], [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: true }]),
      transaction(2, [], [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false }]),
    ];

    expect(sideDelta(doc, txs)).toEqual({
      [`/entities/${ids.entity}/props/door.locked`]: {
        path: `/entities/${ids.entity}/props/door.locked`,
        before: false,
        after: false,
        txId: txs[1]!.id,
      },
    });
  });

  it('reduces stroke cells to their chunk pointer', () => {
    const doc = baseDoc({ chunks: { '3_4': { cells: { a: 0, b: 0 } } } });
    const tx = transaction(
      1,
      [],
      [
        {
          op: 'replace',
          path: ['entities', ids.entity, 'props', 'chunks', '3_4', 'cells', 'a'],
          value: 1,
        },
        {
          op: 'replace',
          path: ['entities', ids.entity, 'props', 'chunks', '3_4', 'cells', 'b'],
          value: 2,
        },
      ],
    );

    expect(sideDelta(doc, [tx])).toEqual({
      [`/entities/${ids.entity}/props/chunks/3_4`]: {
        path: `/entities/${ids.entity}/props/chunks/3_4`,
        before: { cells: { a: 0, b: 0 } },
        after: { cells: { a: 1, b: 2 } },
        txId: tx.id,
      },
    });
  });

  it('collapses nested writes to the shallowest touched path', () => {
    const doc = baseDoc();
    const tx = transaction(
      1,
      [],
      [
        { op: 'add', path: ['globals', 'weather'], value: { rain: true } },
        { op: 'replace', path: ['globals', 'weather', 'rain'], value: false },
      ],
    );

    expect(sideDelta(doc, [tx])).toEqual({
      '/globals/weather': {
        path: '/globals/weather',
        before: undefined,
        after: { rain: false },
        txId: tx.id,
      },
    });
  });

  it('is independent of transaction input order', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (first, second) => {
        const doc = baseDoc();
        const txs = [
          transaction(1, [], [{ op: 'replace', path: ['globals', 'world.gravity'], value: first }]),
          transaction(2, [], [{ op: 'replace', path: ['globals', 'world.gravity'], value: second }]),
        ];

        expect(sideDelta(doc, txs)).toEqual(sideDelta(doc, [...txs].reverse()));
      }),
    );
  });
});

describe('planMerge', () => {
  it('produces the AE3 both-changed conflict and keeps every source-only change automatic', () => {
    const doc = baseDoc();
    const source = sideDelta(doc, [
      transaction(
        12,
        [],
        [
          { op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false },
          { op: 'add', path: ['globals', 'branch.color'], value: 'purple' },
        ],
        ids.branchB,
      ),
    ]);
    const target = sideDelta(doc, [
      transaction(
        45,
        [],
        [
          { op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: true },
          { op: 'add', path: ['globals', 'main.music'], value: 'night' },
        ],
      ),
    ]);

    const result = planMerge({
      baseDoc: doc,
      ours: source,
      theirs: target,
      oursManifest: manifest([control('door.locked', '/props/door.locked')]),
      theirsManifest: manifest([control('door.locked', '/props/door.locked')]),
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      path: `/entities/${ids.entity}/props/door.locked`,
      kind: 'both_changed',
      ours: { before: false, after: false },
      theirs: { before: false, after: true },
    });
    expect(result.auto).toEqual([{ op: 'add', path: ['globals', 'branch.color'], value: 'purple' }]);
  });

  it('auto-merges same values and source-only values', () => {
    const doc = baseDoc();
    const ours = sideDelta(doc, [
      transaction(
        1,
        [],
        [
          { op: 'replace', path: ['globals', 'world.gravity'], value: 5 },
          { op: 'add', path: ['globals', 'fog'], value: true },
        ],
      ),
    ]);
    const theirs = sideDelta(doc, [
      transaction(1, [], [{ op: 'replace', path: ['globals', 'world.gravity'], value: 5 }], ids.branchB),
    ]);
    const result = planMerge({
      baseDoc: doc,
      ours,
      theirs,
      oursManifest: manifest([]),
      theirsManifest: manifest([]),
    });

    expect(result.conflicts).toEqual([]);
    expect(result.auto).toEqual([
      { op: 'add', path: ['globals', 'fog'], value: true },
      { op: 'replace', path: ['globals', 'world.gravity'], value: 5 },
    ]);
  });

  it('collapses delete versus descendant edits into one entity conflict and keeps both when resolved', () => {
    const doc: DesignDoc = {
      ...baseDoc(),
      entities: {
        ...baseDoc().entities,
        [entityB]: {
          id: entityB,
          prefab: 'goblin',
          level: 'level_1',
          origin: 'creator',
          props: { color: 'green', health: 3 },
        },
      },
    };
    const ours = sideDelta(doc, [transaction(1, [], [{ op: 'remove', path: ['entities', entityB] }], ids.branchB)]);
    const theirs = sideDelta(doc, [
      transaction(1, [], [{ op: 'replace', path: ['entities', entityB, 'props', 'color'], value: 'blue' }]),
    ]);
    const result = planMerge({
      baseDoc: doc,
      ours,
      theirs,
      oursManifest: manifest([]),
      theirsManifest: manifest([]),
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      path: `/entities/${entityB}`,
      entityId: entityB,
      kind: 'delete_vs_edit',
      ours: 'deleted',
      theirs: { after: { props: { color: 'blue', health: 3 } } },
    });
    result.conflicts[0]!.resolution = 'both';
    expect(applyResolutions(mergePlan(result.auto, result.conflicts), [])).toEqual([]);
  });

  it('reports a control retired by the target build instead of auto-merging its source edit', () => {
    const doc = baseDoc({ 'bat.wingflaps': 1 });
    const ours = sideDelta(doc, [
      transaction(1, [], [{ op: 'replace', path: ['entities', ids.entity, 'props', 'bat.wingflaps'], value: 3 }]),
    ]);
    const result = planMerge({
      baseDoc: doc,
      ours,
      theirs: {},
      oursManifest: manifest([control('bat.wingflaps', '/props/bat.wingflaps', 'count')]),
      theirsManifest: manifest([], ['bat.wingflaps']),
    });

    expect(result.auto).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      kind: 'control_removed',
      controlId: 'bat.wingflaps',
      ours: { after: 3 },
      theirs: 'removed_by_build',
    });
  });

  it('reports a control missing from the target build as removed', () => {
    const doc = baseDoc({ 'bat.wingflaps': 1 });
    const ours = sideDelta(doc, [
      transaction(1, [], [{ op: 'replace', path: ['entities', ids.entity, 'props', 'bat.wingflaps'], value: 3 }]),
    ]);
    const result = planMerge({
      baseDoc: doc,
      ours,
      theirs: {},
      oursManifest: manifest([control('bat.wingflaps', '/props/bat.wingflaps', 'count')]),
      theirsManifest: manifest([]),
    });

    expect(result.conflicts).toMatchObject([
      { kind: 'control_removed', controlId: 'bat.wingflaps', theirs: 'removed_by_build' },
    ]);
  });

  it('keeps conflict classification symmetric when the sides are swapped', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (oursValue, theirsValue) => {
        fc.pre(oursValue !== theirsValue);
        const doc = baseDoc();
        const ours = sideDelta(doc, [
          transaction(
            1,
            [],
            [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: oursValue }],
          ),
        ]);
        const theirs = sideDelta(doc, [
          transaction(
            1,
            [],
            [{ op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: theirsValue }],
            ids.branchB,
          ),
        ]);
        const controls = [control('door.locked', '/props/door.locked')];
        const first = planMerge({
          baseDoc: doc,
          ours,
          theirs,
          oursManifest: manifest(controls),
          theirsManifest: manifest(controls),
        });
        const swapped = planMerge({
          baseDoc: doc,
          ours: theirs,
          theirs: ours,
          oursManifest: manifest(controls),
          theirsManifest: manifest(controls),
        });
        expect(first.conflicts.map(({ path, kind }) => ({ path, kind }))).toEqual(
          swapped.conflicts.map(({ path, kind }) => ({ path, kind })),
        );
      }),
    );
  });

  it('produces the same merged document when non-conflicting sides are swapped', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (oursValue, theirsValue) => {
        const doc = baseDoc();
        const oursPatches: Patch[] = [{ op: 'add', path: ['globals', 'ours.flag'], value: oursValue }];
        const theirsPatches: Patch[] = [{ op: 'add', path: ['globals', 'theirs.flag'], value: theirsValue }];
        const ours = sideDelta(doc, [transaction(1, [], oursPatches)]);
        const theirs = sideDelta(doc, [transaction(1, [], theirsPatches, ids.branchB)]);
        const emptyManifest = manifest([]);
        const forward = planMerge({
          baseDoc: doc,
          ours,
          theirs,
          oursManifest: emptyManifest,
          theirsManifest: emptyManifest,
        });
        const reverse = planMerge({
          baseDoc: doc,
          ours: theirs,
          theirs: ours,
          oursManifest: emptyManifest,
          theirsManifest: emptyManifest,
        });

        const forwardDoc = apply(apply(doc, theirsPatches), forward.auto);
        const reverseDoc = apply(apply(doc, oursPatches), reverse.auto);
        expect(forwardDoc).toEqual(reverseDoc);
      }),
    );
  });
});

describe('applyResolutions', () => {
  it('validates custom values against the conflict control', () => {
    const plan = mergePlan(
      [],
      [
        {
          id: 'conflict_00000000000000000000000000',
          path: `/entities/${ids.entity}/props/door.count`,
          entityId: ids.entity,
          controlId: 'door.count',
          kind: 'both_changed',
          ours: { path: '/props/door.count', before: 1, after: 2, txId: ids.tx },
          theirs: { path: '/props/door.count', before: 1, after: 3, txId: ids.tx },
          resolution: { value: 11 },
        },
      ],
    );

    expect(() => applyResolutions(plan, [control('door.count', '/props/door.count', 'count')])).toThrow(
      InvalidResolution,
    );
  });

  it('applies automatic and resolved patches to the target document', () => {
    const target = baseDoc();
    const plan = mergePlan(
      [{ op: 'add', path: ['globals', 'fog'], value: true }],
      [
        {
          id: 'conflict_00000000000000000000000000',
          path: `/entities/${ids.entity}/props/door.locked`,
          entityId: ids.entity,
          controlId: 'door.locked',
          kind: 'both_changed',
          ours: {
            path: `/entities/${ids.entity}/props/door.locked`,
            before: false,
            after: true,
            txId: ids.tx,
          },
          theirs: {
            path: `/entities/${ids.entity}/props/door.locked`,
            before: false,
            after: false,
            txId: ids.tx,
          },
          resolution: 'ours',
        },
      ],
    );

    expect(apply(target, applyResolutions(plan, [control('door.locked', '/props/door.locked')]))).toMatchObject({
      globals: { fog: true },
      entities: { [ids.entity]: { props: { 'door.locked': true } } },
    });
  });

  it('applies a valid custom control value', () => {
    const plan = mergePlan(
      [],
      [
        {
          id: 'conflict_00000000000000000000000000',
          path: `/entities/${ids.entity}/props/door.count`,
          entityId: ids.entity,
          controlId: 'door.count',
          kind: 'both_changed',
          ours: { path: '/props/door.count', before: 1, after: 2, txId: ids.tx },
          theirs: { path: '/props/door.count', before: 1, after: 3, txId: ids.tx },
          resolution: { value: 7 },
        },
      ],
    );
    const target = baseDoc({ 'door.count': 3 });

    expect(apply(target, applyResolutions(plan, [control('door.count', '/props/door.count', 'count')]))).toMatchObject({
      entities: { [ids.entity]: { props: { 'door.count': 7 } } },
    });
  });
});
