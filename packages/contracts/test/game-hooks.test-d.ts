import { describe, expectTypeOf, it } from 'vitest';

import type { GmTestHooks } from '../src/game.js';

// D-HOOKS fixes these names for the bridge test.* messages and the draft-build window globals.
describe('GmTestHooks', () => {
  it('keeps the nine D-HOOKS members plus the three T10 additions', () => {
    expectTypeOf<keyof GmTestHooks>().toEqualTypeOf<
      | 'ready'
      | 'marks'
      | 'advanceTime'
      | 'renderAt'
      | 'renderGameToText'
      | 'renderInfo'
      | 'hitTest'
      | 'setSeed'
      | 'inject'
      | 'probes'
      | 'events'
      | 'seed'
    >();
    expectTypeOf<ReturnType<GmTestHooks['renderInfo']>>().toHaveProperty('textureBytes');
    expectTypeOf<ReturnType<GmTestHooks['renderInfo']>>().toHaveProperty('backend');
  });
});
