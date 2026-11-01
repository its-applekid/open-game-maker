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

/* Plain strings until OGM-066 / OGM-004 narrow them. */
export const styleFamilyIdSchema = z.string().min(1);
export const povIdSchema = z.string().min(1);
export const useSchema = z.string().min(1);

/** T05 §4 `assets.lock.json`: committed, the source of truth for rights. */
export const assetsLockSchema = z.looseObject({
  version: z.literal(1),
  family: styleFamilyIdSchema,
  pov: povIdSchema,
  assets: z.array(
    z.looseObject({
      id: z.string().min(1),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      path: z.string().min(1),
      license: z.string().min(1),
      rights: z.looseObject({
        uses: z.array(useSchema),
        audience: z.enum(['private', 'public']),
        redistribution: z.enum(['none', 'in-build', 'free']),
        attribution: z.string().nullable(),
      }),
      derived_from: z.array(z.string()).optional(),
      added: z.string().min(1),
    }),
  ),
});
export type AssetsLock = z.infer<typeof assetsLockSchema>;

export const assetsSchemas = {
  'assets.v1': assetManifestSchema,
  'assets-lock.v1': assetsLockSchema,
} satisfies Record<'assets.v1' | 'assets-lock.v1', z.ZodType>;
