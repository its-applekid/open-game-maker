import { formatRow, loadIndex, search } from '@ogm/asset-cards';

import { FILTER_FLAGS, toQuery } from '../../assets-query.js';
import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';

export const command: GmCommand = {
  name: 'assets search',
  summary: 'find assets and collections by words and filters (in-game rights by default)',
  usage: '<words...> [filters]',
  example: 'assets search dungeon wall --kind model/kit',
  flags: FILTER_FLAGS,
  async run(ctx, args, flags) {
    const index = await loadIndex(requireAssetsRoot(ctx));
    const q = toQuery('assets search', args, flags);
    if (q.sameRigAs && !index.cards.some((card) => card.id === q.sameRigAs)) {
      throw new UsageError(`unknown card id "${q.sameRigAs}"`, 'gm assets search <words> to find an id');
    }
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
