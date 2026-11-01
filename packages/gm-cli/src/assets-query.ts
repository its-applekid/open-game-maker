import type { SearchQuery } from '@ogm/asset-cards';
import type { Use } from '@ogm/contracts';

import { UsageError, type FlagSpec } from './command.js';

const USES: Use[] = [
  'in-game',
  'placeholder',
  'derive-layout',
  'style-reference',
  'vision-input',
  'edit-audio',
  'derive-audio',
];

export const FILTER_FLAGS: FlagSpec = {
  kind: { type: 'string', help: 'kind or kind/subkind (model/kit, audio/music/loop)' },
  family: { type: 'string', help: 'style family (chunky-low-poly)' },
  pov: { type: 'string', help: 'camera fit (iso, topdown, side, follow, fps, orbit)' },
  use: { type: 'string', default: 'in-game', help: `allowed use (${USES.join(', ')})` },
  'rig-id': { type: 'string', help: 'only cards on this rig' },
  'same-rig-as': { type: 'string', help: 'only cards sharing the rig of this card id' },
  'include-draft': { type: 'boolean', default: false, help: 'also match draft cards of every kind' },
  tier: { type: 'number', help: 'library tier 1, 2 or 3' },
  collection: { type: 'string', help: 'only this collection id' },
};

/** Map the shared filter flags to a SearchQuery, refusing unknown uses and tiers. */
export function toQuery(name: string, words: string[], flags: Record<string, unknown>): SearchQuery {
  const use = flags.use as string;
  if (!USES.includes(use as Use)) throw new UsageError(`unknown use "${use}"`, `gm ${name} --use in-game`);
  const q: SearchQuery = { words, use: use as Use, includeDraft: flags['include-draft'] === true };
  if (typeof flags.kind === 'string') {
    const [kind, ...sub] = flags.kind.split('/');
    q.kind = kind;
    if (sub.length > 0) q.subkind = sub.join('/');
  }
  if (flags.tier !== undefined) {
    if (![1, 2, 3].includes(flags.tier as number))
      throw new UsageError('--tier must be 1, 2 or 3', `gm ${name} --tier 1`);
    q.tier = flags.tier as number;
  }
  if (typeof flags.family === 'string') q.family = flags.family;
  if (typeof flags.pov === 'string') q.pov = flags.pov;
  if (typeof flags['rig-id'] === 'string') q.rigId = flags['rig-id'];
  if (typeof flags['same-rig-as'] === 'string') q.sameRigAs = flags['same-rig-as'];
  if (typeof flags.collection === 'string') q.collection = flags.collection;
  return q;
}
