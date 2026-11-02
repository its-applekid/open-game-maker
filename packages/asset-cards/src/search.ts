import type { AssetCard } from '@ogm/contracts';

import { inFamily, packOf, setFor } from './families.js';
import type { CardIndex, ResolvedCard, SearchQuery } from './types.js';

type Status = AssetCard['status'];

const STATUS_RANK: Record<Status, number> = {
  reviewed: 4,
  tagged: 3,
  measured: 2,
  draft: 1,
  quarantined: 0,
  rejected: 0,
};
const TAGGED: Status[] = ['tagged', 'reviewed'];
const MEASURED: Status[] = ['measured', 'tagged', 'reviewed'];
// E05-3: models and sprites have no tagging pass yet, so their drafts are searchable by default.
const UNTAGGED_OK: Status[] = ['draft', 'measured', 'tagged', 'reviewed'];

/** C3 §10 status defaults per kind; `--include-draft` adds `draft` everywhere. Quarantined and rejected never pass. */
export function statusAllowed(kind: string | undefined, status: Status, includeDraft = false): boolean {
  if (includeDraft && status === 'draft') return true;
  if (kind === 'model' || kind === 'sprite') return UNTAGGED_OK.includes(status);
  if (kind === 'audio' || kind === 'inspiration') return TAGGED.includes(status);
  return MEASURED.includes(status);
}

/** Top-level kinds a card covers: its own, or for a collection the kinds it counts. */
export function kindsOf(card: AssetCard): string[] {
  if (card.card_type === 'asset') return card.kind ? [card.kind] : [];
  const counts = card.collection_info?.counts ?? {};
  return [...new Set(Object.keys(counts).map((key) => key.split('/')[0]))];
}

function tierOf(id: string): number | undefined {
  const match = /^t(\d):/.exec(id);
  return match ? Number(match[1]) : undefined;
}

function normalize(word: string): string {
  const lowered = word.toLowerCase();
  return lowered.length > 3 && lowered.endsWith('s') ? lowered.slice(0, -1) : lowered;
}

function tokens(text: string | undefined): string[] {
  return (text ?? '')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(normalize);
}

/** Weighted fields: title 3, objects 2, everything else 1. */
function fieldsOf(card: ResolvedCard): [number, string[]][] {
  const describe = card.describe ?? {};
  const rest = [
    describe.description,
    ...(describe.keywords ?? []),
    ...(describe.roles ?? []),
    ...(describe.moods ?? []),
    describe.world,
    ...(card.resolved.environments ?? []),
    ...(card.resolved.settings ?? []),
    card.kind,
    card.subkind,
    card.id,
    ...(card.source?.files ?? []).map((file) => file.path),
    ...(card.sprite?.animations ?? []).map((animation) => animation.name),
    ...(card.rig?.clips ?? []).flatMap((clip) => [clip.name, clip.canonical]),
    ...(card.anim?.clips ?? []).flatMap((clip) => [clip.name, clip.canonical]),
  ];
  return [
    [3, tokens(card.title)],
    [2, (describe.objects ?? []).flatMap(tokens)],
    [1, rest.flatMap((value) => tokens(value))],
  ];
}

/** 0 when any word is missing (AND match), else the sum of weighted hits. */
export function score(card: ResolvedCard, words: string[]): number {
  const fields = fieldsOf(card);
  let total = 0;
  for (const word of words.map(normalize)) {
    const hits = fields.reduce(
      (sum, [weight, list]) => sum + weight * list.filter((token) => token === word).length,
      0,
    );
    if (hits === 0) return 0;
    total += hits;
  }
  return total;
}

function collectionOf(index: CardIndex, card: ResolvedCard): ResolvedCard | undefined {
  return card.card_type === 'asset' && card.collection ? index.collections[card.collection] : undefined;
}

/** Every filter except text: rights, status, kind and the explicit flags. */
export function passes(index: CardIndex, card: ResolvedCard, q: SearchQuery): boolean {
  const use = q.use ?? 'in-game';
  if (card.status === 'quarantined' || card.status === 'rejected') return false;
  if (collectionOf(index, card)?.status === 'quarantined') return false;
  if (!card.resolved.rights.uses.includes(use)) return false;
  if ((use === 'in-game' || use === 'placeholder') && kindsOf(card).includes('inspiration')) return false;

  const kinds = kindsOf(card);
  const candidates = q.kind ? kinds.filter((kind) => kind === q.kind) : kinds.length > 0 ? kinds : [undefined];
  if (candidates.length === 0) return false;
  if (!candidates.some((kind) => statusAllowed(kind, card.status, q.includeDraft))) return false;
  if (q.subkind && card.card_type === 'asset' && card.subkind !== q.subkind) return false;

  if (q.family && card.resolved.style_family !== q.family) return false;
  const needsSet = q.set !== undefined || Boolean(q.gameSets?.length);
  const pack = needsSet ? packOf(card.id) : undefined;
  const set = pack ? setFor(pack)?.id : undefined;
  if (q.set !== undefined) {
    if (set !== q.set) return false;
  }
  if (q.gameFamily && !inFamily(card, q.gameFamily)) return false;
  if (q.gameSets?.length && card.resolved.style_family !== 'any') {
    if ((!set || !q.gameSets.includes(set)) && (!pack || !q.gamePacks?.includes(pack))) return false;
  }
  if (q.pov && !(card.resolved.pov_fit ?? []).includes(q.pov)) return false;
  if (q.tier !== undefined && tierOf(card.id) !== q.tier) return false;
  if (q.collection && card.id !== q.collection && card.collection !== q.collection) return false;
  if (q.rigId && card.rig?.rig_id !== q.rigId) return false;
  if (q.sameRigAs) {
    const rigId = index.cards.find((other) => other.id === q.sameRigAs)?.rig?.rig_id;
    if (!rigId || card.rig?.rig_id !== rigId) return false;
  }
  return true;
}

export function search(index: CardIndex, q: SearchQuery): ResolvedCard[] {
  const words = q.words ?? [];
  const scored = index.cards
    .filter((card) => passes(index, card, q))
    .map((card) => ({ card, score: words.length > 0 ? score(card, words) : 0 }))
    .filter(({ score: value }) => words.length === 0 || value > 0);
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.card.card_type === 'collection') - Number(b.card.card_type === 'collection') ||
      STATUS_RANK[b.card.status] - STATUS_RANK[a.card.status] ||
      a.card.id.localeCompare(b.card.id),
  );
  const hits = scored.map(({ card }) => card);
  return q.limit === undefined ? hits : hits.slice(0, q.limit);
}

export function info(index: CardIndex, ids: string[]): (ResolvedCard | { id: string; missing: true })[] {
  const byId = new Map(index.cards.map((card) => [card.id, card]));
  return ids.map((id) => byId.get(id) ?? { id, missing: true });
}

/** One search row: `id  kind/subkind  status  family  title`. */
export function formatRow(card: ResolvedCard): string {
  const kind =
    card.card_type === 'asset'
      ? `${card.kind ?? '-'}/${card.subkind ?? '-'}`
      : `collection/${kindsOf(card).join('+') || '-'}`;
  return [card.id, kind, card.status, card.resolved.style_family ?? '-', card.title].join('  ');
}
