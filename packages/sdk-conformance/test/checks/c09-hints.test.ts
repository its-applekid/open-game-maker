import { describe, expect, it } from 'vitest';

import { c09Hints } from '../../src/checks/c09-hints.js';
import { fakeContext } from '../fake-session.js';

const previous = { controlIds: ['player.walk'], entityIds: [] };

describe('C9 override-hints', () => {
  it('fails a previous control id renamed without an alias', async () => {
    const result = await c09Hints.run(fakeContext({}, { previous }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('player.walk') });
  });

  it('passes the rename once an alias points at the current id', async () => {
    const ctx = fakeContext({ manifest: { overrides: { aliases: { 'player.walk': 'player.speed' }, retired: [] } } });
    expect((await c09Hints.run({ ...ctx, previous })).status).toBe('pass');
  });

  it('fails when two sessions disagree on the folded design', async () => {
    const result = await c09Hints.run(fakeContext({ nondeterministic: true }, { previous: { ...previous, controlIds: [] } }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('diverged') });
  });

  it('is unchecked without a previous build, after still checking the fold', async () => {
    const result = await c09Hints.run(fakeContext());
    expect(result).toMatchObject({ status: 'unchecked', detail: expect.stringContaining('1 folded overrides') });
  });
});
