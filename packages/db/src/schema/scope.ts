import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    status: text('status', { enum: ['open', 'agreed', 'abandoned'] }).notNull(),
    choices: text('choices').notNull(),
    scope: text('scope'),
    scopeHash: text('scope_hash'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('scope_sessions_job_unique').on(table.jobId),
    uniqueIndex('scope_sessions_game_open_unique')
      .on(table.gameId)
      .where(sql`${table.status} = 'open'`),
    index('scope_sessions_game_created').on(table.gameId, table.createdAt),
    check('scope_sessions_status', sql`${table.status} IN ('open', 'agreed', 'abandoned')`),
    check(
      'scope_sessions_agreed_payload',
      sql`(${table.status} = 'agreed' AND ${table.scope} IS NOT NULL AND ${table.scopeHash} IS NOT NULL) OR (${table.status} != 'agreed')`,
    ),
  ],
);
