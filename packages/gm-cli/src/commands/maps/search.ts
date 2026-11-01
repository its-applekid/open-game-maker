import { loadIndex, type ResolvedCard } from '@ogm/asset-cards';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';
import { loadSpecs, matchSpec, parseQuery, type SpecQuery } from '../../maps/specs.js';

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge'];

type Row = {
  kind: 'spec' | 'card';
  id: string;
  map_type: string;
  rooms: number | null;
  loops: number | null;
  secrets: number | null;
  size: string | null;
  flow: string | null;
  thumb: string | null;
  score: number;
  confidence: number;
  path?: string;
};

function line(row: Row): string {
  const cell = (value: string | number | null) => (value === null ? '-' : String(value));
  return [row.id, row.map_type, row.rooms, row.loops, row.secrets, row.size, row.flow, row.thumb]
    .map(cell)
    .concat(row.kind === 'card' ? ['card'] : [])
    .join('  ');
}

function hasTerms(q: SpecQuery): boolean {
  return Boolean(
    q.rooms || q.loops || q.secrets !== undefined || q.size || q.sizeWord || q.types.length || q.words.length,
  );
}

/** Weaker fallback over map cards themselves: map type, environments and description words. */
function cardRows(cards: ResolvedCard[], q: SpecQuery): Row[] {
  const rows: Row[] = [];
  for (const card of cards) {
    if (card.kind !== 'inspiration' || card.subkind !== 'map' || card.map?.usable === 'no') continue;
    if (!card.resolved.rights.uses.includes('derive-layout')) continue;
    const places = [card.map?.map_type ?? '', ...(card.resolved.environments ?? [])];
    if (!q.types.every((type) => places.includes(type))) continue;
    const text = (card.describe?.description ?? '').toLowerCase().split(/[^a-z0-9-]+/);
    const score = q.types.length + q.words.filter((word) => text.includes(word)).length;
    if (hasTerms(q) && score === 0) continue;
    rows.push({
      kind: 'card',
      id: card.id,
      map_type: card.map?.map_type ?? '-',
      rooms: null,
      loops: null,
      secrets: null,
      size: null,
      flow: null,
      thumb: card.previews?.thumb ?? null,
      score,
      confidence: 0,
    });
  }
  return rows;
}

export const command: GmCommand = {
  name: 'maps search',
  summary: 'find map layout specs by structure; only sources that grant derive-layout are shown',
  usage: '"<words>" [--rooms 3-5] [--loops N] [--secret] [--size small] [--type crypt]',
  example: 'maps search "small crypt 3-5 rooms one loop secret door"',
  flags: {
    rooms: { type: 'string', help: 'room count or range (3-5)' },
    loops: { type: 'number', help: 'exactly N loops' },
    secret: { type: 'boolean', default: false, help: 'at least one secret door' },
    size: { type: 'string', help: `size class (${SIZES.join(', ')})` },
    type: { type: 'string', help: 'map type or theme (dungeon, cave, crypt, ...)' },
    cards: { type: 'boolean', default: false, help: 'also match map cards by type and description (weaker)' },
  },
  async run(ctx, args, flags) {
    const root = requireAssetsRoot(ctx);
    if (typeof flags.size === 'string' && !SIZES.includes(flags.size))
      throw new UsageError(`unknown size "${flags.size}"`, 'gm maps search --size small');
    let q: SpecQuery;
    try {
      q = parseQuery(args, {
        rooms: flags.rooms as string | undefined,
        loops: flags.loops as number | undefined,
        secret: flags.secret === true,
        size: flags.size as string | undefined,
        type: flags.type as string | undefined,
      });
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error), 'gm maps search --rooms 3-5');
    }

    const index = await loadIndex(root);
    const specs = await loadSpecs(root, index);
    const rows: Row[] = [];
    let hidden = 0;
    let invalid = 0;
    for (const loaded of specs) {
      const spec = loaded.spec;
      if (!spec || loaded.errors.length > 0) {
        invalid += 1;
        ctx.err(`invalid: ${loaded.path}: ${loaded.errors.join('; ')}`);
        continue;
      }
      const match = matchSpec(spec, q);
      if (!match.hard || (hasTerms(q) && match.score === 0)) continue;
      if (!loaded.allowed) {
        hidden += 1;
        continue;
      }
      const { computed, judged } = spec.tags;
      rows.push({
        kind: 'spec',
        id: spec.id,
        map_type: judged.map_type,
        rooms: computed.room_count,
        loops: computed.loop_count,
        secrets: computed.secret_count,
        size: computed.size_class,
        flow: judged.flow ?? null,
        thumb: loaded.sourceCard?.previews?.thumb ?? null,
        score: match.score,
        confidence: spec.extraction?.confidence ?? 0,
        path: loaded.path,
      });
    }
    if (flags.cards === true) rows.push(...cardRows(index.cards, q));
    rows.sort(
      (a, b) =>
        Number(a.kind === 'card') - Number(b.kind === 'card') ||
        b.score - a.score ||
        b.confidence - a.confidence ||
        (a.id < b.id ? -1 : 1),
    );

    const shown = rows.slice(0, ctx.limit);
    for (const row of shown) {
      if (ctx.json) printJson(ctx, row);
      else ctx.out(line(row));
    }
    if (shown.length === 0 && !ctx.json) ctx.err('no matches');
    if (hidden > 0) ctx.err(`hidden: ${hidden} specs (source lacks derive-layout)`);
    ctx.emit('maps.search', { args, rows: rows.length, hidden, invalid });
    return EXIT.ok;
  },
};
