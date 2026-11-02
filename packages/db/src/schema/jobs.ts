import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { families, games } from './accounts.js';

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    branchId: text('branch_id').notNull(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id').notNull(),
    kind: text('kind', { enum: ['new_game', 'feature', 'repair', 'scope'] }).notNull(),
    complexity: integer('complexity').notNull(),
    state: text('state', {
      enum: ['queued', 'admitted', 'filed', 'running', 'paused_budget', 'done', 'failed', 'cancelled'],
    }).notNull(),
    pausedReason: text('paused_reason', { enum: ['over_reservation', 'budget_exhausted', 'admin'] }),
    start: text('start', { enum: ['now', 'at_reset'] }).notNull(),
    startAt: text('start_at'),
    slot: text('slot', { enum: ['new_game', 'edit'] }).notNull(),
    plan: text('plan').notNull(),
    reservation: text('reservation').notNull(),
    hardCapMicroUsd: integer('hard_cap_micro_usd').notNull(),
    usageMicroUsd: integer('usage_micro_usd').notNull().default(0),
    usageCoverage: text('usage_coverage'),
    aiurRunId: text('aiur_run_id'),
    aiurRepo: text('aiur_repo'),
    aiurIssueNumber: integer('aiur_issue_number'),
    aiurSpendCapMicroUsd: integer('aiur_spend_cap_micro_usd'),
    idempotencyKey: text('idempotency_key'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    terminalAt: text('terminal_at'),
    releasedAt: text('released_at'),
  },
  (table) => [
    index('jobs_family_state').on(table.familyId, table.state),
    index('jobs_game_created').on(table.gameId, table.createdAt),
    uniqueIndex('jobs_aiur_ticket').on(table.aiurRepo, table.aiurIssueNumber),
    uniqueIndex('jobs_creator_idempotency').on(table.creatorId, table.idempotencyKey),
    check('jobs_kind', sql`${table.kind} IN ('new_game', 'feature', 'repair', 'scope')`),
    check('jobs_complexity', sql`${table.complexity} BETWEEN 1 AND 5`),
    check(
      'jobs_state',
      sql`${table.state} IN ('queued', 'admitted', 'filed', 'running', 'paused_budget', 'done', 'failed', 'cancelled')`,
    ),
    check(
      'jobs_paused_reason',
      sql`${table.pausedReason} IS NULL OR ${table.pausedReason} IN ('over_reservation', 'budget_exhausted', 'admin')`,
    ),
    check('jobs_start', sql`${table.start} IN ('now', 'at_reset')`),
    check('jobs_slot', sql`${table.slot} IN ('new_game', 'edit')`),
    check('jobs_amounts', sql`${table.hardCapMicroUsd} >= 0 AND ${table.usageMicroUsd} >= 0`),
  ],
);
