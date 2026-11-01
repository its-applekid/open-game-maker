import { z } from 'zod';

import { Id, IsoTime, MicroUsd } from './api.js';

export const Activity = z.enum([
  'asset_pipeline',
  'level_building',
  'gameplay_code',
  'animation_vfx',
  'audio',
  'ui_hud',
  'playtesting',
  'deploy_release',
  'writing',
]);
export const ALLOWED_META_KEYS = ['command', 'system', 'path', 'count', 'durationMs', 'result'] as const;
export const ActivityMeta = z
  .object({
    command: z.string().max(120),
    system: z.string().max(60),
    path: z.string().max(200),
    count: z.number().int(),
    durationMs: z.number().int(),
    result: z.enum(['ok', 'fail']),
  })
  .partial()
  .strict();
export const ActivityEvent = z.object({
  ts: IsoTime,
  gameId: Id,
  jobId: Id.optional(),
  aiurRunId: z.string().max(80).optional(),
  attemptId: z.string().max(80).optional(),
  actor: z.enum(['agent', 'human']),
  activity: Activity,
  boundary: z.enum(['start', 'end', 'point']),
  source: z.enum(['gm_cli', 'skill', 'editor', 'sdk', 'manifest_path']),
  meta: ActivityMeta.default({}),
});
export const IngestRequest = z.object({ events: z.array(ActivityEvent).min(1).max(500) });
export const IngestResponse = z.object({
  accepted: z.number().int(),
  rejected: z.array(z.object({ index: z.number().int(), reason: z.string() })),
});
export const AiurPhase = z.enum(['brainstorm', 'plan', 'work', 'review']);
export const BuildTimeline = z.object({
  jobId: Id,
  aiur: z.object({
    phases: z.array(z.object({ phase: AiurPhase, at: IsoTime, transition: z.string().optional() })),
    usageMicroUsd: MicroUsd.nullable(),
    retries: z.number().int().nullable(),
  }),
  activities: z.array(
    z.object({
      activity: Activity,
      actor: z.enum(['agent', 'human']),
      source: ActivityEvent.shape.source,
      startedAt: IsoTime,
      endedAt: IsoTime.nullable(),
      meta: ActivityMeta,
    }),
  ),
  generatedAt: IsoTime,
});
export const Rollup = z.object({
  scope: z.enum(['game', 'member']),
  id: Id,
  from: IsoTime,
  to: IsoTime,
  builds: z.number().int(),
  usageMicroUsd: MicroUsd.nullable(),
  byActivity: z.record(Activity, z.object({ count: z.number().int(), durationMs: z.number().int() })),
});

export type Activity = z.infer<typeof Activity>;
export type ActivityMeta = z.infer<typeof ActivityMeta>;
export type ActivityEvent = z.infer<typeof ActivityEvent>;
export type IngestRequest = z.infer<typeof IngestRequest>;
export type IngestResponse = z.infer<typeof IngestResponse>;
export type AiurPhase = z.infer<typeof AiurPhase>;
export type BuildTimeline = z.infer<typeof BuildTimeline>;
export type Rollup = z.infer<typeof Rollup>;

export const analyticsSchemas = {
  'analytics.ingest.request.v1': IngestRequest,
  'analytics.ingest.response.v1': IngestResponse,
  'analytics.timeline.v1': BuildTimeline,
  'analytics.rollup.v1': Rollup,
} satisfies Record<string, z.ZodType>;
