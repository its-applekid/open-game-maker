import { describe, expect, it } from 'vitest';

import { c06Pause } from '../../src/checks/c06-pause.js';
import { fakeContext } from '../fake-session.js';

describe('C6 pause-halts', () => {
  it('passes when the tick freezes on pause and moves on resume', async () => {
    expect((await c06Pause.run(fakeContext())).status).toBe('pass');
  });

  it('fails when the tick advances after pause', async () => {
    const result = await c06Pause.run(fakeContext({ ignoresPause: true }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('while paused') });
  });
});
