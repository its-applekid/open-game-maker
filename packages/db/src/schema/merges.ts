import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';
import { branches, designTransactions } from './design.js';

export const mergePlans = sqliteTable(
  'merge_plans',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    sourceBranchId: text('source_branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    targetBranchId: text('target_branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    baseRev: integer('base_rev').notNull(),
    targetHeadRev: integer('target_head_rev').notNull(),
    planJson: text('plan_json').notNull(),
    status: text('status', { enum: ['planned', 'resolving', 'previewing', 'landed', 'abandoned'] }).notNull(),
    landedTxId: text('landed_tx_id').references(() => designTransactions.id, { onDelete: 'set null' }),
    rolledBackTxId: text('rolled_back_tx_id').references(() => designTransactions.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('merge_plans_game_id_index').on(table.gameId),
    index('merge_plans_target_branch_id_index').on(table.targetBranchId),
    check('merge_plans_base_rev_check', sql`${table.baseRev} >= 0`),
    check('merge_plans_target_head_rev_check', sql`${table.targetHeadRev} >= 0`),
    check(
      'merge_plans_status_check',
      sql`${table.status} IN ('planned', 'resolving', 'previewing', 'landed', 'abandoned')`,
    ),
    check('merge_plans_distinct_branches_check', sql`${table.sourceBranchId} <> ${table.targetBranchId}`),
  ],
);
