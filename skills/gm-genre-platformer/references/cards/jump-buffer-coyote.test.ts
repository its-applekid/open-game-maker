import type { ActionFrame } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { advanceTime, loadCardModule, type Steppable } from './test-support.js';

const idle: ActionFrame = { playerIndex: 0, tick: 0, source: 'keyboard', actions: {} };
const jump: ActionFrame = { ...idle, actions: { jump: true } };
type JumpController = Steppable & {
  body: { vy: number };
  input(frame: ActionFrame, grounded: boolean): void;
};

async function controller(): Promise<JumpController> {
  const card = (await loadCardModule(import.meta.url)) as {
    JumpController: new (feel: Record<string, number>) => JumpController;
    chooseJumpFeel: (weight: number, forgiveness: number) => Record<string, number>;
  };
  return new card.JumpController(card.chooseJumpFeel(0.35, 0.65));
}

describe('jump buffer and coyote card', () => {
  it('jumps from a grounded press', async () => {
    const player = await controller();
    player.input(jump, true);
    advanceTime(player, 17);
    expect(player.body.vy).toBeLessThan(0);
  });

  it('accepts a coyote press but rejects one after the window', async () => {
    const within = await controller();
    within.input(idle, true);
    advanceTime(within, 17);
    within.input(jump, false);
    advanceTime(within, 17);
    expect(within.body.vy).toBeLessThan(0);

    const late = await controller();
    late.input(idle, true);
    advanceTime(late, 17);
    late.input(idle, false);
    advanceTime(late, 150);
    late.input(jump, false);
    advanceTime(late, 17);
    expect(late.body.vy).toBeGreaterThanOrEqual(0);
  });

  it('buffers a press until landing', async () => {
    const player = await controller();
    player.input(jump, false);
    advanceTime(player, 34);
    player.input(idle, true);
    advanceTime(player, 17);
    expect(player.body.vy).toBeLessThan(0);
  });
});
