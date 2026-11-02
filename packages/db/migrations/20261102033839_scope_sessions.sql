CREATE TABLE `scope_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`job_id` text NOT NULL,
	`ticket` text,
	`status` text NOT NULL,
	`choices` text NOT NULL,
	`scope` text,
	`scope_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scope_sessions_status" CHECK("scope_sessions"."status" IN ('open', 'agreed', 'abandoned')),
	CONSTRAINT "scope_sessions_agreed_payload" CHECK(("scope_sessions"."status" = 'agreed' AND "scope_sessions"."scope" IS NOT NULL AND "scope_sessions"."scope_hash" IS NOT NULL) OR ("scope_sessions"."status" != 'agreed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scope_sessions_job_unique` ON `scope_sessions` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scope_sessions_game_open_unique` ON `scope_sessions` (`game_id`) WHERE "scope_sessions"."status" = 'open';--> statement-breakpoint
CREATE INDEX `scope_sessions_game_created` ON `scope_sessions` (`game_id`,`created_at`);
