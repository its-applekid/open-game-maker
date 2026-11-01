import { z } from 'zod';

import { IsoTime } from './api.js';

// The conversation a browser opens: sent as {"v":1,"type":"start","target":VoiceTarget} on the voice socket.
export const VoiceTarget = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('scope'),
    game_id: z.string().min(1),
    session_id: z.string().min(1),
    creator_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal('build'),
    game_id: z.string().min(1),
    job_id: z.string().min(1),
    ticket: z.string().min(1),
    creator_id: z.string().min(1),
  }),
]);
// POST /api/v1/voice/token { target } → a 300 s `vct1.<payload>.<mac>` token the voice host verifies.
export const VoiceTokenRequest = z.object({ target: VoiceTarget }).strict();
export const VoiceTokenResponse = z.object({
  token: z.string().regex(/^vct1\./),
  expires_at: IsoTime,
  url: z.string().url(),
});
// API → voice host: POST /internal/briefing, keyed "scope:<session_id>" or "build:<job_id>".
export const BriefingPush = z.object({
  target_key: z.string().regex(/^(scope|build):.+$/),
  observed_at: IsoTime,
  summary: z.string().optional(),
  current_task: z.string().optional(),
  next_steps: z.array(z.string()).optional(),
  waiting_on: z.string().optional(),
  questions: z.array(z.string()).optional(),
  extra: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
  sections: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  commands: z
    .array(
      z.object({
        id: z.string(),
        version: z.union([z.string(), z.number()]).optional(),
        question: z.string(),
        options: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
// Voice host → API: POST /internal/voice/instruct once the creator confirms a draft.
export const InstructRequest = z.object({
  target: VoiceTarget,
  text: z.string().min(1).max(4000),
  idempotency_key: z.string().min(1),
  kind: z.enum(['instruct', 'ask']),
});
export const InstructResponse = z.object({ delivery_id: z.string() });

export type VoiceTarget = z.infer<typeof VoiceTarget>;
export type VoiceTokenRequest = z.infer<typeof VoiceTokenRequest>;
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponse>;
export type BriefingPush = z.infer<typeof BriefingPush>;
export type InstructRequest = z.infer<typeof InstructRequest>;
export type InstructResponse = z.infer<typeof InstructResponse>;

export const voiceSchemas = {
  'voice.token.request.v1': VoiceTokenRequest,
  'voice.token.response.v1': VoiceTokenResponse,
  'voice.briefing.push.v1': BriefingPush,
  'voice.instruct.request.v1': InstructRequest,
  'voice.instruct.response.v1': InstructResponse,
} satisfies Record<string, z.ZodType>;
