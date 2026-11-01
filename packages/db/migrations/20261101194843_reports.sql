CREATE TABLE `platform_issue_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`labels_json` text NOT NULL,
	`status` text NOT NULL,
	`ref` text,
	`created_at` text NOT NULL,
	CONSTRAINT "platform_issue_queue_status_check" CHECK("platform_issue_queue"."status" IN ('pending', 'filed', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `platform_issue_queue_status` ON `platform_issue_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `report_signatures` (
	`signature` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`game_id` text,
	`count` integer DEFAULT 0 NOT NULL,
	`first_at` text NOT NULL,
	`last_at` text NOT NULL,
	`open_job_id` text,
	`platform_ref` text,
	`status` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "report_signatures_scope" CHECK("report_signatures"."scope" IN ('game', 'platform')),
	CONSTRAINT "report_signatures_status" CHECK("report_signatures"."status" IN ('open', 'repaired', 'closed')),
	CONSTRAINT "report_signatures_count" CHECK("report_signatures"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`release_id` text,
	`build_hash` text NOT NULL,
	`text` text,
	`error_json` text,
	`signature` text NOT NULL,
	`platform_signature` text,
	`route` text NOT NULL,
	`reproduction` text NOT NULL,
	`job_id` text,
	`bundle_key` text,
	`reporter_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_route" CHECK("reports"."route" IN ('game_repair', 'platform', 'editor_hint', 'stored')),
	CONSTRAINT "reports_reproduction" CHECK("reports"."reproduction" IN ('crash_with_error', 'wrong_behaviour', 'not_reproducible')),
	CONSTRAINT "reports_text_length" CHECK("reports"."text" IS NULL OR length("reports"."text") <= 2000)
);
--> statement-breakpoint
CREATE INDEX `reports_game_created` ON `reports` (`game_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_signature` ON `reports` (`signature`);--> statement-breakpoint
CREATE INDEX `reports_platform_signature` ON `reports` (`platform_signature`);