CREATE TABLE `achievement_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`key` text NOT NULL,
	`action` text NOT NULL,
	`by_user_id` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievement_audit_action_check" CHECK("achievement_audit"."action" = 'revoke')
);
--> statement-breakpoint
CREATE TABLE `achievement_awards` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`key` text NOT NULL,
	`release_id` text NOT NULL,
	`source` text NOT NULL,
	`awarded_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`, `key`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievement_awards_source_check" CHECK("achievement_awards"."source" IN ('client', 'room', 'admin'))
);
--> statement-breakpoint
CREATE TABLE `achievement_catalogs` (
	`game_id` text NOT NULL,
	`release_id` text NOT NULL,
	`defs_json` text NOT NULL,
	`registered_at` text NOT NULL,
	PRIMARY KEY(`game_id`, `release_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `achievement_defs` (
	`game_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`icon_path` text NOT NULL,
	`hidden` integer NOT NULL,
	`target` real,
	`first_release_id` text NOT NULL,
	`retired_release_id` text,
	PRIMARY KEY(`game_id`, `key`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievement_defs_hidden_check" CHECK("achievement_defs"."hidden" IN (0, 1)),
	CONSTRAINT "achievement_defs_target_check" CHECK("achievement_defs"."target" IS NULL OR "achievement_defs"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE `achievement_progress` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`key` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`, `key`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievement_progress_value_check" CHECK("achievement_progress"."value" >= 0)
);
