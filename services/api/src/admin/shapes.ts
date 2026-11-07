import { z } from 'zod';

import { Id, IsoTime, JobKind, JobStage, JobState, MicroUsd } from '@ogm/contracts';

// Response shapes of `/api/v1/admin/*`; only the admin screens (OGM-079) read them.
export const MemberRow = z.object({
  userId: Id,
  email: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  capability: z.enum(['creator', 'player']),
  joinedAt: IsoTime,
  dailyMicroUsd: MicroUsd,
  remainingMicroUsd: MicroUsd,
});
export const BudgetOverview = z.object({
  familyDayMicroUsd: MicroUsd,
  platformCapMicroUsd: MicroUsd,
  resetsAt: IsoTime,
  unitLabel: z.string(),
  microUsdPerUnit: MicroUsd,
  slots: z.object({ new_game: z.number().int(), edit: z.number().int() }),
  inUse: z.object({ new_game: z.number().int(), edit: z.number().int() }),
  queued: z.array(Id),
  members: z.array(MemberRow),
});
export const IntakeDrop = z.object({
  dropId: z.string(),
  name: z.string(),
  time: IsoTime,
  status: z.enum(['queued', 'imported', 'awaiting-license', 'blocked', 'duplicate']),
  collection: z.string().nullable(),
  license: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  date: z.string().nullable(),
  problems: z.number().int(),
});
export const AbuseFlagReason = z.enum(['spam', 'harmful', 'other']);
export const GameAbuseFlag = z.object({
  id: Id,
  gameId: Id,
  reason: AbuseFlagReason,
  createdAt: IsoTime,
});
// One row of `GET /admin/builds`: no plan, prompt or source text.
export const AdminBuild = z.object({
  job: z.object({
    id: Id,
    kind: JobKind,
    state: JobState,
    pausedReason: z.enum(['over_reservation', 'budget_exhausted', 'admin']).nullable(),
    stage: JobStage.nullable(),
    stageText: z.string().nullable(),
    usageMicroUsd: MicroUsd,
    hardCapMicroUsd: MicroUsd,
    createdAt: IsoTime,
    updatedAt: IsoTime,
    terminalAt: IsoTime.nullable(),
  }),
  game: z.object({
    id: Id,
    title: z.string(),
    ownerId: Id,
    visibility: z.enum(['listed', 'private']),
    delistedAt: IsoTime.nullable(),
  }),
  member: z.object({ userId: Id, email: z.string().nullable() }),
  retries: z.number().int(),
});

export type MemberRow = z.infer<typeof MemberRow>;
export type BudgetOverview = z.infer<typeof BudgetOverview>;
export type IntakeDrop = z.infer<typeof IntakeDrop>;
export type GameAbuseFlag = z.infer<typeof GameAbuseFlag>;
export type AdminBuild = z.infer<typeof AdminBuild>;

const SLOTS_MAX = 8;
const slotCount = z.number().int().min(0).max(SLOTS_MAX);
// `Intl.supportedValuesOf` lists canonical zones only, so `UTC` is allowed by name.
const timeZone = z
  .string()
  .refine((zone) => zone === 'UTC' || Intl.supportedValuesOf('timeZone').includes(zone), 'unknown time zone');

export const PatchMemberBody = z
  .object({ role: z.enum(['admin', 'member']).optional(), capability: z.enum(['creator', 'player']).optional() })
  .strict()
  .refine((body) => body.role !== undefined || body.capability !== undefined, { message: 'no changes' });
export const PatchSettingsBody = z
  .object({
    friendsAllowed: z.boolean().optional(),
    resetZone: timeZone.optional(),
    unitLabel: z.string().trim().min(1).max(24).optional(),
    microUsdPerUnit: MicroUsd.min(1).optional(),
    platformCapMicroUsd: MicroUsd.optional(),
    slots: z.object({ new_game: slotCount.optional(), edit: slotCount.optional() }).strict().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'no changes' });
export const PutAllowanceBody = z.object({ dailyMicroUsd: MicroUsd }).strict();
export const FlagGameAbuseBody = z.object({ reason: AbuseFlagReason }).strict();
// Registering a game whose repository already exists: the row names the repository and the game's folder in it, and
// the register path writes no repository and no folder. The daemon block is the game's link to the aiur instance
// already building that repository — its port and its checkout, and optionally its systemd unit and env file, which
// default to the builder's own `ogm-aiur@<repository>` convention. `ownerId` defaults to the admin who registers it.
export const RegisterGameBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    // A user id as the app stores it (`u_<uuid>`); not `Id` because the family's own member ids are what the route
    // looks up and an unknown one must be a 404 from that lookup, not a 400 from the body.
    ownerId: z.string().trim().min(1).max(64).optional(),
    repo: z
      .object({
        owner: z.string().trim().min(1).max(100),
        name: z.string().trim().min(1).max(100),
        path: z.string().trim().min(1).max(200),
      })
      .strict(),
    daemon: z
      .object({
        port: z.number().int().min(1).max(65_535),
        checkoutPath: z.string().trim().min(1).max(4096),
        unit: z.string().trim().min(1).max(200).optional(),
        envFile: z.string().trim().min(1).max(4096).optional(),
        status: z.enum(['stopped', 'starting', 'running', 'idle']).optional(),
      })
      .strict(),
    visibility: z.enum(['listed', 'private']).optional(),
    repoVisibility: z.enum(['public', 'private']).optional(),
  })
  .strict();
