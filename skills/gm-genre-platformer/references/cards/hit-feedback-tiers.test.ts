import { describe, expect, it } from 'vitest';

import { advanceTime, loadCardModule, type Steppable } from './test-support.js';

type Feedback = Steppable & {
  state: { trauma: number; hitStopMs: number; flashMs: number };
  trigger(tier: 'light' | 'medium' | 'heavy'): void;
};

async function feedback(): Promise<Feedback> {
  const card = (await loadCardModule(import.meta.url)) as {
    HitFeedback: new (feel: Record<string, number>) => Feedback;
    chooseFeedbackFeel: (intensity: number) => Record<string, number>;
  };
  return new card.HitFeedback(card.chooseFeedbackFeel(0.5));
}

describe('hit feedback tiers card', () => {
  it('decays heavy trauma to rest within one second', async () => {
    const effects = await feedback();
    effects.trigger('heavy');
    advanceTime(effects, 1000);
    expect(effects.state.trauma).toBe(0);
  });

  it('keeps heavy feedback proportional to medium feedback', async () => {
    const medium = await feedback();
    medium.trigger('medium');
    const heavy = await feedback();
    heavy.trigger('heavy');
    expect(heavy.state.hitStopMs).toBeGreaterThanOrEqual(medium.state.hitStopMs);
  });
});
