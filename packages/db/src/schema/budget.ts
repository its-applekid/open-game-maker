import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { families } from './accounts.js';
import { jobs } from './jobs.js';

export const familyBudgetSettings = sqliteTable(
  'family_budget_settings',
  {
    familyId: text('family_id')
      .primaryKey()
      .references(() => families.id, { onDelete: 'cascade' }),
    resetZone: text('reset_zone').notNull(),
    unitLabel: text('unit_label').notNull(),
    microUsdPerUnit: integer('micro_usd_per_unit').notNull(),
    platformCapMicroUsd: integer('platform_cap_micro_usd'),
    slotsNewGame: integer('slots_new_game').notNull(),
    slotsEdit: integer('slots_edit').notNull(),
    hardCapMultiplier: real('hard_cap_multiplier').notNull(),
  },
  (table) => [
    check(
      'family_budget_settings_values',
      sql`${table.microUsdPerUnit} > 0 AND (${table.platformCapMicroUsd} IS NULL OR ${table.platformCapMicroUsd} >= 0)`,
    ),
    check(
      'family_budget_settings_slots',
      sql`${table.slotsNewGame} >= 0 AND ${table.slotsEdit} >= 0 AND ${table.hardCapMultiplier} > 0`,
    ),
  ],
);

export const allowances = sqliteTable(
  'allowances',
  {
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    dailyMicroUsd: integer('daily_micro_usd').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.familyId, table.userId] }),
    check('allowances_daily', sql`${table.dailyMicroUsd} >= 0`),
  ],
);

export const budgetLedger = sqliteTable(
  'budget_ledger',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['reservation', 'release', 'usage', 'adjustment'] }).notNull(),
    amountMicroUsd: integer('amount_micro_usd').notNull(),
    aiurRunId: text('aiur_run_id'),
    note: text('note'),
    at: text('at').notNull(),
    dayKey: text('day_key').notNull(),
  },
  (table) => [
    index('budget_ledger_family_day').on(table.familyId, table.dayKey),
    index('budget_ledger_user_day').on(table.familyId, table.userId, table.dayKey),
    index('budget_ledger_job').on(table.jobId),
    uniqueIndex('budget_ledger_usage_run').on(table.jobId, table.kind, table.aiurRunId),
    check('budget_ledger_kind', sql`${table.kind} IN ('reservation', 'release', 'usage', 'adjustment')`),
    check('budget_ledger_amount', sql`${table.amountMicroUsd} >= 0`),
  ],
);

export const sizeClasses = sqliteTable(
  'size_classes',
  {
    kind: text('kind', { enum: ['new_game', 'feature', 'repair'] }).notNull(),
    sizeClass: text('size_class', { enum: ['small', 'medium', 'large', 'huge'] }).notNull(),
    p50MicroUsd: integer('p50_micro_usd').notNull(),
    p80MicroUsd: integer('p80_micro_usd').notNull(),
    samples: integer('samples').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.sizeClass] }),
    check('size_classes_kind', sql`${table.kind} IN ('new_game', 'feature', 'repair')`),
    check('size_classes_size', sql`${table.sizeClass} IN ('small', 'medium', 'large', 'huge')`),
    check(
      'size_classes_amounts',
      sql`${table.p50MicroUsd} >= 0 AND ${table.p80MicroUsd} >= ${table.p50MicroUsd} AND ${table.samples} >= 0`,
    ),
  ],
);
