CREATE TABLE `build_chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`message_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`blob_hash` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "build_chat_attachments_kind" CHECK("build_chat_attachments"."kind" IN ('image', 'text'))
);
--> statement-breakpoint
CREATE INDEX `build_chat_attachments_job` ON `build_chat_attachments` (`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `build_chat_attachments_message` ON `build_chat_attachments` (`message_id`);