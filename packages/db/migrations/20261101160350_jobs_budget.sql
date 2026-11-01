CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`family_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`kind` text NOT NULL,
	`complexity` integer NOT NULL,
	`state` text NOT NULL,
	`paused_reason` text,
	`start` text NOT NULL,
	`start_at` text,
	`slot` text NOT NULL,
	`plan` text NOT NULL,
	`reservation` text NOT NULL,
	`hard_cap_micro_usd` integer NOT NULL,
	`usage_micro_usd` integer DEFAULT 0 NOT NULL,
	`aiur_repo` text,
	`aiur_issue_number` integer,
	`aiur_spend_cap_micro_usd` integer,
	`idempotency_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`terminal_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jobs_kind" CHECK("jobs"."kind" IN ('new_game', 'feature', 'repair', 'scope')),
	CONSTRAINT "jobs_complexity" CHECK("jobs"."complexity" BETWEEN 1 AND 5),
	CONSTRAINT "jobs_state" CHECK("jobs"."state" IN ('queued', 'admitted', 'filed', 'running', 'paused_budget', 'done', 'failed', 'cancelled')),
	CONSTRAINT "jobs_paused_reason" CHECK("jobs"."paused_reason" IS NULL OR "jobs"."paused_reason" IN ('over_reservation', 'budget_exhausted', 'admin')),
	CONSTRAINT "jobs_start" CHECK("jobs"."start" IN ('now', 'at_reset')),
	CONSTRAINT "jobs_slot" CHECK("jobs"."slot" IN ('new_game', 'edit')),
	CONSTRAINT "jobs_amounts" CHECK("jobs"."hard_cap_micro_usd" >= 0 AND "jobs"."usage_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE INDEX `jobs_family_state` ON `jobs` (`family_id`,`state`);--> statement-breakpoint
CREATE INDEX `jobs_game_created` ON `jobs` (`game_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_aiur_ticket` ON `jobs` (`aiur_repo`,`aiur_issue_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_creator_idempotency` ON `jobs` (`creator_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `allowances` (
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`daily_micro_usd` integer NOT NULL,
	PRIMARY KEY(`family_id`, `user_id`),
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "allowances_daily" CHECK("allowances"."daily_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE `budget_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_micro_usd` integer NOT NULL,
	`aiur_run_id` text,
	`note` text,
	`at` text NOT NULL,
	`day_key` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budget_ledger_kind" CHECK("budget_ledger"."kind" IN ('reservation', 'release', 'usage', 'adjustment')),
	CONSTRAINT "budget_ledger_amount" CHECK("budget_ledger"."amount_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE INDEX `budget_ledger_family_day` ON `budget_ledger` (`family_id`,`day_key`);--> statement-breakpoint
CREATE INDEX `budget_ledger_user_day` ON `budget_ledger` (`family_id`,`user_id`,`day_key`);--> statement-breakpoint
CREATE INDEX `budget_ledger_job` ON `budget_ledger` (`job_id`);--> statement-breakpoint
CREATE TABLE `family_budget_settings` (
	`family_id` text PRIMARY KEY NOT NULL,
	`reset_zone` text NOT NULL,
	`unit_label` text NOT NULL,
	`micro_usd_per_unit` integer NOT NULL,
	`platform_cap_micro_usd` integer,
	`slots_new_game` integer NOT NULL,
	`slots_edit` integer NOT NULL,
	`hard_cap_multiplier` real NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "family_budget_settings_values" CHECK("family_budget_settings"."micro_usd_per_unit" > 0 AND ("family_budget_settings"."platform_cap_micro_usd" IS NULL OR "family_budget_settings"."platform_cap_micro_usd" >= 0)),
	CONSTRAINT "family_budget_settings_slots" CHECK("family_budget_settings"."slots_new_game" >= 0 AND "family_budget_settings"."slots_edit" >= 0 AND "family_budget_settings"."hard_cap_multiplier" > 0)
);
--> statement-breakpoint
CREATE TABLE `size_classes` (
	`kind` text NOT NULL,
	`size_class` text NOT NULL,
	`p50_micro_usd` integer NOT NULL,
	`p80_micro_usd` integer NOT NULL,
	`samples` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`kind`, `size_class`),
	CONSTRAINT "size_classes_kind" CHECK("size_classes"."kind" IN ('new_game', 'feature', 'repair')),
	CONSTRAINT "size_classes_size" CHECK("size_classes"."size_class" IN ('small', 'medium', 'large', 'huge')),
	CONSTRAINT "size_classes_amounts" CHECK("size_classes"."p50_micro_usd" >= 0 AND "size_classes"."p80_micro_usd" >= "size_classes"."p50_micro_usd" AND "size_classes"."samples" >= 0)
);
--> statement-breakpoint
INSERT INTO `size_classes` (`kind`, `size_class`, `p50_micro_usd`, `p80_micro_usd`, `samples`) VALUES
	('new_game', 'small', 500000, 1500000, 0),
	('new_game', 'medium', 1500000, 4000000, 0),
	('new_game', 'large', 4000000, 9000000, 0),
	('new_game', 'huge', 9000000, 20000000, 0),
	('feature', 'small', 500000, 1500000, 0),
	('feature', 'medium', 1500000, 4000000, 0),
	('feature', 'large', 4000000, 9000000, 0),
	('feature', 'huge', 9000000, 20000000, 0),
	('repair', 'small', 166667, 500000, 0),
	('repair', 'medium', 500000, 1333333, 0),
	('repair', 'large', 1333333, 3000000, 0),
	('repair', 'huge', 3000000, 6666667, 0);
