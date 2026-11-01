import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    releaseId: text('release_id'),
    buildHash: text('build_hash').notNull(),
    text: text('text'),
    errorJson: text('error_json'),
    signature: text('signature').notNull(),
    platformSignature: text('platform_signature'),
    route: text('route', { enum: ['game_repair', 'platform', 'editor_hint', 'stored'] }).notNull(),
    reproduction: text('reproduction', {
      enum: ['crash_with_error', 'wrong_behaviour', 'not_reproducible'],
    }).notNull(),
    jobId: text('job_id'),
    bundleKey: text('bundle_key'),
    reporterId: text('reporter_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reports_game_created').on(table.gameId, table.createdAt),
    index('reports_signature').on(table.signature),
    index('reports_platform_signature').on(table.platformSignature),
    check('reports_route', sql`${table.route} IN ('game_repair', 'platform', 'editor_hint', 'stored')`),
    check(
      'reports_reproduction',
      sql`${table.reproduction} IN ('crash_with_error', 'wrong_behaviour', 'not_reproducible')`,
    ),
    check('reports_text_length', sql`${table.text} IS NULL OR length(${table.text}) <= 2000`),
  ],
);

export const reportSignatures = sqliteTable(
  'report_signatures',
  {
    signature: text('signature').primaryKey(),
    scope: text('scope', { enum: ['game', 'platform'] }).notNull(),
    gameId: text('game_id').references(() => games.id, { onDelete: 'cascade' }),
    count: integer('count').notNull().default(0),
    firstAt: text('first_at').notNull(),
    lastAt: text('last_at').notNull(),
    openJobId: text('open_job_id'),
    platformRef: text('platform_ref'),
    status: text('status', { enum: ['open', 'repaired', 'closed'] }).notNull(),
  },
  (table) => [
    check('report_signatures_scope', sql`${table.scope} IN ('game', 'platform')`),
    check('report_signatures_status', sql`${table.status} IN ('open', 'repaired', 'closed')`),
    check('report_signatures_count', sql`${table.count} >= 0`),
  ],
);

export const platformIssueQueue = sqliteTable(
  'platform_issue_queue',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    labelsJson: text('labels_json').notNull(),
    status: text('status', { enum: ['pending', 'filed', 'dismissed'] }).notNull(),
    ref: text('ref'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('platform_issue_queue_status').on(table.status, table.createdAt),
    check('platform_issue_queue_status_check', sql`${table.status} IN ('pending', 'filed', 'dismissed')`),
  ],
);
