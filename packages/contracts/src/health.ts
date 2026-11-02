import { z } from 'zod';

export const HealthResponse = z
  .object({
    ok: z.literal(true),
    service: z.string().min(1),
    version: z.string().min(1),
    uptimeSec: z.number().int().nonnegative(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponse>;

export const schemas = {
  'health.v1': HealthResponse,
} satisfies Record<'health.v1', z.ZodType>;
