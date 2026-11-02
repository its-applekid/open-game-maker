import type { ActionFrame } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { advanceTime, loadCardModule, type Steppable } from './test-support.js';

const idle: ActionFrame = { playerIndex: 0, tick: 0, source: 'keyboard', actions: {} };
const drop: ActionFrame = { ...idle, actions: { down: true, jump: true } };
type Resolver = Steppable & {
  body: { y: number; vy: number; height: number; grounded: boolean };
  input(frame: ActionFrame): void;
};

async function resolver(y: number, vy: number): Promise<Resolver> {
  const card = (await loadCardModule(import.meta.url)) as {
    OneWayResolver: new (body: Record<string, number | boolean>, platformY: number, reentryMs: number) => Resolver;
    tunableRanges: { reentryMs: [number, number] };
    fromRange: (range: [number, number], amount: number) => number;
  };
  return new card.OneWayResolver(
    { y, vy, height: 16, grounded: false },
    100,
    card.fromRange(card.tunableRanges.reentryMs, 0.5),
  );
}

describe('one-way platform card', () => {
  it('lands a falling body crossing the platform top', async () => {
    const player = await resolver(80, 300);
    player.input(idle);
    advanceTime(player, 34);
    expect(player.body).toMatchObject({ y: 84, vy: 0, grounded: true });
  });

  it('passes upward and permits a deliberate drop-through', async () => {
    const rising = await resolver(105, -300);
    rising.input(idle);
    advanceTime(rising, 34);
    expect(rising.body.y).toBeLessThan(105);

    const dropping = await resolver(84, 0);
    dropping.input(drop);
    advanceTime(dropping, 34);
    expect(dropping.body.grounded).toBe(false);
  });
});
