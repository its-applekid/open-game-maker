import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { firstDifference } from '../json.js';
import type { Check } from '../types.js';
import { fail, message, pass, unchecked, withSession } from './util.js';

/**
 * A4 §10.3 (3): the save the game writes on pause restores to the same state. The save is kept as
 * `save.json` in the out dir, so this run can be the next run's `--previous` (C4).
 */
export const c03Save: Check = {
  id: 'C3',
  name: 'save-round-trip',
  async run(ctx) {
    if (!ctx.game.manifest.saves) return unchecked('manifest.saves is false');
    return withSession(ctx, {}, async (session) => {
      await session.advanceTime(1000);
      await session.pause();
      const save = (await session.saves()).at(-1);
      if (!save) return fail('no save.write after one second of play and a pause');
      const written = { saveSchemaVersion: save.saveSchemaVersion, data: save.data };
      await session.resume();
      await session.advanceTime(500);
      try {
        await session.restore(written);
      } catch (error) {
        return fail(`restore rejected the game's own save: ${message(error)}`);
      }
      const diff = firstDifference((await session.text()).state, written.data);
      if (diff !== null) return fail(`restored state differs from the save at ${diff}`);
      const path = join(ctx.outDir, 'save.json');
      await writeFile(path, `${JSON.stringify(written, null, 2)}\n`);
      return pass(`save v${written.saveSchemaVersion} restored byte-equal`, [path]);
    });
  },
};
