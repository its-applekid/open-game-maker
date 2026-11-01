import { z } from 'zod';

import { IsoTime } from './api.js';
import { patchSchema } from './bridge.js';
export { patchSchema, type Patch } from './bridge.js';

export const StableIdSchema = z.string().regex(/^(?:[a-z][a-z0-9]*_)?[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
export const RevisionSchema = z.number().int().nonnegative();
export const IsoTimeSchema = IsoTime;
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const EntitySchema = z.looseObject({
  id: StableIdSchema,
  prefab: z.string().min(1),
  level: z.string().min(1),
  origin: z.enum(['build', 'creator']),
  props: z.record(z.string(), z.unknown()),
});
export type Entity = z.infer<typeof EntitySchema>;

const designDocShape = {
  schemaVersion: z.number().int().nonnegative(),
  globals: z.record(z.string(), z.unknown()),
  entities: z.record(z.string(), EntitySchema).superRefine((entities, ctx) => {
    for (const [id, entity] of Object.entries(entities)) {
      if (entity.id !== id) {
        ctx.addIssue({ code: 'custom', path: [id, 'id'], message: 'entity id must match its record key' });
      }
    }
  }),
};

export const DesignDocSchema = z.looseObject(designDocShape);
export const StrictDesignDocSchema = z.strictObject(designDocShape);
export type DesignDoc = z.infer<typeof DesignDocSchema>;

export const EditorCommandSchema = z.discriminatedUnion('op', [
  z.looseObject({
    op: z.literal('set'),
    control: z.string().min(1),
    targets: z.union([z.array(StableIdSchema), z.literal('global')]),
    value: z.unknown(),
  }),
  z.looseObject({
    op: z.literal('invoke'),
    command: z.string().min(1),
    args: z.unknown(),
    targets: z.array(StableIdSchema).optional(),
  }),
  z.looseObject({
    op: z.literal('reset'),
    control: z.string().min(1),
    targets: z.union([z.array(StableIdSchema), z.literal('global')]),
  }),
]);
export type EditorCommand = z.infer<typeof EditorCommandSchema>;

export const TransactionSchema = z.looseObject({
  id: StableIdSchema,
  gameId: StableIdSchema,
  branchId: StableIdSchema,
  rev: RevisionSchema,
  baseRev: RevisionSchema,
  leaseToken: z.number().int().nonnegative(),
  actor: StableIdSchema,
  kind: z.enum(['manual', 'system', 'merge']),
  label: z.string(),
  baseBuildId: StableIdSchema,
  commands: z.array(EditorCommandSchema),
  patches: z.array(patchSchema),
  inverse: z.array(patchSchema),
  createdAt: IsoTimeSchema,
});
export type Transaction = z.infer<typeof TransactionSchema>;

export type OverrideKey = `${string}@${string}`;
export const OverrideKeySchema = z.string().regex(/^[^@]+@[^@]+$/) as z.ZodType<OverrideKey>;

export const OverrideStatusSchema = z.enum(['carried', 'renamed', 'needs_choice', 'conflict', 'dropped']);
export const OverrideReasonSchema = z.enum([
  'value_invalid',
  'control_removed',
  'target_removed',
  'superseded_by_job',
  'builder_changed',
  'migration_failed',
]);

export const OverrideEntrySchema = z.looseObject({
  key: OverrideKeySchema,
  controlId: z.string().min(1),
  targetId: z.union([StableIdSchema, z.literal('global')]),
  value: z.unknown(),
  baseValueAtEdit: z.unknown(),
  txId: StableIdSchema,
  rev: RevisionSchema,
  status: OverrideStatusSchema,
  reason: OverrideReasonSchema.optional(),
});
export type OverrideEntry = z.infer<typeof OverrideEntrySchema>;

export const EntityOverrideSchema = z.discriminatedUnion('kind', [
  z.looseObject({
    kind: z.literal('create'),
    entityId: StableIdSchema,
    parent: z.string().min(1),
    prefab: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
    txId: StableIdSchema,
  }),
  z.looseObject({ kind: z.literal('delete'), entityId: StableIdSchema, txId: StableIdSchema }),
]);
export type EntityOverride = z.infer<typeof EntityOverrideSchema>;

export const WorkingSetSchema = z.looseObject({
  gameId: StableIdSchema,
  branchId: StableIdSchema,
  buildId: StableIdSchema,
  headRev: RevisionSchema,
  entries: z.record(OverrideKeySchema, OverrideEntrySchema),
  entityOps: z.record(z.string(), EntityOverrideSchema),
});
export type WorkingSet = z.infer<typeof WorkingSetSchema>;

export const ReapplyReportSchema = z.looseObject({
  gameId: StableIdSchema,
  branchId: StableIdSchema,
  fromBuildId: StableIdSchema,
  toBuildId: StableIdSchema,
  carried: z.array(OverrideKeySchema),
  renamed: z.array(z.looseObject({ from: OverrideKeySchema, to: OverrideKeySchema })),
  needsChoice: z.array(z.looseObject({ key: OverrideKeySchema, mine: z.unknown(), allowed: z.unknown() })),
  conflicts: z.array(z.looseObject({ key: OverrideKeySchema, mine: z.unknown(), builder: z.unknown() })),
  dropped: z.array(z.looseObject({ key: OverrideKeySchema, reason: OverrideReasonSchema })),
});
export type ReapplyReport = z.infer<typeof ReapplyReportSchema>;

/** One golden family document keeps every public design-log shape in the emitted schema. */
export const DesignLogFamilySchema = z.looseObject({
  designDoc: DesignDocSchema,
  command: EditorCommandSchema,
  transaction: TransactionSchema,
  workingSet: WorkingSetSchema,
  reapplyReport: ReapplyReportSchema,
});

export const designlogSchemas = {
  'design-log.v1': DesignLogFamilySchema,
} satisfies Record<string, z.ZodType>;
export const designLogSchemas = designlogSchemas;
