import type { Check } from '../types.js';
import { fail, message, pass, unchecked, withSession } from './util.js';

/** A4 §10.3 (5): the game boots and steps with each optional capability withheld. */
export const c05Capabilities: Check = {
  id: 'C5',
  name: 'capabilities-optional',
  async run(ctx) {
    const all = ctx.game.manifest.capabilities;
    if (all.length === 0) return unchecked('the manifest declares no optional capabilities');
    for (const missing of all) {
      try {
        await withSession(ctx, { capabilities: all.filter((cap) => cap !== missing) }, async (session) => {
          const before = (await session.text()).tick;
          await session.advanceTime(500);
          if ((await session.text()).tick <= before) throw new Error('the game did not advance');
        });
      } catch (error) {
        return fail(`without ${missing}: ${message(error)}`);
      }
    }
    return pass(`booted and stepped without each of ${all.join(', ')}`);
  },
};
