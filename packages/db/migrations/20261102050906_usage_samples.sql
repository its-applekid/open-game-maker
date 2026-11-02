CREATE TABLE `usage_samples` (
	`job_id` text NOT NULL,
	`run_id` text NOT NULL,
	`repo` text NOT NULL,
	`issue` integer NOT NULL,
	`provider_reported_micro` integer NOT NULL,
	`api_equivalent_micro` integer NOT NULL,
	`coverage_status` text NOT NULL,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`job_id`, `run_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "usage_samples_amounts" CHECK("usage_samples"."provider_reported_micro" >= 0 AND "usage_samples"."api_equivalent_micro" >= 0)
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `usage_coverage` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `aiur_run_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `released_at` text;