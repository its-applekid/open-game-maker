CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`friends_allowed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "families_friends_allowed_check" CHECK("families"."friends_allowed" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `families_owner_user_id_unique` ON `families` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `family_members` (
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`capability` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`family_id`, `user_id`),
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "family_members_role_check" CHECK("family_members"."role" IN ('owner', 'admin', 'member')),
	CONSTRAINT "family_members_capability_check" CHECK("family_members"."capability" IN ('creator', 'player'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_members_user_id_unique` ON `family_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `game_grants` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_invite_id` text NOT NULL,
	PRIMARY KEY(`game_id`, `user_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_invite_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `game_grants_user_index` ON `game_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`visibility` text NOT NULL,
	`github_owner` text,
	`github_repo` text,
	`repo_visibility` text NOT NULL,
	`repo_url` text,
	`created_at` text NOT NULL,
	`delisted_at` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "games_visibility_check" CHECK("games"."visibility" IN ('listed', 'private')),
	CONSTRAINT "games_repo_visibility_check" CHECK("games"."repo_visibility" IN ('public', 'private'))
);
--> statement-breakpoint
CREATE INDEX `games_family_id_index` ON `games` (`family_id`);--> statement-breakpoint
CREATE INDEX `games_owner_id_index` ON `games` (`owner_id`);--> statement-breakpoint
CREATE TABLE `github_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`installation_id` text NOT NULL,
	`connected_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`capability` text,
	`game_id` text,
	`room_id` text,
	`inviter_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`accepted_by` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invitations_kind_check" CHECK("invitations"."kind" IN ('member', 'play', 'room')),
	CONSTRAINT "invitations_capability_check" CHECK("invitations"."capability" IS NULL OR "invitations"."capability" IN ('creator', 'player')),
	CONSTRAINT "invitations_target_check" CHECK(("invitations"."kind" = 'member' AND "invitations"."capability" IS NOT NULL AND "invitations"."game_id" IS NULL AND "invitations"."room_id" IS NULL) OR ("invitations"."kind" = 'play' AND "invitations"."capability" IS NULL AND "invitations"."game_id" IS NOT NULL AND "invitations"."room_id" IS NULL) OR ("invitations"."kind" = 'room' AND "invitations"."capability" IS NULL AND "invitations"."game_id" IS NOT NULL AND "invitations"."room_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_family_email_index` ON `invitations` (`family_id`,`email`);--> statement-breakpoint
CREATE INDEX `invitations_inviter_created_index` ON `invitations` (`inviter_id`,`created_at`);
