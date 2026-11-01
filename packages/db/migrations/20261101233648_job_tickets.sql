CREATE TABLE `job_tickets` (
	`job_id` text NOT NULL,
	`key` text NOT NULL,
	`issue_number` integer NOT NULL,
	`repo` text NOT NULL,
	`sig` text NOT NULL,
	`cap_set_at` text,
	`todo_at` text,
	`filed_at` text,
	PRIMARY KEY(`job_id`, `key`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_tickets_issue_number" CHECK(`job_tickets`.`issue_number` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_tickets_repo_issue` ON `job_tickets` (`repo`,`issue_number`);
