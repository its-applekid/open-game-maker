import { z } from 'zod';

export const RepairConfig = z.strictObject({
  attempts: z.number().int().min(1).max(5),
  reservationFraction: z.number().positive().max(1),
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
