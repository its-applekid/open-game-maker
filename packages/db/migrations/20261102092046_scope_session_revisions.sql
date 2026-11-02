CREATE TABLE `scope_session_revisions` (
	`session_id` text NOT NULL,
	`revision` integer NOT NULL,
	`scope` text NOT NULL,
	`scope_hash` text NOT NULL,
	`agreed_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `revision`),
	FOREIGN KEY (`session_id`) REFERENCES `scope_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scope_session_revisions_positive" CHECK("scope_session_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `scope_session_revisions_agreed` ON `scope_session_revisions` (`session_id`,`agreed_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scope_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`job_id` text NOT NULL,
	`ticket` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`choices` text NOT NULL,
	`scope` text,
	`scope_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scope_sessions_status" CHECK("__new_scope_sessions"."status" IN ('open', 'revising', 'agreed', 'abandoned')),
	CONSTRAINT "scope_sessions_revision" CHECK("__new_scope_sessions"."revision" >= 0),
	CONSTRAINT "scope_sessions_agreed_payload" CHECK(("__new_scope_sessions"."revision" = 0 AND "__new_scope_sessions"."scope" IS NULL AND "__new_scope_sessions"."scope_hash" IS NULL) OR ("__new_scope_sessions"."revision" > 0 AND "__new_scope_sessions"."scope" IS NOT NULL AND "__new_scope_sessions"."scope_hash" IS NOT NULL)),
	CONSTRAINT "scope_sessions_state_revision" CHECK(("__new_scope_sessions"."status" = 'open' AND "__new_scope_sessions"."revision" = 0) OR ("__new_scope_sessions"."status" IN ('agreed', 'revising') AND "__new_scope_sessions"."revision" > 0) OR "__new_scope_sessions"."status" = 'abandoned')
);
--> statement-breakpoint
INSERT INTO `__new_scope_sessions`("id", "game_id", "creator_id", "job_id", "ticket", "status", "revision", "choices", "scope", "scope_hash", "created_at", "updated_at") SELECT "id", "game_id", "creator_id", "job_id", "ticket", "status", CASE WHEN "status" = 'agreed' THEN 1 ELSE 0 END, "choices", "scope", "scope_hash", "created_at", "updated_at" FROM `scope_sessions`;--> statement-breakpoint
DROP TABLE `scope_sessions`;--> statement-breakpoint
ALTER TABLE `__new_scope_sessions` RENAME TO `scope_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `scope_sessions_job_unique` ON `scope_sessions` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scope_sessions_game_active_unique` ON `scope_sessions` (`game_id`) WHERE "scope_sessions"."status" IN ('open', 'revising');--> statement-breakpoint
CREATE INDEX `scope_sessions_game_created` ON `scope_sessions` (`game_id`,`created_at`);--> statement-breakpoint
INSERT INTO `scope_session_revisions` (`session_id`, `revision`, `scope`, `scope_hash`, `agreed_at`)
SELECT `id`, 1, `scope`, `scope_hash`, `updated_at`
FROM `scope_sessions`
WHERE `status` = 'agreed';
