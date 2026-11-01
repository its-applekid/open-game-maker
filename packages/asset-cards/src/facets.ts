import { kindsOf, passes, score } from './search.js';
import type { CardIndex, ResolvedCard, SearchQuery } from './types.js';

type Counts = Record<string, Record<string, number>>;

function add(counts: Counts, facet: string, values: (string | undefined)[]): void {
  for (const value of values) {
    if (value === undefined) continue;
    counts[facet] ??= {};
    counts[facet][value] = (counts[facet][value] ?? 0) + 1;
  }
}

function count(counts: Counts, card: ResolvedCard, proposed: boolean): void {
  if (proposed) {
    for (const tag of card.proposed_tags ?? []) add(counts, `proposed.${tag.field}`, [tag.tag]);
    return;
  }
  const describe = card.describe ?? {};
  add(counts, 'kind', card.card_type === 'asset' ? [`${card.kind}/${card.subkind}`] : kindsOf(card));
  add(counts, 'collection', [card.card_type === 'collection' ? card.id : card.collection]);
  add(counts, 'environments', card.resolved.environments ?? []);
  add(counts, 'settings', card.resolved.settings ?? []);
  add(counts, 'roles', describe.roles ?? []);
  add(counts, 'moods', describe.moods ?? []);
  add(counts, 'materials', describe.materials ?? []);
  add(counts, 'condition', [describe.condition]);
  add(counts, 'style_family', [card.resolved.style_family]);
  add(counts, 'pov_fit', card.resolved.pov_fit ?? []);
  add(counts, 'uses', card.resolved.rights.uses);
  add(counts, 'status', [card.status]);
}

/** Value counts per facet over the cards that pass the query's filters; `proposed` counts `proposed_tags` instead. */
export function facets(index: CardIndex, q: Omit<SearchQuery, 'limit'>, opts: { proposed?: boolean } = {}): Counts {
  const counts: Counts = {};
  const words = q.words ?? [];
  for (const card of index.cards) {
    if (!passes(index, card, q)) continue;
    if (words.length > 0 && score(card, words) === 0) continue;
    count(counts, card, opts.proposed === true);
  }
  return counts;
}
