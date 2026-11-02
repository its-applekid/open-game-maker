CREATE TABLE `merge_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`source_branch_id` text NOT NULL,
	`target_branch_id` text NOT NULL,
	`base_rev` integer NOT NULL,
	`target_head_rev` integer NOT NULL,
	`plan_json` text NOT NULL,
	`status` text NOT NULL,
	`landed_tx_id` text,
	`rolled_back_tx_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`landed_tx_id`) REFERENCES `design_transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rolled_back_tx_id`) REFERENCES `design_transactions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "merge_plans_base_rev_check" CHECK("merge_plans"."base_rev" >= 0),
	CONSTRAINT "merge_plans_target_head_rev_check" CHECK("merge_plans"."target_head_rev" >= 0),
	CONSTRAINT "merge_plans_status_check" CHECK("merge_plans"."status" IN ('planned', 'resolving', 'previewing', 'landed', 'abandoned')),
	CONSTRAINT "merge_plans_distinct_branches_check" CHECK("merge_plans"."source_branch_id" <> "merge_plans"."target_branch_id")
);
--> statement-breakpoint
CREATE INDEX `merge_plans_game_id_index` ON `merge_plans` (`game_id`);--> statement-breakpoint
CREATE INDEX `merge_plans_target_branch_id_index` ON `merge_plans` (`target_branch_id`);