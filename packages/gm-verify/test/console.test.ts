import { describe, expect, it } from 'vitest';

import { ConsoleCollector } from '../src/console.js';

describe('ConsoleCollector', () => {
  it('folds repeats into one entry with a count, so a per-frame error does not flood the report', () => {
    const c = new ConsoleCollector();
    for (let i = 0; i < 3; i += 1) c.add('error', 'texture missing');
    c.add('warning', 'texture missing');
    c.add('error', 'other');
    expect(c.list()).toEqual([
      { level: 'error', text: 'texture missing', count: 3 },
      { level: 'warning', text: 'texture missing', count: 1 },
      { level: 'error', text: 'other', count: 1 },
    ]);
  });

  it('keys on the first 200 characters, so messages differing only after them dedupe', () => {
    const c = new ConsoleCollector();
    const head = 'x'.repeat(200);
    c.add('error', `${head} at frame 1`);
    c.add('error', `${head} at frame 2`);
    expect(c.list()).toEqual([{ level: 'error', text: head, count: 2 }]);
  });
});
