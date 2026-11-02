import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { games } from './accounts.js';
import { branches } from './design.js';

export const reapplyReports = sqliteTable(
  'reapply_reports',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    fromBuildId: text('from_build_id').notNull(),
    toBuildId: text('to_build_id').notNull(),
    reportJson: text('report_json').notNull(),
    computedAt: text('computed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.toBuildId] })],
);
