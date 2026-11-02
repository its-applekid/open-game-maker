import { describe, expect, it } from 'vitest';

import { c07Stills, locatePlayers, SAFE_INSETS } from '../../src/checks/c07-stills.js';
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

  it('fails a player whose centre is safe but whose top cell is under the inset', () => {
    const hits = [0.02, 0.5, 0.6].map((ny) => ({ id: 'p1', nx: 0.5, ny }));
    const [player] = locatePlayers(hits, ['p1'], { width: 1280, height: 720 }, SAFE_INSETS);
    expect(player).toMatchObject({ id: 'p1', inside: false });
  });

  it('rescans finer, then fails a player that is not on screen', async () => {
    const ctx = fakeContext({ playerHidden: true });
    const result = await c07Stills.run(ctx);
    expect(result).toMatchObject({ status: 'fail', detail: 'desktop: player p1 is not on screen' });
    expect(ctx.sessions[0]!.scans).toEqual([24, 48]);
  });

  it('is unchecked, not passed, when the game reports no players to locate', async () => {
    const result = await c07Stills.run(fakeContext({ noPlayers: true }));
    expect(result).toMatchObject({ status: 'unchecked', detail: expect.stringContaining('no players') });
    expect(result.artifacts).toHaveLength(2);
  });

  it('fails a blank still', async () => {
    const result = await c07Stills.run(fakeContext({ colours: 1 }));
    expect(result).toMatchObject({ status: 'fail', detail: 'desktop still is a single colour' });
  });
});
