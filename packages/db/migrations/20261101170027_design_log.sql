CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`git_ref` text NOT NULL,
	`fork_parent_branch_id` text,
	`fork_parent_rev` integer,
	`fork_git_sha` text,
	`head_rev` integer DEFAULT 0 NOT NULL,
	`latest_build_id` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "branches_head_rev_check" CHECK("branches"."head_rev" >= 0),
	CONSTRAINT "branches_status_check" CHECK("branches"."status" IN ('active', 'archived', 'merged')),
	CONSTRAINT "branches_fork_point_check" CHECK(("branches"."fork_parent_branch_id" IS NULL AND "branches"."fork_parent_rev" IS NULL AND "branches"."fork_git_sha" IS NULL) OR ("branches"."fork_parent_branch_id" IS NOT NULL AND "branches"."fork_parent_rev" >= 0 AND "branches"."fork_git_sha" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_game_name_unique` ON `branches` (`game_id`,`name`);--> statement-breakpoint
CREATE INDEX `branches_game_id_index` ON `branches` (`game_id`);--> statement-breakpoint
CREATE TABLE `design_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`rev` integer NOT NULL,
	`base_rev` integer NOT NULL,
	`lease_token` integer NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`base_build_id` text NOT NULL,
	`commands_json` text NOT NULL,
	`patches_json` text NOT NULL,
	`inverse_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "design_transactions_rev_check" CHECK("design_transactions"."rev" > 0),
	CONSTRAINT "design_transactions_base_rev_check" CHECK("design_transactions"."base_rev" >= 0),
	CONSTRAINT "design_transactions_lease_token_check" CHECK("design_transactions"."lease_token" >= 0),
	CONSTRAINT "design_transactions_kind_check" CHECK("design_transactions"."kind" IN ('manual', 'system', 'merge'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_transactions_branch_rev_unique` ON `design_transactions` (`branch_id`,`rev`);--> statement-breakpoint
CREATE INDEX `design_transactions_game_branch_index` ON `design_transactions` (`game_id`,`branch_id`);--> statement-breakpoint
CREATE TABLE `edit_leases` (
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`holder_user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`token` integer NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`game_id`, `branch_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "edit_leases_token_check" CHECK("edit_leases"."token" > 0)
);
--> statement-breakpoint
CREATE TRIGGER `design_transactions_no_update`
BEFORE UPDATE ON `design_transactions`
BEGIN
	SELECT RAISE(ABORT, 'design_transactions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `design_transactions_no_delete`
BEFORE DELETE ON `design_transactions`
BEGIN
	SELECT RAISE(ABORT, 'design_transactions is append-only');
END;
