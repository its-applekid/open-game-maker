import { z } from 'zod';

import { Id, IsoTime } from './api.js';

const shortText = z.string().trim().min(1).max(200);

export const ScopeChoices = z
  .object({
    genre: shortText,
    vibe: shortText,
    family: shortText,
    world: shortText,
    players: z.enum(['single', 'multi']),
    pov: shortText,
    other: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const AgreedScopeTicket = z
  .object({
    key: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    skills: z.array(z.string().trim().min(1).max(120)).max(20),
    dependsOn: z.array(z.string().trim().min(1).max(80)).max(12),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(4000)).min(1).max(20),
  })
  .strict();

export const AgreedScope = z
  .object({
    session_id: Id,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(2000),
    scope: z
      .object({
        included: z.array(z.string().trim().min(1).max(4000)).max(50),
        excluded: z.array(z.string().trim().min(1).max(4000)).max(50),
      })
      .strict(),
    tickets: z.array(AgreedScopeTicket).min(1).max(12),
    complexity: z.number().int().min(1).max(5),
    open_questions: z.array(z.string().trim().min(1).max(2000)).max(50),
    ideas: z.array(z.string().trim().min(1).max(2000)).max(50),
  })
  .strict();

export const ScopeSession = z
  .object({
    id: Id,
    game_id: Id,
    creator_id: Id,
    job_id: Id,
    ticket: z.string().regex(/^\d+$/).optional(),
    status: z.enum(['open', 'agreed', 'abandoned']),
    choices: ScopeChoices,
    scope: AgreedScope.optional(),
    at: IsoTime,
  })
  .strict();

export type ScopeChoices = z.infer<typeof ScopeChoices>;
export type AgreedScope = z.infer<typeof AgreedScope>;
export type AgreedScopeTicket = z.infer<typeof AgreedScopeTicket>;
export type ScopeSession = z.infer<typeof ScopeSession>;

export const scopeSchemas = {
  'scope.choices.v1': ScopeChoices,
  'scope.agreed.v1': AgreedScope,
  'scope.session.v1': ScopeSession,
} satisfies Record<string, z.ZodType>;
