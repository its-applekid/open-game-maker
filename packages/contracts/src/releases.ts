import { z } from 'zod';

import {
  EntityOverrideSchema,
  IsoTimeSchema,
  OverrideEntrySchema,
  RevisionSchema,
  Sha256Schema,
  StableIdSchema,
} from './design-log.js';

export const BuildSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  branchId: StableIdSchema,
  gitSha: z.string().regex(/^[0-9a-f]{40}$/),
  jobId: StableIdSchema.optional(),
  sdkVersion: z.string(),
  saveSchemaVersion: z.number().int().nonnegative(),
  migratesFromSchema: z.number().int().nonnegative().optional(),
  achievementCatalogHash: Sha256Schema,
  status: z.enum(['building', 'tested', 'failed']),
  artifact: z.enum(['present', 'gc']),
  createdAt: IsoTimeSchema,
});
export type Build = z.infer<typeof BuildSchema>;

export const OverrideSnapshotSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  branchId: StableIdSchema,
  buildId: StableIdSchema,
  headRev: RevisionSchema,
  sha256: Sha256Schema,
  entries: z.array(OverrideEntrySchema),
  entityOps: z.array(EntityOverrideSchema),
});
export type OverrideSnapshot = z.infer<typeof OverrideSnapshotSchema>;

export const ChangeNoteSchema = z.looseObject({
  jobId: StableIdSchema.optional(),
  txId: StableIdSchema.optional(),
  kind: z.enum(['fix', 'add', 'change', 'remove']),
  text: z.string(),
});
export type ChangeNote = z.infer<typeof ChangeNoteSchema>;

export const ReleaseSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  seq: z.number().int().nonnegative(),
  version: z.string(),
  buildId: StableIdSchema,
  snapshotId: StableIdSchema,
  gitTag: z.string(),
  kind: z.enum(['publish', 'rollback']),
  restoresReleaseId: StableIdSchema.optional(),
  predecessorReleaseId: StableIdSchema.optional(),
  changelog: z.looseObject({ summary: z.string(), items: z.array(ChangeNoteSchema) }),
  publishedBy: StableIdSchema,
  publishedAt: IsoTimeSchema,
});
export type Release = z.infer<typeof ReleaseSchema>;

export const ReleasesFamilySchema = z.looseObject({
  build: BuildSchema,
  overrideSnapshot: OverrideSnapshotSchema,
  release: ReleaseSchema,
  changeNote: ChangeNoteSchema,
});

export const releasesSchemas = {
  'releases.v1': ReleasesFamilySchema,
} satisfies Record<string, z.ZodType>;
