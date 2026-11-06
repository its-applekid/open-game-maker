CREATE TABLE `allowed_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` text NOT NULL,
	CONSTRAINT "allowed_users_role_check" CHECK("allowed_users"."role" IN ('player', 'maker', 'admin'))
);
--> statement-breakpoint
CREATE INDEX `allowed_users_added_at_index` ON `allowed_users` (`added_at`);