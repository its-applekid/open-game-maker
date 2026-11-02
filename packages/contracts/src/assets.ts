import { z } from 'zod';

import { assetCardMetaDefs, type AssetCard } from './card.generated.js';

export const tierSchema = z.enum(['desktop', 'mobile', 'low']);
export type Tier = z.infer<typeof tierSchema>;

/**
 * Additive revision within `version: 1` for both the lock and the manifest; readers accept any minor.
 * 1: entries may carry `meta` (card sprite/rig/kit/geometry blocks).
 */
export const ASSETS_SCHEMA_MINOR = 1;
const minorSchema = z.number().int().min(0).optional();

const fileEntrySchema = z.looseObject({
  bytes: z.number().int().min(0),
  tris: z.number().int().min(0).optional(),
  gpuTexMB: z.number().min(0).optional(),
  decoders: z.array(z.enum(['meshopt', 'draco', 'ktx2'])),
});

type CardMetadataBlock = 'sprite' | 'rig' | 'kit' | 'geometry';

/** Re-uses the asset-card `$defs` block (generated from asset-card.schema.json), never a local copy. */
function cardMetadataBlock<K extends CardMetadataBlock>(block: K): z.ZodType<NonNullable<AssetCard[K]>> {
  const $defs = assetCardMetaDefs as Record<string, z.core.JSONSchema.JSONSchema>;
  return z.fromJSONSchema({ $defs, $ref: `#/$defs/${block}` }) as z.ZodType<NonNullable<AssetCard[K]>>;
}

/** Strings in `meta` reach the public manifest: no absolute, home-relative or parent-escaping paths. */
function unsafeMetaString(value: string): boolean {
  if (/^(?:[/\\~]|[A-Za-z]:[\\/])/.test(value)) return true;
  return value.split(/[/\\]/).includes('..');
}

function checkMetaStrings(value: unknown, path: PropertyKey[], ctx: z.RefinementCtx): void {
  if (typeof value === 'string') {
    if (unsafeMetaString(value)) {
      ctx.addIssue({ code: 'custom', path, message: 'meta paths must be relative and stay inside the asset' });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => checkMetaStrings(item, [...path, index], ctx));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) checkMetaStrings(item, [...path, key], ctx);
  }
}

export const assetMetadataSchema = z
  .strictObject({
    sprite: cardMetadataBlock('sprite').optional(),
    rig: cardMetadataBlock('rig').optional(),
    kit: cardMetadataBlock('kit').optional(),
    geometry: cardMetadataBlock('geometry').optional(),
  })
  .superRefine((meta, ctx) => checkMetaStrings(meta, [], ctx));
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

const assetEntrySchema = z.looseObject({
  /** Per-tier file names (or `*` for every tier); the loader never derives names. */
  file: z.partialRecord(z.enum([...tierSchema.options, '*']), z.string().min(1)),
  mesh: z.string().optional(),
  bounds: z.tuple([z.number(), z.number(), z.number()]).optional(),
  source: z.looseObject({ pack: z.string(), version: z.string(), path: z.string() }).optional(),
  meta: assetMetadataSchema.optional(),
  license: z.looseObject({
    id: z.string().min(1),
    attribution: z.string().optional(),
    use: z.enum(['any', 'personal', 'inspiration']),
  }),
});

/** C4 §5.2 build manifest (`public/assets/manifest.json`), produced by OGM-063. */
export const assetManifestSchema = z
  .looseObject({
    version: z.literal(1),
    minor: minorSchema,
    built: z.iso.datetime().optional(),
    tiers: z.array(tierSchema).min(1),
    files: z.record(z.string().min(1), fileEntrySchema),
    assets: z.record(z.string().min(1), assetEntrySchema),
  })
  .superRefine((manifest, ctx) => {
    for (const [id, asset] of Object.entries(manifest.assets)) {
      for (const [tier, name] of Object.entries(asset.file)) {
        if (name !== undefined && !(name in manifest.files)) {
          ctx.addIssue({
            code: 'custom',
            path: ['assets', id, 'file', tier],
            message: `file ${name} is not listed in files`,
          });
        }
      }
    }
  });
export type AssetManifest = z.infer<typeof assetManifestSchema>;

/** C4 §3.2 signals plus a `?tier=` override; implemented by OGM-026. */
export type PickTier = () => Tier;

/** Implemented by OGM-026; the engine supplies the concrete mesh and texture types. */
export interface AssetLoader<Mesh = unknown, Texture = unknown> {
  preload(ids: string[]): Promise<void>;
  mesh(id: string): Promise<Mesh>;
  texture(id: string): Promise<Texture>;
  audio(id: string): Promise<AudioBuffer>;
}

// ---- lockfile (OGM-062 edits below this line) ----

export const styleFamilyIdSchema = z.enum([
  'chunky-low-poly',
  'detailed-low-poly',
  'simple-low-poly',
  'pixel-art',
  'flat-cartoon',
  'isometric-2d',
  'sketch',
  'photoreal',
  'any',
]);
export type StyleFamilyId = z.infer<typeof styleFamilyIdSchema>;

export const povIdSchema = z.enum(['iso', 'topdown', 'side', 'follow', 'fps', 'orbit', 'fixed']);
export type PovId = z.infer<typeof povIdSchema>;

export const useSchema = z.enum([
  'in-game',
  'placeholder',
  'derive-layout',
  'style-reference',
  'vision-input',
  'edit-audio',
  'derive-audio',
]);

const lockAssetIdSchema = z
  .string()
  .regex(
    /^(?:t[12]:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9/._-]*@[A-Za-z0-9._-]+|t3:[A-Za-z0-9][A-Za-z0-9_-]*\/[a-z0-9][a-z0-9/._-]*)$/,
    'invalid lock asset id',
  );

const lockEntrySchema = z.looseObject({
  id: lockAssetIdSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  path: z.string().min(1),
  license: z.string().min(1),
  rights: z.looseObject({
    uses: z.array(useSchema),
    audience: z.enum(['private', 'public']),
    redistribution: z.enum(['none', 'in-build', 'free']),
    attribution: z.string().nullable(),
  }),
  meta: assetMetadataSchema.optional(),
  derived_from: z.array(lockAssetIdSchema).optional(),
  added: z.iso.date(),
});

function safeRepoPath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) return false;
  const segments = path.replaceAll('\\', '/').split('/');
  return !segments.some((segment) => segment === '..' || segment === 'node_modules' || segment === '.gm');
}

/** T05 §4 `assets.lock.json`: committed, the source of truth for rights. */
export const AssetsLockSchema = z
  .looseObject({
    version: z.literal(1),
    minor: minorSchema,
    family: styleFamilyIdSchema,
    pov: povIdSchema,
    assets: z.array(lockEntrySchema),
  })
  .superRefine((lock, ctx) => {
    let previous: string | undefined;
    for (const [index, entry] of lock.assets.entries()) {
      if (previous !== undefined && entry.id <= previous) {
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'id'],
          message: entry.id === previous ? 'asset ids must be unique' : 'asset ids must be sorted ascending',
        });
      }
      previous = entry.id;
      if (entry.rights.redistribution === 'none') {
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'rights', 'redistribution'],
          message: 'assets with redistribution none cannot enter the lock',
        });
      }
      if (!safeRepoPath(entry.path)) {
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'path'],
          message: 'path must be relative, inside the repo, and outside node_modules and .gm',
        });
      }
    }
  });
export const assetsLockSchema = AssetsLockSchema;
export type AssetsLock = z.infer<typeof AssetsLockSchema>;
export type LockEntry = AssetsLock['assets'][number];

export const assetsSchemas = {
  'assets.v1': assetManifestSchema,
  'assets-lock.v1': assetsLockSchema,
} satisfies Record<'assets.v1' | 'assets-lock.v1', z.ZodType>;
