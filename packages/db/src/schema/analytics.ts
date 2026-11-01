import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const activities = [
  'asset_pipeline',
  'level_building',
  'gameplay_code',
  'animation_vfx',
  'audio',
  'ui_hud',
  'playtesting',
  'deploy_release',
  'writing',
] as const;

export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    receivedAt: text('received_at').notNull(),
    familyId: text('family_id').notNull(),
    gameId: text('game_id').notNull(),
    jobId: text('job_id'),
    aiurRunId: text('aiur_run_id'),
    attemptId: text('attempt_id'),
    actor: text('actor', { enum: ['agent', 'human'] }).notNull(),
    activity: text('activity', { enum: activities }).notNull(),
    boundary: text('boundary', { enum: ['start', 'end', 'point'] }).notNull(),
    source: text('source', { enum: ['gm_cli', 'skill', 'editor', 'sdk', 'manifest_path'] }).notNull(),
    metaJson: text('meta_json').notNull(),
    principalKind: text('principal_kind', { enum: ['job', 'user'] }).notNull(),
    principalId: text('principal_id').notNull(),
  },
  (table) => [
    index('activity_events_job_ts_idx').on(table.jobId, table.ts),
    index('activity_events_game_ts_idx').on(table.gameId, table.ts),
    index('activity_events_family_ts_idx').on(table.familyId, table.ts),
    check('activity_events_actor_check', sql`${table.actor} IN ('agent', 'human')`),
    check(
      'activity_events_activity_check',
      sql`${table.activity} IN (${sql.join(
        activities.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check('activity_events_boundary_check', sql`${table.boundary} IN ('start', 'end', 'point')`),
    check(
      'activity_events_source_check',
      sql`${table.source} IN ('gm_cli', 'skill', 'editor', 'sdk', 'manifest_path')`,
    ),
    check('activity_events_principal_kind_check', sql`${table.principalKind} IN ('job', 'user')`),
  ],
);

export const aiurPhaseEvents = sqliteTable(
  'aiur_phase_events',
  {
    jobId: text('job_id').notNull(),
    phase: text('phase', { enum: ['brainstorm', 'plan', 'work', 'review'] }).notNull(),
    transition: text('transition'),
    at: text('at').notNull(),
    source: text('source', { enum: ['events_feed', 'progress_poll'] }).notNull(),
  },
  (table) => [
    uniqueIndex('aiur_phase_events_job_phase_at_idx').on(table.jobId, table.phase, table.at),
    check('aiur_phase_events_phase_check', sql`${table.phase} IN ('brainstorm', 'plan', 'work', 'review')`),
    check('aiur_phase_events_source_check', sql`${table.source} IN ('events_feed', 'progress_poll')`),
  ],
);
