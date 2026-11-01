CREATE TABLE `aiur_cursors` (
	`daemon_slug` text PRIMARY KEY NOT NULL,
	`last_seq` integer NOT NULL,
	`epoch` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `aiur_events` (
	`daemon_slug` text NOT NULL,
	`seq` integer NOT NULL,
	`topic` text NOT NULL,
	`ticket` text,
	`job_id` text,
	`payload` text NOT NULL,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`daemon_slug`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `aiur_events_job_seq` ON `aiur_events` (`job_id`,`seq`);--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`decision_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`daemon_slug` text NOT NULL,
	`version` integer NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`recommend` text,
	`status` text NOT NULL,
	`opened_at` text NOT NULL,
	`answered_at` text,
	CONSTRAINT "checkpoints_status" CHECK("checkpoints"."status" IN ('open', 'answered', 'moot'))
);
--> statement-breakpoint
CREATE INDEX `checkpoints_job` ON `checkpoints` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_projections` (
	`job_id` text PRIMARY KEY NOT NULL,
	`daemon_slug` text NOT NULL,
	`ticket` text NOT NULL,
	`stage` text NOT NULL,
	`stage_text` text NOT NULL,
	`phase` text,
	`progress_percent` integer,
	`last_event_seq` integer,
	`aiur_run_id` text,
	`lifecycle` text,
	`tracker_state` text,
	`reason_labels` text DEFAULT '[]' NOT NULL,
	`spend_cap_reached` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
