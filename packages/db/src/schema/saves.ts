import { sql } from 'drizzle-orm';
import { blob, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';

export const saveSlots = sqliteTable(
  'save_slots',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    slotId: text('slot_id', { enum: ['auto', '1', '2', '3'] }).notNull(),
    kind: text('kind', { enum: ['auto', 'manual'] }).notNull(),
    label: text('label'),
    headRevision: integer('head_revision').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId, table.slotId] }),
    index('save_slots_game_user_index').on(table.gameId, table.userId),
    check('save_slots_slot_check', sql`${table.slotId} IN ('auto', '1', '2', '3')`),
    check('save_slots_kind_check', sql`${table.kind} IN ('auto', 'manual')`),
    check('save_slots_head_revision_check', sql`${table.headRevision} >= 0`),
  ],
);

export const saveRevisions = sqliteTable(
  'save_revisions',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    slotId: text('slot_id').notNull(),
    revision: integer('revision').notNull(),
    branchId: text('branch_id').notNull(),
    buildId: text('build_id').notNull(),
    releaseId: text('release_id'),
    saveSchemaVersion: integer('save_schema_version').notNull(),
    payload: blob('payload', { mode: 'buffer' }).notNull(),
    sha256: text('sha256').notNull(),
    deviceId: text('device_id').notNull(),
    clientSeq: integer('client_seq').notNull(),
    reason: text('reason', {
      enum: ['pause', 'checkpoint', 'interval', 'hidden', 'manual', 'migration', 'update'],
    }).notNull(),
    migratedFromRevision: integer('migrated_from_revision'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId, table.slotId, table.revision] }),
    uniqueIndex('save_revisions_idempotency_unique').on(
      table.userId,
      table.gameId,
      table.slotId,
      table.deviceId,
      table.clientSeq,
    ),
    index('save_revisions_slot_created_index').on(table.userId, table.gameId, table.slotId, table.revision),
    check('save_revisions_revision_check', sql`${table.revision} > 0`),
    check('save_revisions_schema_check', sql`${table.saveSchemaVersion} >= 0`),
    check('save_revisions_client_seq_check', sql`${table.clientSeq} >= 0`),
    check(
      'save_revisions_reason_check',
      sql`${table.reason} IN ('pause', 'checkpoint', 'interval', 'hidden', 'manual', 'migration', 'update')`,
    ),
  ],
);

export const playLeases = sqliteTable(
  'play_leases',
  {
    userId: text('user_id').notNull(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    tabId: text('tab_id').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.gameId] }),
    index('play_leases_expiry_index').on(table.expiresAt),
  ],
);
