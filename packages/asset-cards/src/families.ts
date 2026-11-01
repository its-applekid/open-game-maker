import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { CardIndex, ResolvedCard } from './types.js';

/** C3 §4 `style_family` ids that are families (`photoreal` and `any` never are). */
export const STYLE_FAMILY_IDS = [
  'chunky-low-poly',
  'detailed-low-poly',
  'simple-low-poly',
  'pixel-art',
  'flat-cartoon',
  'isometric-2d',
  'sketch',
] as const;
export type StyleFamilyId = (typeof STYLE_FAMILY_IDS)[number];

/** C3 §4 `pov_fit` ids (SDK camera rigs). */
export const POV_IDS = ['iso', 'topdown', 'side', 'follow', 'fps', 'orbit', 'fixed'] as const;
export type PovId = (typeof POV_IDS)[number];

export const COVERAGE_KEYS = ['characters', 'environment', 'props', 'ui', 'sfx', 'music'] as const;
type CoverageKey = (typeof COVERAGE_KEYS)[number];
export type Coverage = Record<CoverageKey, boolean>;

export type StyleFamily = {
  id: StyleFamilyId;
  label: string;
  dimension: '2d' | '3d';
  fidelity: string;
  packs: { primary: string[]; extras: string[] };
  views: PovId[];
  license_note: string;
  coverage: Coverage;
  creation_choice: boolean;
};

/** What `GET /api/catalog/style-families` returns per family (OGM-074 renders it). */
export type StyleFamilyApi = {
  id: StyleFamilyId;
  label: string;
  dimension: '2d' | '3d';
  fidelity: string;
  views: PovId[];
  creationChoice: boolean;
  coverage: Coverage;
  packs: { id: string; name: string; thumbnailUrl: string | null }[];
};

const coverageSchema = z.strictObject(
  Object.fromEntries(COVERAGE_KEYS.map((key) => [key, z.boolean()])) as Record<CoverageKey, z.ZodBoolean>,
);

/** C2 §2: a family is offered at creation only when it has characters, environment and props. */
export const StyleFamilySchema = z
  .strictObject({
    id: z.enum(STYLE_FAMILY_IDS),
    label: z.string().min(1),
    dimension: z.enum(['2d', '3d']),
    fidelity: z.string().min(1),
    packs: z.strictObject({ primary: z.array(z.string().min(1)).min(1), extras: z.array(z.string().min(1)) }),
    views: z.array(z.enum(POV_IDS)).min(1),
    license_note: z.string().min(1),
    coverage: coverageSchema,
    creation_choice: z.boolean(),
  })
  .refine((f) => !f.creation_choice || (f.coverage.characters && f.coverage.environment && f.coverage.props), {
    message: 'creation_choice needs coverage.characters, environment and props',
    path: ['creation_choice'],
  });

/** The file: exactly the seven families, each once, and every pack in at most one family. */
export const StyleFamiliesSchema = z.array(StyleFamilySchema).superRefine((families, ctx) => {
  const ids = families.map((f) => f.id);
  for (const id of STYLE_FAMILY_IDS) {
    if (ids.filter((other) => other === id).length !== 1)
      ctx.addIssue({ code: 'custom', message: `${id} must appear once` });
  }
  const seen = new Map<string, string>();
  for (const f of families) {
    for (const pack of [...f.packs.primary, ...f.packs.extras]) {
      const owner = seen.get(pack);
      if (owner) ctx.addIssue({ code: 'custom', message: `${pack} is in both ${owner} and ${f.id}` });
      seen.set(pack, f.id);
    }
  }
});

export const FAMILIES_PATH = fileURLToPath(new URL('../data/style-families.json', import.meta.url));

let cached: StyleFamily[] | undefined;

/** The curated `data/style-families.json`, validated (throws on a malformed file). */
export function loadFamilies(): StyleFamily[] {
  cached ??= StyleFamiliesSchema.parse(JSON.parse(readFileSync(FAMILIES_PATH, 'utf8')));
  return cached;
}

export function familyFor(packId: string): StyleFamilyId | undefined {
  return loadFamilies().find((f) => f.packs.primary.includes(packId) || f.packs.extras.includes(packId))?.id;
}

export function isCreationChoice(family: string): boolean {
  return loadFamilies().some((f) => f.id === family && f.creation_choice);
}

/** R55 search default: a game's cards are its family's or style-neutral (`any`). */
export function inFamily(card: ResolvedCard, family: string): boolean {
  const own = card.resolved.style_family;
  return own === family || own === 'any';
}

/** `t1:kenney-mini-dungeon/wall@2.0` and `t1:kenney-mini-dungeon@2.0` → `kenney-mini-dungeon`. */
export function packOf(cardId: string): string | undefined {
  return /^t\d:([^/@]+)/.exec(cardId)?.[1];
}

/** Coverage key a `kind/subkind` (asset card, or a collection's counts key) satisfies, if any. */
function coverageOf(kindPath: string): CoverageKey | undefined {
  const [kind, sub] = kindPath.split('/');
  if (kind === 'ui') return 'ui';
  if (kind === 'anim') return 'characters';
  if (kind === 'texture') return 'environment';
  if (kind === 'audio') return sub === 'sfx' ? 'sfx' : sub === 'music' ? 'music' : undefined;
  if (kind === 'model') {
    if (sub === 'character' || sub === 'creature') return 'characters';
    if (sub === 'kit' || sub === 'nature' || sub === 'building') return 'environment';
    if (sub === 'prop' || sub === 'weapon' || sub === 'food' || sub === 'vehicle') return 'props';
  }
  if (kind === 'sprite') {
    if (sub === 'character') return 'characters';
    if (sub === 'tile' || sub === 'background') return 'environment';
    if (sub === 'prop' || sub === 'item') return 'props';
  }
  return undefined;
}

function kindPaths(card: ResolvedCard): string[] {
  if (card.card_type === 'asset') return card.kind ? [[card.kind, card.subkind].filter(Boolean).join('/')] : [];
  return Object.keys(card.collection_info?.counts ?? {});
}

/**
 * Measured coverage: what the cards in the family's packs hold (asset kind/subkind, a collection's `counts`
 * keys, and its curated `family_coverage`, C3 §8), in-game cards only. SFX and music from `any`-family audio count
 * for every family.
 */
export function computeCoverage(index: CardIndex, f: StyleFamily): Coverage {
  const packs = new Set([...f.packs.primary, ...f.packs.extras]);
  const coverage: Coverage = {
    characters: false,
    environment: false,
    props: false,
    ui: false,
    sfx: false,
    music: false,
  };
  for (const card of index.cards) {
    if (card.status === 'quarantined' || card.status === 'rejected') continue;
    if (card.collection && index.collections[card.collection]?.status === 'quarantined') continue;
    if (!card.resolved.rights.uses.includes('in-game')) continue;
    const pack = packOf(card.id);
    const ours = pack !== undefined && packs.has(pack);
    if (!ours && card.resolved.style_family !== 'any') continue;
    for (const path of kindPaths(card)) {
      const key = coverageOf(path);
      if (key && (ours || key === 'sfx' || key === 'music')) coverage[key] = true;
    }
    if (ours && card.card_type === 'collection') {
      for (const key of COVERAGE_KEYS) if (card.collection_info?.family_coverage?.[key]) coverage[key] = true;
    }
  }
  return coverage;
}
