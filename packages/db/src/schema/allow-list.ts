import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The instance sign-in allow list: one row per admitted address (stored lowercase) and the role it
// grants. `added_by` is the admin's user id, or `env` for a row seeded from `OGM_ALLOWED_EMAILS` /
// `OGM_MAINTAINER_EMAILS` on first start. Emails are only stable keys; a row exists before its
// address ever signs in, so there is no foreign key to `user`.
export const allowedUsers = sqliteTable(
  'allowed_users',
  {
    email: text('email').primaryKey(),
    role: text('role', { enum: ['player', 'maker', 'admin'] }).notNull(),
    addedBy: text('added_by').notNull(),
    addedAt: text('added_at').notNull(),
  },
  (table) => [
    index('allowed_users_added_at_index').on(table.addedAt),
    check('allowed_users_role_check', sql`${table.role} IN ('player', 'maker', 'admin')`),
  ],
);
