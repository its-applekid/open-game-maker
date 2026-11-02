import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';

export const achievementDefs = sqliteTable(
  'achievement_defs',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    iconPath: text('icon_path').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull(),
    target: real('target'),
    firstReleaseId: text('first_release_id').notNull(),
    retiredReleaseId: text('retired_release_id'),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.key] }),
    check('achievement_defs_hidden_check', sql`${table.hidden} IN (0, 1)`),
    check('achievement_defs_target_check', sql`${table.target} IS NULL OR ${table.target} > 0`),
  ],
);

// A release snapshot is the awarding authority. Definitions remain normalized above so
// title/icon edits preserve existing awards while old releases keep their exact catalog.
export const achievementCatalogs = sqliteTable(
  'achievement_catalogs',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    releaseId: text('release_id').notNull(),
    defsJson: text('defs_json').notNull(),
    registeredAt: text('registered_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.releaseId] })],
);

export const achievementAwards = sqliteTable(
  'achievement_awards',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    releaseId: text('release_id').notNull(),
    source: text('source', { enum: ['client', 'room', 'admin'] }).notNull(),
    awardedAt: text('awarded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId, table.key] }),
    check('achievement_awards_source_check', sql`${table.source} IN ('client', 'room', 'admin')`),
  ],
);

export const achievementProgress = sqliteTable(
  'achievement_progress',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: real('value').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId, table.key] }),
    check('achievement_progress_value_check', sql`${table.value} >= 0`),
  ],
);

export const achievementAudit = sqliteTable(
  'achievement_audit',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    action: text('action', { enum: ['revoke'] }).notNull(),
    byUserId: text('by_user_id').notNull(),
    at: text('at').notNull(),
  },
  (table) => [check('achievement_audit_action_check', sql`${table.action} = 'revoke'`)],
);
