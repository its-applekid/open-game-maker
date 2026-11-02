import { describe, expect, it } from 'vitest';

import { c01Manifest } from '../../src/checks/c01-manifest.js';
import { fakeContext, SPEED } from '../fake-session.js';

describe('C1 manifest-valid', () => {
  it('passes a valid manifest with unique ids', async () => {
    expect((await c01Manifest.run(fakeContext())).status).toBe('pass');
  });

  it('fails a duplicate control id and names it', async () => {
    const result = await c01Manifest.run(fakeContext({ controls: [SPEED, { ...SPEED, label: 'Again' }] }));
    expect(result).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('duplicate control id player.speed'),
    });
  });

  it('fails a manifest the contract rejects', async () => {
    const result = await c01Manifest.run(fakeContext({ manifest: { view: 'nowhere' as never } }));
    expect(result.status).toBe('fail');
  });
});
