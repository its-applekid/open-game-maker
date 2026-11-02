import type { Check } from '../types.js';
import { fail, pass, unchecked } from './util.js';

/**
 * B7 §2: entity ids in `design/` survive across builds unless retired. The manifest's
 * `overrides.retired` is the one retirement list the contract has; entity and control ids cannot
 * collide (`prefab_ULID` against dotted lowercase).
 */
export const c10EntityIds: Check = {
  id: 'C10',
  name: 'entity-ids-stable',
  async run({ game, previous }) {
    if (!previous) return unchecked('no previous build to compare design/ entity ids with');
    const current = new Set(game.entityIds);
    const retired = new Set(game.manifest.overrides.retired);
    const dropped = previous.entityIds.filter((id) => !current.has(id) && !retired.has(id));
    if (dropped.length > 0) return fail(`entity ${dropped.join(', ')} dropped without retirement`);
    return pass(`${previous.entityIds.length} previous entity ids kept or retired`);
  },
};
