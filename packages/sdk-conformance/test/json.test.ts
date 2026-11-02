import { describe, expect, it } from 'vitest';

import { firstDifference, getPointer, setPointer } from '../src/json.js';

describe('json pointers', () => {
  it('reads and writes escaped segments without touching the source', () => {
    const doc = { globals: { 'a/b': 1, 'player.speed': 2 } };
    const next = setPointer(doc, '/globals/a~1b', 5);
    expect(getPointer(next.doc, '/globals/a~1b')).toBe(5);
    expect(doc.globals['a/b']).toBe(1);
    expect(next.patch).toEqual({ op: 'replace', path: ['globals', 'a/b'], value: 5 });
  });

  it('names the first differing path', () => {
    expect(firstDifference({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } })).toBe('/a/c');
    expect(firstDifference({ a: 1 }, { a: 1 })).toBeNull();
  });
});
