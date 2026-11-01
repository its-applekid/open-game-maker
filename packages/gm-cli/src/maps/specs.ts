import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CardIndex, ResolvedCard } from '@ogm/asset-cards';
import { layoutMetrics, validateLayoutSpec, type MapLayoutSpec } from '@ogm/contracts';

import { relKey, walk } from '../packs/hashwalk.js';

export type LoadedSpec = {
  path: string;
  spec: MapLayoutSpec | null;
  sourceCard: ResolvedCard | null;
  /** C3 §10: only a source whose resolved rights include `derive-layout` may be searched. */
  allowed: boolean;
  errors: string[];
};

export type SpecQuery = {
  rooms?: [number, number];
  loops?: { min: number; exact: boolean };
  secrets?: number;
  /** Hard: `--size`. */
  size?: string;
  /** Soft: a size word in the text ranks but does not exclude (size classes are coarse buckets). */
  sizeWord?: string;
  /** Each must equal `map_type` or appear in `themes`. */
  types: string[];
  /** Ranking words matched against themes, flow, suits, feature types and notes. */
  words: string[];
};

export type SpecFlags = { rooms?: string; loops?: number; secret?: boolean; size?: string; type?: string };

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge'];
const TYPES = new Set([
  ...['dungeon', 'cave', 'castle', 'keep', 'temple', 'crypt', 'building', 'tavern', 'town', 'city', 'ship'],
  ...['sewer', 'mine', 'wilderness', 'battlemap', 'region', 'ruins', 'graveyard', 'camp', 'village', 'interior'],
  ...['shop', 'house', 'farm', 'forest', 'jungle', 'mountain', 'desert', 'swamp', 'arena'],
]);
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const FILLER = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'door', 'doors', 'map', 'maps', 'layout']);

/** `inspiration/<id>/layouts/**\/*.layout.json`, validated and joined to their source cards. */
export async function loadSpecs(root: string, index: CardIndex): Promise<LoadedSpec[]> {
  const cards = new Map(index.cards.map((card) => [card.id, card]));
  let collections: string[];
  try {
    collections = (await readdir(join(root, 'inspiration'))).sort();
  } catch {
    return [];
  }
  const loaded: LoadedSpec[] = [];
  for (const collection of collections) {
    for await (const file of walk(root, join(root, 'inspiration', collection, 'layouts'))) {
      if (!file.rel.endsWith('.layout.json')) continue;
      loaded.push(await loadSpec(file.abs, relKey(root, file.abs), cards));
    }
  }
  return loaded;
}

async function loadSpec(abs: string, path: string, cards: Map<string, ResolvedCard>): Promise<LoadedSpec> {
  let doc: unknown;
  try {
    doc = JSON.parse(await readFile(abs, 'utf8'));
  } catch (error) {
    return { path, spec: null, sourceCard: null, allowed: false, errors: [`unreadable JSON: ${String(error)}`] };
  }
  const result = validateLayoutSpec(doc);
  if (!result.ok) return { path, spec: null, sourceCard: null, allowed: false, errors: result.errors };
  const spec = result.spec;
  const sourceCard = cards.get(spec.source.card_id) ?? null;
  const metrics = layoutMetrics(spec);
  const computed = spec.tags.computed;
  const errors = (['room_count', 'connection_count', 'loop_count', 'dead_end_count', 'secret_count'] as const)
    .filter((key) => metrics[key] !== computed[key])
    .map((key) => `tags.computed.${key} is ${computed[key]} but the graph gives ${metrics[key]}`);
  if (!metrics.endpoints_ok) errors.push('a connection names a room that does not exist');
  const allowed = sourceCard?.resolved.rights.uses.includes('derive-layout') === true;
  return { path, spec, sourceCard, allowed, errors };
}

/** C3 §10 example: "small crypt 3-5 rooms one loop secret door" → size small, type crypt, rooms 3-5, loops ≥ 1, secrets ≥ 1. */
export function parseQuery(words: string[], flags: SpecFlags = {}): SpecQuery {
  const tokens = words.flatMap((word) => word.toLowerCase().split(/\s+/)).filter(Boolean);
  const q: SpecQuery = { types: [], words: [] };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1] ?? '';
    const count = NUMBERS[token] ?? (/^\d+$/.test(token) ? Number(token) : undefined);
    const range = /^(\d+)-(\d+)$/.exec(token);
    if ((range || count !== undefined) && /^rooms?$/.test(next)) {
      q.rooms = range ? [Number(range[1]), Number(range[2])] : [count!, count!];
      i += 1;
    } else if (count !== undefined && /^loops?$/.test(next)) {
      q.loops = { min: count, exact: false };
      i += 1;
    } else if (count !== undefined && /^secrets?$/.test(next)) {
      q.secrets = count;
      i += 1;
    } else if (/^loops?$/.test(token) || token === 'looping') q.loops = { min: 1, exact: false };
    else if (/^secrets?$/.test(token)) q.secrets = 1;
    else if (SIZES.includes(token)) q.sizeWord = token;
    else if (TYPES.has(token)) q.types.push(token);
    else if (!FILLER.has(token)) q.words.push(token);
  }
  if (flags.rooms !== undefined) q.rooms = parseRange(flags.rooms);
  if (flags.loops !== undefined) q.loops = { min: flags.loops, exact: true };
  if (flags.secret === true) q.secrets = Math.max(q.secrets ?? 0, 1);
  if (flags.size !== undefined) q.size = flags.size;
  if (flags.type !== undefined) q.types.push(flags.type);
  return q;
}

/** `3-5` → [3, 5]; `4` → [4, 4]; anything else throws. */
export function parseRange(text: string): [number, number] {
  const match = /^(\d+)(?:-(\d+))?$/.exec(text.trim());
  if (!match) throw new RangeError(`"${text}" is not a room count or range like 3-5`);
  const low = Number(match[1]);
  const high = match[2] === undefined ? low : Number(match[2]);
  return low <= high ? [low, high] : [high, low];
}

/** Hard filters decide `hard`; soft terms (size word, ranking words) add to `score`. */
export function matchSpec(spec: MapLayoutSpec, q: SpecQuery): { hard: boolean; score: number } {
  const computed = spec.tags.computed;
  const judged = spec.tags.judged;
  const themes = judged.themes ?? [];
  let hard = true;
  if (q.rooms && (computed.room_count < q.rooms[0] || computed.room_count > q.rooms[1])) hard = false;
  if (q.loops && (q.loops.exact ? computed.loop_count !== q.loops.min : computed.loop_count < q.loops.min))
    hard = false;
  if (q.secrets !== undefined && computed.secret_count < q.secrets) hard = false;
  if (q.size && computed.size_class !== q.size) hard = false;
  for (const type of q.types) if (judged.map_type !== type && !themes.includes(type as never)) hard = false;

  const text = [
    ...themes,
    judged.flow ?? '',
    judged.difficulty_flow ?? '',
    ...(judged.suits ?? []),
    ...(spec.features ?? []).map((feature) => feature.type),
    ...(spec.notes ?? '').toLowerCase().split(/[^a-z0-9-]+/),
  ];
  let score = q.types.length + [q.rooms, q.loops, q.secrets, q.size].filter((term) => term !== undefined).length;
  if (q.sizeWord && computed.size_class === q.sizeWord) score += 1;
  for (const word of q.words) if (text.includes(word) || text.includes(word.replace(/s$/, ''))) score += 1;
  return { hard, score };
}
