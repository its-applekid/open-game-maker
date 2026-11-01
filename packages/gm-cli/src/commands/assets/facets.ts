import { facets, loadIndex } from '@ogm/asset-cards';

import { FILTER_FLAGS, toQuery } from '../../assets-query.js';
import { EXIT, type GmCommand } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';

export const command: GmCommand = {
  name: 'assets facets',
  summary: 'count tag values over the cards a search would see',
  usage: '[words...] [filters]',
  example: 'assets facets --kind model',
  flags: { ...FILTER_FLAGS, proposed: { type: 'boolean', default: false, help: 'count proposed_tags instead' } },
  async run(ctx, args, flags) {
    const index = await loadIndex(requireAssetsRoot(ctx));
    const counts = facets(index, toQuery('assets facets', args, flags), { proposed: flags.proposed === true });
    for (const [facet, values] of Object.entries(counts)) {
      const sorted = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ctx.json) {
        printJson(ctx, { facet, values: sorted.length, counts: Object.fromEntries(sorted) });
        continue;
      }
      for (const [value, count] of sorted.slice(0, ctx.limit)) ctx.out(`${facet}  ${value}  ${count}`);
      if (sorted.length > ctx.limit)
        ctx.out(`${facet}  +${sorted.length - ctx.limit} more values  (--limit ${sorted.length})`);
    }
    ctx.emit('assets.facets', { args, facets: Object.keys(counts).length });
    return EXIT.ok;
  },
};
