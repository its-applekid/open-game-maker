import { z } from 'zod';

export const Id = z.string().regex(/^[a-z]{1,3}_[0-9a-f-]{36}$/); // <prefix>_<uuid v4>: u_ f_ g_ j_ r_ n_ i_
export const MicroUsd = z.number().int().nonnegative(); // api-equivalent micro-dollars (D-BUDGET-UNIT)
export const IsoTime = z.string().datetime({ offset: true });
export const ApiError = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export type Id = z.infer<typeof Id>;
export type MicroUsd = z.infer<typeof MicroUsd>;
export type IsoTime = z.infer<typeof IsoTime>;
export type ApiError = z.infer<typeof ApiError>;

export type Principal =
  | {
      kind: 'user';
      userId: string;
      familyId: string;
      platformRole: 'maintainer' | 'admin' | 'none';
      capability: 'creator' | 'player';
    }
  | { kind: 'job'; jobId: string; gameId: string; familyId: string }
  | { kind: 'service'; service: 'intake' | 'voice-host' | 'commit' | 'builder' | 'rooms' }
  | { kind: 'anonymous' };

export const apiSchemas = {
  'api.error.v1': ApiError,
} satisfies Record<string, z.ZodType>;
