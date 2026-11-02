import { describe, expect, it } from 'vitest';

import { c07Stills, SAFE_INSETS } from '../../src/checks/c07-stills.js';
import { fakeContext } from '../fake-session.js';

describe('C7 stills-safe-area', () => {
  it('passes with the player inside the safe area, on both viewports with the safe insets sent', async () => {
    const ctx = fakeContext();
    const result = await c07Stills.run(ctx);
    expect(result.status).toBe('pass');
    expect(result.artifacts).toHaveLength(2);
    expect(ctx.sessions.map((session) => session.options.viewport)).toEqual([
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
    ]);
    expect(ctx.sessions[0]!.options.safe).toEqual(SAFE_INSETS);
  });

  it('fails a player under the top inset', async () => {
    const result = await c07Stills.run(fakeContext({ player: { nx: 0.99, ny: 0.02 } }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('player p1') });
  });

  it('rescans finer, then fails a player that is not on screen', async () => {
    const ctx = fakeContext({ playerHidden: true });
    const result = await c07Stills.run(ctx);
    expect(result).toMatchObject({ status: 'fail', detail: 'desktop: player p1 is not on screen' });
    expect(ctx.sessions[0]!.scans).toEqual([24, 48]);
  });

  it('fails a blank still', async () => {
    const result = await c07Stills.run(fakeContext({ colours: 1 }));
    expect(result).toMatchObject({ status: 'fail', detail: 'desktop still is a single colour' });
  });
});
