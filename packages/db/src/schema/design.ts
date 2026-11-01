import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';

export const branches = sqliteTable(
  'branches',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gitRef: text('git_ref').notNull(),
    forkParentBranchId: text('fork_parent_branch_id'),
    forkParentRev: integer('fork_parent_rev'),
    forkGitSha: text('fork_git_sha'),
    headRev: integer('head_rev').notNull().default(0),
    latestBuildId: text('latest_build_id'),
    status: text('status', { enum: ['active', 'archived', 'merged'] }).notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('branches_game_name_unique').on(table.gameId, table.name),
    index('branches_game_id_index').on(table.gameId),
    check('branches_head_rev_check', sql`${table.headRev} >= 0`),
    check('branches_status_check', sql`${table.status} IN ('active', 'archived', 'merged')`),
    check(
      'branches_fork_point_check',
      sql`(${table.forkParentBranchId} IS NULL AND ${table.forkParentRev} IS NULL AND ${table.forkGitSha} IS NULL) OR (${table.forkParentBranchId} IS NOT NULL AND ${table.forkParentRev} >= 0 AND ${table.forkGitSha} IS NOT NULL)`,
    ),
  ],
);

export const designTransactions = sqliteTable(
  'design_transactions',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    rev: integer('rev').notNull(),
    baseRev: integer('base_rev').notNull(),
    leaseToken: integer('lease_token').notNull(),
    actor: text('actor').notNull(),
    kind: text('kind', { enum: ['manual', 'system', 'merge'] }).notNull(),
    label: text('label').notNull(),
    baseBuildId: text('base_build_id').notNull(),
    commandsJson: text('commands_json').notNull(),
    patchesJson: text('patches_json').notNull(),
    inverseJson: text('inverse_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('design_transactions_branch_rev_unique').on(table.branchId, table.rev),
    index('design_transactions_game_branch_index').on(table.gameId, table.branchId),
    check('design_transactions_rev_check', sql`${table.rev} > 0`),
    check('design_transactions_base_rev_check', sql`${table.baseRev} >= 0`),
    check('design_transactions_lease_token_check', sql`${table.leaseToken} >= 0`),
    check('design_transactions_kind_check', sql`${table.kind} IN ('manual', 'system', 'merge')`),
  ],
);

export const editLeases = sqliteTable(
  'edit_leases',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    holderUserId: text('holder_user_id').notNull(),
    sessionId: text('session_id').notNull(),
    token: integer('token').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.branchId] }),
    check('edit_leases_token_check', sql`${table.token} > 0`),
  ],
);
