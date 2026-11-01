import { z } from 'zod';

export const tierSchema = z.enum(['desktop', 'mobile', 'low']);
export type Tier = z.infer<typeof tierSchema>;

const fileEntrySchema = z.looseObject({
  bytes: z.number().int().min(0),
  tris: z.number().int().min(0).optional(),
  gpuTexMB: z.number().min(0).optional(),
  decoders: z.array(z.enum(['meshopt', 'draco', 'ktx2'])),
});

const assetEntrySchema = z.looseObject({
  /** Per-tier file names (or `*` for every tier); the loader never derives names. */
  file: z.partialRecord(z.enum([...tierSchema.options, '*']), z.string().min(1)),
  mesh: z.string().optional(),
  bounds: z.tuple([z.number(), z.number(), z.number()]).optional(),
  source: z.looseObject({ pack: z.string(), version: z.string(), path: z.string() }).optional(),
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

const lockAssetIdSchema = z.string().regex(
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
