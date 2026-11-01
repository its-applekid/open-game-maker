import { z } from 'zod';

import { IsoTimeSchema, RevisionSchema, StableIdSchema, patchSchema } from './design-log.js';

export const BranchSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  name: z.string().min(1),
  gitRef: z.string().min(1),
  forkPoint: z
    .looseObject({
      parentBranchId: StableIdSchema,
      parentRev: RevisionSchema,
      gitSha: z.string().regex(/^[0-9a-f]{40}$/),
    })
    .nullable(),
  headRev: RevisionSchema,
  latestBuildId: StableIdSchema.nullable(),
  status: z.enum(['active', 'archived', 'merged']),
  createdBy: StableIdSchema,
  createdAt: IsoTimeSchema,
});
export type Branch = z.infer<typeof BranchSchema>;

export const FieldChangeSchema = z.looseObject({
  path: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  txId: StableIdSchema,
});
export type FieldChange = z.infer<typeof FieldChangeSchema>;

export const SideDeltaSchema = z.record(z.string(), z.union([FieldChangeSchema, z.literal('deleted')]));
export type SideDelta = z.infer<typeof SideDeltaSchema>;

const conflictSideSchema = z.union([FieldChangeSchema, z.literal('deleted'), z.literal('removed_by_build')]);
const resolutionSchema = z.union([z.enum(['ours', 'theirs', 'both']), z.looseObject({ value: z.unknown() })]);

export const MergeConflictSchema = z.looseObject({
  id: StableIdSchema,
  path: z.string(),
  entityId: StableIdSchema.optional(),
  controlId: z.string().optional(),
  kind: z.enum(['both_changed', 'delete_vs_edit', 'control_removed']),
  ours: conflictSideSchema,
  theirs: conflictSideSchema,
  resolution: resolutionSchema.optional(),
});
export type MergeConflict = z.infer<typeof MergeConflictSchema>;

export const MergePlanSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  sourceBranchId: StableIdSchema,
  targetBranchId: StableIdSchema,
  baseRev: RevisionSchema,
  auto: z.array(patchSchema),
  conflicts: z.array(MergeConflictSchema),
  code: z.union([z.enum(['clean', 'fast_forward']), z.looseObject({ conflictJobId: StableIdSchema })]),
  previewBuildId: StableIdSchema.optional(),
  status: z.enum(['planned', 'resolving', 'previewing', 'landed', 'abandoned']),
});
export type MergePlan = z.infer<typeof MergePlanSchema>;

export const BranchesFamilySchema = z.looseObject({
  branch: BranchSchema,
  fieldChange: FieldChangeSchema,
  sideDelta: SideDeltaSchema,
  mergeConflict: MergeConflictSchema,
  mergePlan: MergePlanSchema,
});

export const branchesSchemas = {
  'branches.v1': BranchesFamilySchema,
} satisfies Record<string, z.ZodType>;
