CREATE TABLE `game_abuse_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`family_id` text NOT NULL,
	`flagged_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "game_abuse_flags_reason_check" CHECK("game_abuse_flags"."reason" IN ('spam', 'harmful', 'other'))
);
--> statement-breakpoint
CREATE INDEX `game_abuse_flags_family_created` ON `game_abuse_flags` (`family_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `game_abuse_flags_game_created` ON `game_abuse_flags` (`game_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reports` (
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
	`triage_state` text,
	`triage_claimed_at` text,
	`triage_signature` text,
	`triage_json` text,
	`diagnostics_key` text,
	`reporter_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_route" CHECK("__new_reports"."route" IN ('game_repair', 'platform', 'editor_hint', 'stored')),
	CONSTRAINT "reports_reproduction" CHECK("__new_reports"."reproduction" IN ('crash_with_error', 'wrong_behaviour', 'not_reproducible')),
	CONSTRAINT "reports_text_length" CHECK("__new_reports"."text" IS NULL OR length("__new_reports"."text") <= 2000),
	CONSTRAINT "reports_triage_state" CHECK("__new_reports"."triage_state" IS NULL OR "__new_reports"."triage_state" IN ('processing', 'ready', 'stored', 'deduped'))
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "game_id", "release_id", "build_hash", "text", "error_json", "signature", "platform_signature", "route", "reproduction", "job_id", "bundle_key", "triage_state", "triage_claimed_at", "triage_signature", "triage_json", "diagnostics_key", "reporter_id", "created_at") SELECT "id", "game_id", "release_id", "build_hash", "text", "error_json", "signature", "platform_signature", "route", "reproduction", "job_id", "bundle_key", "triage_state", "triage_claimed_at", "triage_signature", "triage_json", "diagnostics_key", "reporter_id", "created_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reports_game_created` ON `reports` (`game_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_signature` ON `reports` (`signature`);--> statement-breakpoint
CREATE INDEX `reports_platform_signature` ON `reports` (`platform_signature`);--> statement-breakpoint
CREATE INDEX `reports_triage_claim` ON `reports` (`triage_state`,`route`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_triage_signature` ON `reports` (`triage_signature`);