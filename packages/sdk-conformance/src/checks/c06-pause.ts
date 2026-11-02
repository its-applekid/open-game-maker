import { firstDifference } from '../json.js';
import type { Check } from '../types.js';
import { fail, pass, withSession } from './util.js';

/** A4 §10.3 (6): `lifecycle.pause` halts the simulation within one frame and `resume` restarts it. */
export const c06Pause: Check = {
  id: 'C6',
  name: 'pause-halts',
  async run(ctx) {
    return withSession(ctx, {}, async (session) => {
      await session.advanceTime(100);
      await session.pause();
      const paused = await session.text();
      await session.advanceTime(100);
      await session.idle(200);
      const later = await session.text();
      if (later.tick !== paused.tick) return fail(`tick moved ${paused.tick} → ${later.tick} while paused`);
      const diff = firstDifference(later.state, paused.state);
      if (diff !== null) return fail(`state changed at ${diff} while paused`);
      await session.resume();
      await session.advanceTime(100);
      const resumed = await session.text();
      if (resumed.tick <= paused.tick) return fail(`tick stayed at ${paused.tick} after resume`);
      return pass(`tick frozen at ${paused.tick} through 100 ms of steps and 2 frames; resumed to ${resumed.tick}`);
    });
  },
};
