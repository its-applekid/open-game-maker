import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MissingBaseValueError, UnknownTargetError, apply, invert, makeTransaction, toPointer } from '../src/apply.js';
import { canonical } from '../src/canonical.js';
import { baseDoc, ids } from './helpers.js';

describe('makeTransaction', () => {
  it('produces one entity replacement and its exact inverse', () => {
    const doc = baseDoc();
    const result = makeTransaction(doc, [{ op: 'set', control: 'door.locked', targets: [ids.entity], value: true }]);

    expect(result.patches).toEqual([
      { op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: true },
    ]);
    expect(result.inverse).toEqual([
      { op: 'replace', path: ['entities', ids.entity, 'props', 'door.locked'], value: false },
    ]);
    expect(result.doc.entities[ids.entity]?.props['door.locked']).toBe(true);
    expect(invert({ inverse: result.inverse })).toBe(result.inverse);
  });

  it('resets globals and entity props to supplied base values', () => {
    const doc = baseDoc({ 'door.locked': true });
    doc.globals['world.gravity'] = 4;
    const result = makeTransaction(
      doc,
      [
        { op: 'reset', control: 'world.gravity', targets: 'global' },
        { op: 'reset', control: 'door.locked', targets: [ids.entity] },
      ],
      { baseValues: { 'world.gravity@global': 9.8, [`door.locked@${ids.entity}`]: false } },
    );

    expect(result.doc.globals['world.gravity']).toBe(9.8);
    expect(result.doc.entities[ids.entity]?.props['door.locked']).toBe(false);
  });

  it('records invokes without inventing patches', () => {
    expect(makeTransaction(baseDoc(), [{ op: 'invoke', command: 'door.open', args: {} }])).toMatchObject({
      patches: [],
      inverse: [],
    });
  });

  it('refuses unknown targets and missing reset bases', () => {
    expect(() =>
      makeTransaction(baseDoc(), [
        { op: 'set', control: 'door.locked', targets: ['e_01BX5ZZKBKACTAV9WEVGEMMVRZ'], value: true },
      ]),
    ).toThrow(UnknownTargetError);
    expect(() => makeTransaction(baseDoc(), [{ op: 'reset', control: 'door.locked', targets: [ids.entity] }])).toThrow(
      MissingBaseValueError,
    );
  });
});

describe('apply and invert', () => {
  it('round-trips arbitrary JSON values byte-exactly under canonical JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const doc = baseDoc({ value });
        const change = makeTransaction(doc, [
          { op: 'set', control: 'value', targets: [ids.entity], value: { wrapped: value } },
        ]);
        expect(canonical(apply(apply(doc, change.patches), change.inverse))).toBe(canonical(doc));
      }),
      { numRuns: 200 },
    );
  });

  it('converts Immer paths to escaped JSON pointers', () => {
    expect(toPointer(['entities', 'e/1', 'props', 'a~b'])).toBe('/entities/e~11/props/a~0b');
  });
});
