import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatRow, loadIndex, search } from '@ogm/asset-cards';

import { FILTER_FLAGS, toQuery } from '../../assets-query.js';
import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';

/** The game's style family from `./assets.lock.json`, if this is a game repo that has one. */
function lockFamily(cwd: string): string | undefined {
  const file = join(cwd, 'assets.lock.json');
  if (!existsSync(file)) return undefined;
  let lock: { family?: unknown };
  try {
    lock = JSON.parse(readFileSync(file, 'utf8')) as { family?: unknown };
  } catch {
    throw new UsageError('assets.lock.json is not valid JSON', 'git diff assets.lock.json');
  }
  return typeof lock.family === 'string' && lock.family ? lock.family : undefined;
}

export const command: GmCommand = {
  name: 'assets search',
  summary: 'find assets and collections by words and filters (in-game rights by default)',
  usage: '<words...> [filters]',
  example: 'assets search dungeon wall --kind model/kit',
  flags: {
    ...FILTER_FLAGS,
    'any-family': { type: 'boolean', default: false, help: "search outside this game's style family (needs --reason)" },
    reason: { type: 'string', help: 'why --any-family is needed (logged)' },
  },
  async run(ctx, args, flags) {
    const index = await loadIndex(requireAssetsRoot(ctx));
    const q = toQuery('assets search', args, flags);
    // R55: inside a game repo, search stays in the lockfile's family (plus `any`) unless an exception is logged.
    const anyFamily = flags['any-family'] === true;
    const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
    if (anyFamily && !reason) {
      throw new UsageError('--any-family needs --reason', 'gm assets search <words> --any-family --reason "<why>"');
    }
    const gameFamily = q.family ? undefined : lockFamily(ctx.cwd);
    if (gameFamily && !anyFamily) q.gameFamily = gameFamily;
    if (q.sameRigAs && !index.cards.some((card) => card.id === q.sameRigAs)) {
      throw new UsageError(`unknown card id "${q.sameRigAs}"`, 'gm assets search <words> to find an id');
    }
    if (gameFamily && anyFamily)
      ctx.emit('assets.family_exception', { family: gameFamily, reason, query: args.join(' ') });
    const hits = search(index, { ...q, limit: ctx.limit });
    for (const card of hits) {
      if (ctx.json) printJson(ctx, card);
      else ctx.out(formatRow(card));
    }
    if (hits.length === 0 && !ctx.json) ctx.err('no hits. Try: fewer words, --include-draft, or gm assets facets');
    ctx.emit('assets.search', { args, flags: { ...flags, help: undefined }, hits: hits.length });
    return EXIT.ok;
  },
};
