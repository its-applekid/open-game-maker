import { describe, expect, it } from 'vitest';

import { CHECKS } from '../src/checks/index.js';
import { bootFailedResults, runChecks } from '../src/runner-checks.js';
import type { Check } from '../src/types.js';
import { fakeContext } from './fake-session.js';

describe('runChecks', () => {
  it('runs C1 to C11 in order on a conformant game with none failing', async () => {
    const results = await runChecks(fakeContext());
    expect(results.map((result) => result.id)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'C7',
      'C8',
      'C9',
      'C10',
      'C11',
    ]);
    expect(results.filter((result) => result.status === 'fail')).toEqual([]);
  });

  it('turns a crashing check into a fail, never a pass', async () => {
    const crash: Check = { id: 'C1', name: 'crash', run: () => Promise.reject(new Error('boom')) };
    expect(await runChecks(fakeContext(), [crash])).toEqual([
      { id: 'C1', name: 'crash', status: 'fail', detail: 'check crashed: boom' },
    ]);
  });

  it('fails a check that never settles instead of holding the run', async () => {
    const hang: Check = { id: 'C6', name: 'hang', run: () => new Promise(() => undefined) };
    expect(await runChecks(fakeContext(), [hang], 20)).toEqual([
      { id: 'C6', name: 'hang', status: 'fail', detail: 'check crashed: timed out after 20 ms' },
    ]);
  });

  it('reports a boot failure as C0 with every check unchecked', () => {
    const results = bootFailedResults('no ready within 60 s');
    expect(results[0]).toMatchObject({ id: 'C0', status: 'fail', detail: 'no ready within 60 s' });
    expect(results.slice(1).map((result) => result.status)).toEqual(CHECKS.map(() => 'unchecked'));
  });
});
