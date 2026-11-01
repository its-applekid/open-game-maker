import { z } from 'zod';

export const HealthResponse = z
  .object({
    ok: z.literal(true),
    service: z.string().min(1),
    version: z.string().min(1),
    uptimeSec: z.number().int().nonnegative(),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponse>;

export const healthSchemas = {
  'health.v1': HealthResponse,
} satisfies Record<'health.v1', z.ZodType>;
