import { firstDifference, getPointer, setPointer } from '../json.js';
import type { Check } from '../types.js';
import { controlTargets, controlValues, fail, message, pass, unchecked, withSession } from './util.js';

/**
 * A4 §10.3 (2): every control accepts its min, max and default, and applying the original design
 * afterwards leaves `renderGameToText` byte-equal to the baseline.
 */
export const c02Controls: Check = {
  id: 'C2',
  name: 'controls-round-trip',
  async run(ctx) {
    const { controls, design } = ctx.game;
    if (controls.length === 0) return unchecked('the game declares no controls');
    return withSession(ctx, {}, async (session) => {
      const baseline = await session.text();
      let applied = 0;
      for (const control of controls) {
        const targets = controlTargets(control, design);
        if (targets.length === 0) return fail(`control ${control.id} matches no design target`);
        for (const pointer of targets) {
          const original = getPointer(design, pointer);
          for (const value of controlValues(control)) {
            const changed = setPointer(design, pointer, value);
            try {
              await session.applyDesign(changed.doc, [changed.patch]);
              await session.applyDesign(design, [setPointer(design, pointer, original).patch]);
            } catch (error) {
              return fail(`control ${control.id} = ${JSON.stringify(value)}: ${message(error)}`);
            }
            const after = await session.text();
            const diff = firstDifference(after, baseline);
            if (diff !== null) {
              return fail(`control ${control.id} = ${JSON.stringify(value)} left ${diff} changed after revert`);
            }
            applied += 1;
          }
        }
      }
      return pass(`${applied} control values applied and reverted byte-equal`);
    });
  },
};
