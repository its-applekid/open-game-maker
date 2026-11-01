import { z } from 'zod';

import { JobKind } from './jobs.js';

// T02 §4 after_create contract: what a game repo's hook writes to `.gm/context/bundle.json` (OGM-036).
// Never tokens, keys, cookies, email addresses or the creator's name.
export const JobBundle = z
  .object({
    v: z.literal(1),
    jobId: z.string().min(1),
    gameId: z.string().min(1),
    repo: z.string().min(1),
    kind: JobKind,
    skillPackVersion: z.string().min(1),
    // Loopback URL of the pack tarball, fetched with the same hook bearer.
    skillPackUrl: z.string().url(),
    gameContext: z
      .object({
        title: z.string(),
        family: z.string(),
        pov: z.string(),
        genre: z.string(),
        multiplayer: z.boolean(),
        branch: z.literal('main'),
        lockfilePath: z.literal('assets.lock.json'),
      })
      .strict(),
    // Private bucket key; gm-repair fetches it through `gm`.
    diagnostics: z
      .object({ reportId: z.string().min(1), bundleKey: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

export type JobBundle = z.infer<typeof JobBundle>;
