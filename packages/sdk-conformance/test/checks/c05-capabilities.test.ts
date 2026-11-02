import { describe, expect, it } from 'vitest';

import { c05Capabilities } from '../../src/checks/c05-capabilities.js';
import { fakeContext } from '../fake-session.js';

describe('C5 capabilities-optional', () => {
  it('passes when the game boots without each optional capability', async () => {
    const ctx = fakeContext();
    expect((await c05Capabilities.run(ctx)).status).toBe('pass');
    expect(ctx.sessions[0]!.options.capabilities).toEqual([]);
  });

  it('fails naming the capability the game cannot boot without', async () => {
    const result = await c05Capabilities.run(fakeContext({ requires: 'audio' }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('without audio') });
  });

  it('is unchecked when no capability is declared', async () => {
    expect((await c05Capabilities.run(fakeContext({ manifest: { capabilities: [] } }))).status).toBe('unchecked');
  });
});
