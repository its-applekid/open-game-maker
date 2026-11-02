import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { jobs } from './jobs.js';

export const usageSamples = sqliteTable(
  'usage_samples',
  {
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull(),
    repo: text('repo').notNull(),
    issue: integer('issue').notNull(),
    providerReportedMicro: integer('provider_reported_micro').notNull(),
    apiEquivalentMicro: integer('api_equivalent_micro').notNull(),
    coverageStatus: text('coverage_status').notNull(),
    observedAt: text('observed_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.runId] }),
    check('usage_samples_amounts', sql`${table.providerReportedMicro} >= 0 AND ${table.apiEquivalentMicro} >= 0`),
  ],
);
