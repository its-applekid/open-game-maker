import { sql } from 'drizzle-orm';
import { check, index, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';

const eventNames = [
  'session_start',
  'session_end',
  'active_heartbeat',
  'game_load_failed',
  'error',
  'bug_report',
  'update_offered',
  'update_accepted',
  'save',
  'load',
  'attempt_start',
  'attempt_end',
  'marker',
  'complete',
] as const;

const dailyMetrics = [
  'plays',
  'players',
  'attempts',
  'clears',
  'clear_rate',
  'median_active_sec',
  'completion_rate',
  'marker_reached',
  'marker_first_seen',
  'drop_off',
  'stuck',
  'version_adoption',
  'test_runs',
] as const;

export const creatorAnalyticsEvents = sqliteTable(
  'creator_analytics_events',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    branchId: text('branch_id').notNull(),
    releaseId: text('release_id'),
    env: text('env', { enum: ['draft', 'published'] }).notNull(),
    pseudoUserId: text('pseudo_user_id').notNull(),
    sessionId: text('session_id').notNull(),
    name: text('name', { enum: eventNames }).notNull(),
    scope: text('scope'),
    marker: text('marker'),
    outcome: text('outcome', { enum: ['complete', 'fail', 'quit'] }),
    propsJson: text('props_json').notNull().default('{}'),
  },
  (table) => [
    index('creator_analytics_events_game_ts_idx').on(table.gameId, table.ts),
    index('creator_analytics_events_game_env_release_idx').on(table.gameId, table.env, table.releaseId),
    index('creator_analytics_events_game_pseudo_idx').on(table.gameId, table.pseudoUserId),
    check('creator_analytics_events_env_check', sql`${table.env} IN ('draft', 'published')`),
    check(
      'creator_analytics_events_name_check',
      sql`${table.name} IN (${sql.raw(eventNames.map((name) => `'${name}'`).join(', '))})`,
    ),
    check(
      'creator_analytics_events_outcome_check',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('complete', 'fail', 'quit')`,
    ),
    check(
      'creator_analytics_events_props_check',
      sql`json_valid(${table.propsJson}) AND length(CAST(${table.propsJson} AS BLOB)) <= 1024`,
    ),
  ],
);

// Empty release/scope strings are storage sentinels for aggregate rows. SQLite permits
// duplicate NULLs in a composite key, so nullable columns would make reruns non-idempotent.
export const creatorAnalyticsDaily = sqliteTable(
  'creator_analytics_daily',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    releaseId: text('release_id').notNull().default(''),
    metric: text('metric', { enum: dailyMetrics }).notNull(),
    scope: text('scope').notNull().default(''),
    value: real('value').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.day, table.releaseId, table.metric, table.scope] }),
    index('creator_analytics_daily_game_day_idx').on(table.gameId, table.day),
    check(
      'creator_analytics_daily_metric_check',
      sql`${table.metric} IN (${sql.raw(dailyMetrics.map((metric) => `'${metric}'`).join(', '))})`,
    ),
    check('creator_analytics_daily_value_check', sql`${table.value} >= 0`),
  ],
);

// Old salts stay until the corresponding raw-event retention window closes. That lets
// account deletion derive every still-live pseudonym without storing account ids in events.
export const analyticsSalts = sqliteTable(
  'analytics_salts',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    salt: text('salt').notNull(),
    rotatedAt: text('rotated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.rotatedAt] }),
    uniqueIndex('analytics_salts_game_salt_unique').on(table.gameId, table.salt),
    index('analytics_salts_game_rotated_idx').on(table.gameId, table.rotatedAt),
    check('analytics_salts_hex_check', sql`length(${table.salt}) = 64 AND ${table.salt} NOT GLOB '*[^0-9a-f]*'`),
  ],
);
