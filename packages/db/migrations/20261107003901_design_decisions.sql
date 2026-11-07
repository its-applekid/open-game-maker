CREATE TABLE `design_decisions` (
	`game_id` text NOT NULL,
	`number` integer NOT NULL,
	`job_id` text NOT NULL,
	`ticket` text,
	`checkpoint_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`recommended` text,
	`chosen` text NOT NULL,
	`origin` text NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`affects` text NOT NULL,
	`supersedes` integer,
	`at` text NOT NULL,
	PRIMARY KEY(`game_id`, `number`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "design_decisions_number" CHECK("design_decisions"."number" > 0),
	CONSTRAINT "design_decisions_origin" CHECK("design_decisions"."origin" IN ('player', 'default')),
	CONSTRAINT "design_decisions_skipped" CHECK("design_decisions"."skipped" IN (0, 1)),
	CONSTRAINT "design_decisions_supersedes" CHECK("design_decisions"."supersedes" IS NULL OR "design_decisions"."supersedes" > 0)
);
--> statement-breakpoint
CREATE INDEX `design_decisions_game_checkpoint` ON `design_decisions` (`game_id`,`checkpoint_id`);