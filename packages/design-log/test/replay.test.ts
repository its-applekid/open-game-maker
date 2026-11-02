import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { InvalidPatchError, apply } from '../src/apply.js';
import { canonical } from '../src/canonical.js';
import { ForkPointError, GapError, InvalidRevisionError, replay } from '../src/replay.js';
import { baseDoc, branch, ids, setTx, transaction } from './helpers.js';

describe('replay', () => {
  it('honours parent fork points before applying the branch suffix', () => {
    const main = [1, 2, 3, 4, 5].map((rev) => setTx(rev, `main-${rev}`));
    const child = [1, 2].map((rev) => setTx(rev, `child-${rev}`, ids.branchB));
    const result = replay({
      baseDoc: baseDoc(),
      chain: [
        { branch: branch(ids.branch, 5), txs: main },
        {
          branch: branch(ids.branchB, 2, {
            parentBranchId: ids.branch,
            parentRev: 3,
            gitSha: '0123456789abcdef0123456789abcdef01234567',
          }),
          txs: child,
        },
      ],
    });
    expect(result.headRev).toBe(2);
    expect(result.doc.entities[ids.entity]?.props['door.locked']).toBe('child-2');
    expect(canonical(result.doc)).toBe(
      canonical([...main.slice(0, 3), ...child].reduce((doc, tx) => apply(doc, tx.patches), baseDoc())),
    );
  });

  it('detects gaps and malformed parent chains', () => {
    expect(() =>
      replay({ baseDoc: baseDoc(), chain: [{ branch: branch(ids.branch, 3), txs: [setTx(1, 1), setTx(3, 3)] }] }),
    ).toThrow(GapError);
    expect(() =>
      replay({
        baseDoc: baseDoc(),
        chain: [
          { branch: branch(ids.branch, 1), txs: [setTx(1, 1)] },
          { branch: branch(ids.branchB, 0, null), txs: [] },
        ],
      }),
    ).toThrow(ForkPointError);
  });

  it('stops the leaf branch at an requested revision', () => {
    const result = replay(
      {
        baseDoc: baseDoc(),
        chain: [{ branch: branch(ids.branch, 4), txs: [1, 2, 3, 4].map((rev) => setTx(rev, rev)) }],
      },
      2,
    );
    expect(result.headRev).toBe(2);
    expect(result.doc.entities[ids.entity]?.props['door.locked']).toBe(2);
  });

  it('keeps append-only history while replaying only the active build segment', () => {
    const nextBuild = 'build_01BX5ZZKBKACTAV9WEVGEMMVRZ';
    const previous = transaction(1, [], [{ op: 'remove', path: ['entities', ids.entity] }]);
    const switched = { ...transaction(2, [], []), baseBuildId: nextBuild };
    const result = replay({
      baseDoc: baseDoc(),
      buildId: nextBuild,
      chain: [{ branch: branch(ids.branch, 2), txs: [previous, switched] }],
    });
    expect(result.doc.entities[ids.entity]).toBeDefined();
    expect(result.headRev).toBe(2);
  });

  it('starts at the latest switch marker when returning to a previous build', () => {
    const nextBuild = 'build_01BX5ZZKBKACTAV9WEVGEMMVRZ';
    const original = transaction(1, [], [{ op: 'add', path: ['globals', 'old.override'], value: true }]);
    const away = {
      ...transaction(2, [{ op: 'invoke', command: 'build.switch', args: { from: ids.build, to: nextBuild } }], []),
      baseBuildId: nextBuild,
    };
    const back = transaction(
      3,
      [{ op: 'invoke', command: 'build.switch', args: { from: nextBuild, to: ids.build } }],
      [],
    );
    const result = replay({
      baseDoc: baseDoc(),
      buildId: ids.build,
      chain: [{ branch: branch(ids.branch, 3), txs: [original, away, back] }],
    });
    expect(result.doc.globals['old.override']).toBeUndefined();
  });

  it.each([-1, 1.5, Number.NaN])('rejects invalid requested revision %s', (revision) => {
    expect(() => replay({ baseDoc: baseDoc(), chain: [{ branch: branch(ids.branch, 0), txs: [] }] }, revision)).toThrow(
      InvalidRevisionError,
    );
  });

  function replayMatchesDirectFold(values: readonly unknown[]): void {
    const txs = values.map((value, index) => setTx(index + 1, value));
    const run = () => replay({ baseDoc: baseDoc(), chain: [{ branch: branch(ids.branch, txs.length), txs }] }).doc;
    let expected: string;
    try {
      expected = canonical(txs.reduce((doc, tx) => apply(doc, tx.patches), baseDoc()));
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPatchError);
      expect(run).toThrow(InvalidPatchError);
      return;
    }
    expect(canonical(run())).toBe(expected);
  }

  it('matches a direct apply fold for arbitrary contiguous logs', () => {
    fc.assert(fc.property(fc.array(fc.jsonValue(), { maxLength: 30 }), replayMatchesDirectFold), { numRuns: 200 });
  });

  it('rejects a reserved prototype key on both paths (fast-check seed 765022470)', () => {
    replayMatchesDirectFold(JSON.parse('[[{"__proto__":{}}]]') as unknown[]);
    expect(() =>
      replay({
        baseDoc: baseDoc(),
        chain: [{ branch: branch(ids.branch, 1), txs: [setTx(1, JSON.parse('[{"__proto__":{}}]'))] }],
      }),
    ).toThrow(InvalidPatchError);
  });
});
