import { z } from 'zod';

import { Id, IsoTime } from './api.js';

const shortText = z.string().trim().min(1).max(200);

/**
 * The audio direction a creator picks instead of packs (#357): a style/genre axis and a mood axis, both optional so a
 * creator can name only the one they care about, plus free text for a direction the vocabulary does not hold. It is a
 * direction, never pack ids: `gm-audio` reads it and pulls tracks and effects across every pack whose cards match.
 * At least one axis or `other` should be present; `hasAudioDirection` enforces that for the picker and the skill.
 */
export const AudioDirection = z
  .object({
    style: shortText.optional(),
    mood: shortText.optional(),
    other: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const ScopeChoices = z
  .object({
    genre: shortText,
    vibe: shortText,
    family: shortText,
    world: shortText,
    players: z.enum(['single', 'multi']),
    pov: shortText,
    audio: AudioDirection.optional(),
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
    revision: z.number().int().positive().default(1),
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

export const ScopeRevisionRequest = z
  .object({
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const ScopeSession = z
  .object({
    id: Id,
    game_id: Id,
    creator_id: Id,
    job_id: Id,
    ticket: z.string().regex(/^\d+$/).optional(),
    status: z.enum(['open', 'revising', 'agreed', 'abandoned']),
    revision: z.number().int().nonnegative(),
    choices: ScopeChoices,
    scope: AgreedScope.optional(),
    at: IsoTime,
  })
  .strict();

export type ScopeChoices = z.infer<typeof ScopeChoices>;
export type AudioDirection = z.infer<typeof AudioDirection>;

/** True when the direction names at least one axis or a free-text direction; an empty object is not a direction. */
export function hasAudioDirection(direction: AudioDirection | undefined): direction is AudioDirection {
  if (!direction) return false;
  return direction.style !== undefined || direction.mood !== undefined || direction.other !== undefined;
}

/** The direction as one queryable line, for a scope document or a skill prompt: `chiptune, playful`. */
export function audioDirectionText(direction: AudioDirection): string {
  const parts = [direction.style, direction.mood, direction.other].filter(
    (value): value is string => value !== undefined && value !== '',
  );
  return parts.join(', ');
}

export type AgreedScope = z.infer<typeof AgreedScope>;
export type AgreedScopeTicket = z.infer<typeof AgreedScopeTicket>;
export type ScopeRevisionRequest = z.infer<typeof ScopeRevisionRequest>;
export type ScopeSession = z.infer<typeof ScopeSession>;

export const scopeSchemas = {
  'scope.choices.v1': ScopeChoices,
  'scope.agreed.v1': AgreedScope,
  'scope.revision-request.v1': ScopeRevisionRequest,
  'scope.session.v1': ScopeSession,
} satisfies Record<string, z.ZodType>;
