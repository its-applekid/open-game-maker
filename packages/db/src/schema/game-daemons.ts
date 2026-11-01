import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// OGM-034's GameDaemon record minus the client token, which stays in its 0600 file.
export const gameDaemons = sqliteTable(
  'game_daemons',
  {
    slug: text('slug').primaryKey(),
    repo: text('repo').notNull().unique(),
    checkoutPath: text('checkout_path').notNull(),
    unit: text('unit').notNull(),
    envFile: text('env_file').notNull(),
    port: integer('port').notNull().unique(),
    status: text('status', { enum: ['stopped', 'starting', 'running', 'idle'] }).notNull(),
    lastHealthAt: text('last_health_at'),
    lastError: text('last_error'),
    startedAt: text('started_at'),
    idleSince: text('idle_since'),
    maxConcurrentAgents: integer('max_concurrent_agents').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check('game_daemons_status', sql`${table.status} IN ('stopped', 'starting', 'running', 'idle')`),
    check('game_daemons_max_agents', sql`${table.maxConcurrentAgents} IN (1, 2)`),
  ],
);
