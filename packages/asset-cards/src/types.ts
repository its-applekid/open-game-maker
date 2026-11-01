import type { AssetCard, Audience, Redistribution, Use } from '@ogm/contracts';

export type Rights = { uses: Use[]; audience: Audience; redistribution: Redistribution };

export type ResolvedCard = AssetCard & {
  resolved: {
    license: string;
    rights: Rights;
    style_family?: string;
    pov_fit?: string[];
    settings?: string[];
    environments?: string[];
    provenance: Record<string, { by: 'collection' }>;
  };
};

export type IndexError = { path: string; errors: string[] };

export type CardIndex = {
  version: 1;
  built: string;
  vocab: string;
  cards: ResolvedCard[];
  collections: Record<string, ResolvedCard>;
  errors: IndexError[];
};

export type SearchQuery = {
  words?: string[];
  kind?: string;
  subkind?: string;
  family?: string;
  /** The game's family (from `assets.lock.json`): only cards of this family or `any` (R55). */
  gameFamily?: string;
  pov?: string;
  use?: Use;
  rigId?: string;
  sameRigAs?: string;
  includeDraft?: boolean;
  tier?: number;
  collection?: string;
  limit?: number;
};
