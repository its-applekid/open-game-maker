import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';
import { jobs } from './jobs.js';

export const scopeSessions = sqliteTable(
  'scope_sessions',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    ticket: text('ticket'),
    status: text('status', { enum: ['open', 'revising', 'agreed', 'abandoned'] }).notNull(),
    revision: integer('revision').notNull().default(0),
    choices: text('choices').notNull(),
    scope: text('scope'),
    scopeHash: text('scope_hash'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('scope_sessions_job_unique').on(table.jobId),
    uniqueIndex('scope_sessions_game_active_unique')
      .on(table.gameId)
      .where(sql`${table.status} IN ('open', 'revising')`),
    index('scope_sessions_game_created').on(table.gameId, table.createdAt),
    check('scope_sessions_status', sql`${table.status} IN ('open', 'revising', 'agreed', 'abandoned')`),
    check('scope_sessions_revision', sql`${table.revision} >= 0`),
    check(
      'scope_sessions_agreed_payload',
      sql`(${table.revision} = 0 AND ${table.scope} IS NULL AND ${table.scopeHash} IS NULL) OR (${table.revision} > 0 AND ${table.scope} IS NOT NULL AND ${table.scopeHash} IS NOT NULL)`,
    ),
    check(
      'scope_sessions_state_revision',
      sql`(${table.status} = 'open' AND ${table.revision} = 0) OR (${table.status} IN ('agreed', 'revising') AND ${table.revision} > 0) OR ${table.status} = 'abandoned'`,
    ),
  ],
);

export const scopeSessionRevisions = sqliteTable(
  'scope_session_revisions',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => scopeSessions.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    scope: text('scope').notNull(),
    scopeHash: text('scope_hash').notNull(),
    agreedAt: text('agreed_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.revision] }),
    index('scope_session_revisions_agreed').on(table.sessionId, table.agreedAt),
    check('scope_session_revisions_positive', sql`${table.revision} > 0`),
  ],
);
