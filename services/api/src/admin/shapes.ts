import { z } from 'zod';

import { Id, IsoTime, MicroUsd } from '@ogm/contracts';

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

export type MemberRow = z.infer<typeof MemberRow>;
export type BudgetOverview = z.infer<typeof BudgetOverview>;
export type IntakeDrop = z.infer<typeof IntakeDrop>;

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
