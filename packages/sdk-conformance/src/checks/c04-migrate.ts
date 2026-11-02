import { firstDifference } from '../json.js';
import type { Check } from '../types.js';
import { fail, message, pass, unchecked, withSession } from './util.js';

/** A4 §10.3 (4): a previous release's save restores (migrating when its version is one behind). */
export const c04Migrate: Check = {
  id: 'C4',
  name: 'previous-save-migrates',
  async run(ctx) {
    const save = ctx.previous?.save ?? ctx.saveFixture;
    if (!save) return unchecked('no previous save (--previous save.json or tests/fixtures/save.previous.json)');
    return withSession(ctx, {}, async (session) => {
      try {
        await session.restore(save);
      } catch (error) {
        return fail(`previous save v${save.saveSchemaVersion} was refused: ${message(error)}`);
      }
      const state = (await session.text()).state;
      const migrated = (await session.saves()).at(-1);
      if (migrated && migrated.saveSchemaVersion !== save.saveSchemaVersion) {
        return pass(`save v${save.saveSchemaVersion} migrated to v${migrated.saveSchemaVersion}`);
      }
      const diff = firstDifference(state, save.data);
      if (diff !== null) return fail(`previous save v${save.saveSchemaVersion} restored with ${diff} changed`);
      return pass(`save v${save.saveSchemaVersion} restored unchanged`);
    });
  },
};
