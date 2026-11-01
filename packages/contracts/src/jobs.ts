import { z } from 'zod';

import { Id, IsoTime, MicroUsd } from './api.js';

export const JobKind = z.enum(['new_game', 'feature', 'repair']);
export const JobState = z.enum([
  'queued',
  'admitted',
  'filed',
  'running',
  'paused_budget',
  'done',
  'failed',
  'cancelled',
]);
export const JobSlot = z.enum(['new_game', 'edit']); // repairs take 'edit'
export const SizeClass = z.enum(['small', 'medium', 'large', 'huge']);
export const Confidence = z.enum(['low', 'medium', 'high']);
export const JobPlan = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(4000),
  scope: z.object({ included: z.array(z.string()), excluded: z.array(z.string()) }),
  tickets: z
    .array(
      z.object({
        key: z.string(),
        skills: z.array(z.string()),
        dependsOn: z.array(z.string()),
        acceptanceCriteria: z.array(z.string()),
      }),
    )
    .min(1)
    .max(12),
});
export const Reservation = z.object({ amountMicroUsd: MicroUsd, sizeClass: SizeClass, confidence: Confidence });
export const CreateJobRequest = z.object({
  gameId: Id,
  branchId: z.string().default('main'),
  kind: JobKind,
  complexity: z.number().int().min(1).max(5),
  plan: JobPlan,
  start: z.enum(['now', 'at_reset']).default('now'),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export const CreateJobAccepted = z.object({
  jobId: Id,
  state: z.enum(['queued', 'admitted']),
  reservation: Reservation,
  slot: JobSlot,
  position: z.number().int().nonnegative().optional(),
});
export const AllowanceExceeded = z.object({
  error: z.enum(['allowance_exceeded', 'platform_cap_reached']),
  remainingMicroUsd: MicroUsd,
  resetsAt: IsoTime,
  offers: z.array(z.enum(['trim', 'split', 'queue', 'ask_admin'])),
});
export const Job = z.object({
  id: Id,
  gameId: Id,
  branchId: z.string(),
  familyId: Id,
  creatorId: Id,
  kind: JobKind,
  complexity: z.number().int(),
  state: JobState,
  pausedReason: z.enum(['over_reservation', 'budget_exhausted', 'admin']).nullable(),
  start: z.enum(['now', 'at_reset']),
  startAt: IsoTime.nullable(),
  slot: JobSlot,
  plan: JobPlan,
  reservation: Reservation,
  hardCapMicroUsd: MicroUsd,
  usageMicroUsd: MicroUsd,
  aiurRepo: z.string().nullable(),
  aiurIssueNumber: z.number().int().nullable(),
  aiurSpendCapMicroUsd: MicroUsd.nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: IsoTime,
  updatedAt: IsoTime,
  terminalAt: IsoTime.nullable(),
});
export const JobStage = z.enum([
  'waiting_capacity',
  'building',
  'final_tests',
  'fixing',
  'ready',
  'out_of_budget',
  'failed',
]); // R27 creator words; OGM-032 maps
export const JobTokenClaims = z.object({ jobId: Id, gameId: Id, familyId: Id, exp: z.number().int() }); // bearer "gmj1.<b64url json>.<b64url hmac>"

export type JobKind = z.infer<typeof JobKind>;
export type JobState = z.infer<typeof JobState>;
export type JobSlot = z.infer<typeof JobSlot>;
export type SizeClass = z.infer<typeof SizeClass>;
export type Confidence = z.infer<typeof Confidence>;
export type JobPlan = z.infer<typeof JobPlan>;
export type Reservation = z.infer<typeof Reservation>;
export type CreateJobRequest = z.infer<typeof CreateJobRequest>;
export type CreateJobAccepted = z.infer<typeof CreateJobAccepted>;
export type AllowanceExceeded = z.infer<typeof AllowanceExceeded>;
export type Job = z.infer<typeof Job>;
export type JobStage = z.infer<typeof JobStage>;
export type JobTokenClaims = z.infer<typeof JobTokenClaims>;

export const jobsSchemas = {
  'jobs.create-job.request.v1': CreateJobRequest,
  'jobs.create-job.accepted.v1': CreateJobAccepted,
  'jobs.create-job.402.v1': AllowanceExceeded,
  'jobs.job.v1': Job,
  'jobs.token-claims.v1': JobTokenClaims,
} satisfies Record<string, z.ZodType>;
