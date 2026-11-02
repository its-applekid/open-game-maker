import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { families, games } from './accounts.js';

export const gameAbuseFlags = sqliteTable(
  'game_abuse_flags',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    flaggedBy: text('flagged_by').notNull(),
    reason: text('reason', { enum: ['spam', 'harmful', 'other'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('game_abuse_flags_family_created').on(table.familyId, table.createdAt),
    index('game_abuse_flags_game_created').on(table.gameId, table.createdAt),
    check('game_abuse_flags_reason_check', sql`${table.reason} IN ('spam', 'harmful', 'other')`),
  ],
);
