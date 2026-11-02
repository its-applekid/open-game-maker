import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { c03Save } from '../../src/checks/c03-save.js';
import { fakeContext } from '../fake-session.js';

describe('C3 save-round-trip', () => {
  it('passes when the paused save restores byte-equal and keeps it for the next --previous', async () => {
    const result = await c03Save.run(fakeContext());
    expect(result.status).toBe('pass');
    expect(existsSync(result.artifacts![0]!)).toBe(true);
  });

  it('fails when restore loses a field, naming its path', async () => {
    const result = await c03Save.run(fakeContext({ restoreDropsScore: true }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('/score') });
  });
});
