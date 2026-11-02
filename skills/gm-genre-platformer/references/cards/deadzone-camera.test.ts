import { describe, expect, it } from 'vitest';

import { advanceTime, loadCardModule, type Steppable } from './test-support.js';

type DeadzoneCamera = Steppable & {
  state: { x: number; y: number };
  moveTarget(x: number, y: number): void;
};

async function camera(): Promise<DeadzoneCamera> {
  const card = (await loadCardModule(import.meta.url)) as {
    DeadzoneCamera: new (feel: Record<string, number>) => DeadzoneCamera;
    chooseCameraFeel: (steadiness: number) => Record<string, number>;
  };
  return new card.DeadzoneCamera(card.chooseCameraFeel(0.7));
}

describe('deadzone camera card', () => {
  it('does not move for a target inside the deadzone', async () => {
    const view = await camera();
    view.moveTarget(1, 1);
    advanceTime(view, 17);
    expect(view.state).toEqual({ x: 0, y: 0 });
  });

  it('eases toward a target outside the deadzone', async () => {
    const view = await camera();
    view.moveTarget(300, 0);
    advanceTime(view, 34);
    expect(view.state.x).toBeGreaterThan(0);
  });
});
