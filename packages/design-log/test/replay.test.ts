import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { apply } from '../src/apply.js';
import { canonical } from '../src/canonical.js';
import { ForkPointError, GapError, InvalidRevisionError, replay } from '../src/replay.js';
import { baseDoc, branch, ids, setTx } from './helpers.js';

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

  it.each([-1, 1.5, Number.NaN])('rejects invalid requested revision %s', (revision) => {
    expect(() => replay({ baseDoc: baseDoc(), chain: [{ branch: branch(ids.branch, 0), txs: [] }] }, revision)).toThrow(
      InvalidRevisionError,
    );
  });

  it('matches a direct apply fold for arbitrary contiguous logs', () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue(), { maxLength: 30 }), (values) => {
        const txs = values.map((value, index) => setTx(index + 1, value));
        const expected = txs.reduce((doc, tx) => apply(doc, tx.patches), baseDoc());
        expect(
          canonical(replay({ baseDoc: baseDoc(), chain: [{ branch: branch(ids.branch, txs.length), txs }] }).doc),
        ).toBe(canonical(expected));
      }),
      { numRuns: 200 },
    );
  });
});
