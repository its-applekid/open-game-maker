CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`git_sha` text NOT NULL,
	`job_id` text,
	`sdk_version` text NOT NULL,
	`save_schema_version` integer NOT NULL,
	`migrates_from_schema` integer,
	`achievement_catalog_hash` text NOT NULL,
	`status` text NOT NULL,
	`artifact` text NOT NULL,
	`artifact_path` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "builds_save_schema_version_check" CHECK("builds"."save_schema_version" >= 0),
	CONSTRAINT "builds_migrates_from_schema_check" CHECK("builds"."migrates_from_schema" IS NULL OR "builds"."migrates_from_schema" >= 0),
	CONSTRAINT "builds_status_check" CHECK("builds"."status" IN ('building', 'tested', 'failed')),
	CONSTRAINT "builds_artifact_check" CHECK("builds"."artifact" IN ('present', 'gc'))
);
--> statement-breakpoint
CREATE INDEX `builds_game_branch_index` ON `builds` (`game_id`,`branch_id`);