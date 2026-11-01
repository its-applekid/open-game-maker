import { z } from 'zod';

import { Id, IsoTime } from './api.js';

// Build chat (D-BUILD-CHAT), transcribed from T06 §4. Agent rows carry the writer's ULID; rows the API mints carry `m_<uuid>`.
export const Ulid = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
export const ChatMessageId = z.union([Id, Ulid]);
export const ChatActor = z.enum(['creator', 'agent', 'system']);
export const ChatKind = z.enum(['text', 'image', 'clip', 'checkpoint', 'progress']);

export const ChatMedia = z.object({
  url: z.string().url(),
  poster: z.string().url().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative().optional(),
});

// `decision_id` is "" until OGM-082 correlates it; `media_id` names a BuildChatMessage.id in the same job.
export const ChatCheckpoint = z.object({
  decision_id: z.string(),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), media_id: z.string().optional() })),
  recommend: z.string().optional(),
  status: z.enum(['open', 'answered', 'moot']),
});

export const BuildChatMessage = z.object({
  id: ChatMessageId,
  job_id: Id,
  at: IsoTime,
  actor: ChatActor,
  kind: ChatKind,
  text: z.string().optional(),
  media: ChatMedia.optional(),
  checkpoint: ChatCheckpoint.optional(),
  aiur: z
    .object({ ticket: z.string(), event_id: z.number().int().optional(), topic: z.string().optional() })
    .optional(),
});

// One line of `<workspace>/.gm/outbox/*.jsonl`, written inside the no-network sandbox and shipped by the API's relay.
// Known types: chat.post (this context), checkpoint.open (OGM-082), scope.agreed (OGM-088), narration.render (OGM-087).
export const AgentOutboxLine = z.object({
  v: z.literal(1),
  id: Ulid,
  job_id: Id,
  at: IsoTime,
  type: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  payload: z.record(z.string(), z.unknown()),
});

// `file` and `poster` are workspace-relative paths inside `.gm/outbox/media/`.
export const ChatPostPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(8000) }),
  z.object({
    kind: z.enum(['image', 'clip']),
    text: z.string().max(8000).optional(),
    file: z.string().min(1).max(512),
    poster: z.string().min(1).max(512).optional(),
  }),
]);

// POST /api/v1/jobs/:jobId/chat. aiur caps an operator message at 8,000 characters.
export const ChatPostBody = z.object({ text: z.string().trim().min(1).max(8000) }).strict();

// GET /api/v1/jobs/:jobId/chat/messages?since=<seq> → rows with seq > since, oldest first; pass `last_seq` back as `since`.
// SSE: GET /api/v1/jobs/:jobId/chat?since=<seq> → "id: <seq>\nevent: message\ndata: <BuildChatMessage JSON>"; Last-Event-ID resumes.
export const ChatSinceQuery = z.object({ since: z.coerce.number().int().nonnegative().default(0) });
export const ChatMessagesPage = z.object({
  messages: z.array(BuildChatMessage),
  last_seq: z.number().int().nonnegative(),
});

export type BuildChatMessage = z.infer<typeof BuildChatMessage>;
export type ChatMedia = z.infer<typeof ChatMedia>;
export type ChatCheckpoint = z.infer<typeof ChatCheckpoint>;
export type AgentOutboxLine = z.infer<typeof AgentOutboxLine>;
export type ChatPostPayload = z.infer<typeof ChatPostPayload>;
export type ChatPostBody = z.infer<typeof ChatPostBody>;
export type ChatMessagesPage = z.infer<typeof ChatMessagesPage>;

export const chatSchemas = {
  'chat.message.v1': BuildChatMessage,
  'chat.outbox-line.v1': AgentOutboxLine,
  'chat.post-payload.v1': ChatPostPayload,
  'chat.post.v1': ChatPostBody,
  'chat.messages.v1': ChatMessagesPage,
} satisfies Record<string, z.ZodType>;
