CREATE TABLE `reapply_reports` (
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`from_build_id` text NOT NULL,
	`to_build_id` text NOT NULL,
	`report_json` text NOT NULL,
	`computed_at` text NOT NULL,
	PRIMARY KEY(`branch_id`, `to_build_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade
);
