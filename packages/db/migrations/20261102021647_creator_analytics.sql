CREATE TABLE `analytics_salts` (
	`game_id` text NOT NULL,
	`salt` text NOT NULL,
	`rotated_at` text NOT NULL,
	PRIMARY KEY(`game_id`, `rotated_at`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "analytics_salts_hex_check" CHECK(length("analytics_salts"."salt") = 64 AND "analytics_salts"."salt" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_salts_game_salt_unique` ON `analytics_salts` (`game_id`,`salt`);--> statement-breakpoint
CREATE INDEX `analytics_salts_game_rotated_idx` ON `analytics_salts` (`game_id`,`rotated_at`);--> statement-breakpoint
CREATE TABLE `creator_analytics_daily` (
	`game_id` text NOT NULL,
	`day` text NOT NULL,
	`release_id` text DEFAULT '' NOT NULL,
	`metric` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`game_id`, `day`, `release_id`, `metric`, `scope`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "creator_analytics_daily_metric_check" CHECK("creator_analytics_daily"."metric" IN ('plays', 'players', 'attempts', 'clears', 'clear_rate', 'median_active_sec', 'completion_rate', 'marker_reached', 'marker_first_seen', 'drop_off', 'stuck', 'version_adoption', 'test_runs')),
	CONSTRAINT "creator_analytics_daily_value_check" CHECK("creator_analytics_daily"."value" >= 0)
);
--> statement-breakpoint
CREATE INDEX `creator_analytics_daily_game_day_idx` ON `creator_analytics_daily` (`game_id`,`day`);--> statement-breakpoint
CREATE TABLE `creator_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`release_id` text,
	`env` text NOT NULL,
	`pseudo_user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`scope` text,
	`marker` text,
	`outcome` text,
	`props_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "creator_analytics_events_env_check" CHECK("creator_analytics_events"."env" IN ('draft', 'published')),
	CONSTRAINT "creator_analytics_events_name_check" CHECK("creator_analytics_events"."name" IN ('session_start', 'session_end', 'active_heartbeat', 'game_load_failed', 'error', 'bug_report', 'update_offered', 'update_accepted', 'save', 'load', 'attempt_start', 'attempt_end', 'marker', 'complete')),
	CONSTRAINT "creator_analytics_events_outcome_check" CHECK("creator_analytics_events"."outcome" IS NULL OR "creator_analytics_events"."outcome" IN ('complete', 'fail', 'quit')),
	CONSTRAINT "creator_analytics_events_props_check" CHECK(json_valid("creator_analytics_events"."props_json") AND length(CAST("creator_analytics_events"."props_json" AS BLOB)) <= 1024)
);
--> statement-breakpoint
CREATE INDEX `creator_analytics_events_game_ts_idx` ON `creator_analytics_events` (`game_id`,`ts`);--> statement-breakpoint
CREATE INDEX `creator_analytics_events_game_env_release_idx` ON `creator_analytics_events` (`game_id`,`env`,`release_id`);--> statement-breakpoint
CREATE INDEX `creator_analytics_events_game_pseudo_idx` ON `creator_analytics_events` (`game_id`,`pseudo_user_id`);