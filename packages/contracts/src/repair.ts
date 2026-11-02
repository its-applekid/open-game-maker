import { z } from 'zod';

export const RepairConfig = z.strictObject({
  attempts: z.literal(2),
  reservationFraction: z.number().min(0.332).max(0.334),
  wallClockMinutes: z.number().int().positive().max(60),
  pollMs: z.number().int().min(1_000).max(60_000),
});

export const DEFAULT_REPAIR_CONFIG: RepairConfig = Object.freeze({
  attempts: 2,
  reservationFraction: 0.333,
  wallClockMinutes: 10,
  pollMs: 5_000,
});

export type RepairConfig = z.infer<typeof RepairConfig>;
