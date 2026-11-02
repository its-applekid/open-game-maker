import type { AssetMetadata, CacheEntryKind, LockEntry, Tier } from '@ogm/contracts';

export type LicenseEntry = {
  id: string;
  attribution?: string;
  use: 'any' | 'personal';
};

export type ManifestAssetEntry = {
  file: Partial<Record<Tier | '*', string>>;
  mesh?: string;
  bounds?: [number, number, number];
  license: LicenseEntry;
  meta?: AssetMetadata;
};

export type BuiltFileInfo = {
  bytes: number;
  tris?: number;
  gpuTexMB?: number;
  maxTexture?: number;
  decoders: Array<'meshopt' | 'draco' | 'ktx2'>;
};

export type JobResult = {
  files: Record<string, BuiltFileInfo>;
  assets: Record<string, ManifestAssetEntry>;
};

export type FreshJobResult = JobResult & { buffers: Record<string, Buffer> };

export type GltfFacts = {
  triangles: number;
  rigged: boolean;
  textureKeys: string[];
};

export type BuildItem = {
  entry: LockEntry;
  source: string;
  meta?: AssetMetadata;
  facts?: GltfFacts;
  sourceHash?: string;
};

export type CacheIdentity = { sourceHash: string; key: string };

export type BuildJob = {
  kind: 'kit' | 'model' | 'image' | 'audio' | 'font';
  cacheKind: CacheEntryKind;
  slug: string;
  items: BuildItem[];
  tiers: Tier[];
  recipe: Record<string, unknown>;
  /** Image jobs in a `pixel-art` family game encode losslessly so sheet frames stay exact. */
  pixelArt?: boolean;
};

export type CompletedJob = { job: BuildJob; result: JobResult };

export type BuildFailure = { id: string; message: string };

export type AssetBudgetReport = {
  tier: Tier;
  bytes: number;
  files: number;
  tris: number;
  gpuTexMB: number;
  maxTexture: number;
  exceeded: Array<{ metric: string; value: number; limit: number }>;
};

export function licenseFor(entry: LockEntry): LicenseEntry {
  return {
    id: entry.license,
    ...(entry.rights.attribution ? { attribution: entry.rights.attribution } : {}),
    use: entry.rights.audience === 'private' ? 'personal' : 'any',
  };
}

export function manifestAsset(
  item: BuildItem,
  file: ManifestAssetEntry['file'],
  extra: Pick<ManifestAssetEntry, 'mesh' | 'bounds'> = {},
): ManifestAssetEntry {
  return {
    file,
    ...extra,
    license: licenseFor(item.entry),
    ...(item.meta === undefined ? {} : { meta: item.meta }),
  };
}
