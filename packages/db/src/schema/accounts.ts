import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () => text('created_at').notNull();

export const families = sqliteTable(
  'families',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    friendsAllowed: integer('friends_allowed', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('families_owner_user_id_unique').on(table.ownerUserId),
    check('families_friends_allowed_check', sql`${table.friendsAllowed} IN (0, 1)`),
  ],
);

export const familyMembers = sqliteTable(
  'family_members',
  {
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    capability: text('capability', { enum: ['creator', 'player'] }).notNull(),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.familyId, table.userId] }),
    uniqueIndex('family_members_user_id_unique').on(table.userId),
    check('family_members_role_check', sql`${table.role} IN ('owner', 'admin', 'member')`),
    check('family_members_capability_check', sql`${table.capability} IN ('creator', 'player')`),
  ],
);

export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    title: text('title').notNull(),
    visibility: text('visibility', { enum: ['listed', 'private'] }).notNull(),
    githubOwner: text('github_owner'),
    githubRepo: text('github_repo'),
    repoVisibility: text('repo_visibility', { enum: ['public', 'private'] }).notNull(),
    repoUrl: text('repo_url'),
    createdAt: createdAt(),
    delistedAt: text('delisted_at'),
  },
  (table) => [
    index('games_family_id_index').on(table.familyId),
    index('games_owner_id_index').on(table.ownerId),
    check('games_visibility_check', sql`${table.visibility} IN ('listed', 'private')`),
    check('games_repo_visibility_check', sql`${table.repoVisibility} IN ('public', 'private')`),
  ],
);

export const githubConnections = sqliteTable('github_connections', {
  userId: text('user_id').primaryKey(),
  login: text('login').notNull(),
  installationId: text('installation_id').notNull(),
  connectedAt: text('connected_at').notNull(),
});

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['member', 'play', 'room'] }).notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    capability: text('capability', { enum: ['creator', 'player'] }),
    gameId: text('game_id').references(() => games.id, { onDelete: 'cascade' }),
    roomId: text('room_id'),
    inviterId: text('inviter_id').notNull(),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    acceptedBy: text('accepted_by'),
    revokedAt: text('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),
    index('invitations_family_email_index').on(table.familyId, table.email),
    index('invitations_inviter_created_index').on(table.inviterId, table.createdAt),
    check('invitations_kind_check', sql`${table.kind} IN ('member', 'play', 'room')`),
    check(
      'invitations_capability_check',
      sql`${table.capability} IS NULL OR ${table.capability} IN ('creator', 'player')`,
    ),
    check(
      'invitations_target_check',
      sql`(${table.kind} = 'member' AND ${table.capability} IS NOT NULL AND ${table.gameId} IS NULL AND ${table.roomId} IS NULL) OR (${table.kind} = 'play' AND ${table.capability} IS NULL AND ${table.gameId} IS NOT NULL AND ${table.roomId} IS NULL) OR (${table.kind} = 'room' AND ${table.capability} IS NULL AND ${table.gameId} IS NOT NULL AND ${table.roomId} IS NOT NULL)`,
    ),
  ],
);

export const gameGrants = sqliteTable(
  'game_grants',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    sourceInviteId: text('source_invite_id')
      .notNull()
      .references(() => invitations.id),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.userId] }), index('game_grants_user_index').on(table.userId)],
);
