import { describe, expect, it } from 'vitest';

import { c02Controls } from '../../src/checks/c02-controls.js';
import { fakeContext } from '../fake-session.js';

describe('C2 controls-round-trip', () => {
  it('passes when min, max and default all revert byte-equal', async () => {
    const ctx = fakeContext();
    const result = await c02Controls.run(ctx);
    expect(result).toMatchObject({ status: 'pass', detail: '3 control values applied and reverted byte-equal' });
    expect(ctx.sessions.every((session) => session.closed)).toBe(true);
  });

  it('fails a control whose apply mutates unrelated state, naming the control and key', async () => {
    const result = await c02Controls.run(fakeContext({ applyLeaks: true }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringMatching(/player\.speed = 1 left \/state\/score/) });
  });

  it('is unchecked, not passed, when there are no controls', async () => {
    expect((await c02Controls.run(fakeContext({ controls: [] }))).status).toBe('unchecked');
  });
});
