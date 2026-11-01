CREATE TABLE `build_chat_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`job_id` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`text` text,
	`media_hash` text,
	`poster_hash` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`checkpoint_json` text,
	`aiur_ticket` text,
	`aiur_event_id` integer,
	`aiur_topic` text,
	`mirror_state` text,
	CONSTRAINT "build_chat_messages_actor" CHECK("build_chat_messages"."actor" IN ('creator', 'agent', 'system')),
	CONSTRAINT "build_chat_messages_kind" CHECK("build_chat_messages"."kind" IN ('text', 'image', 'clip', 'checkpoint', 'progress'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_chat_messages_id_unique` ON `build_chat_messages` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `build_chat_messages_job_event_unique` ON `build_chat_messages` (`job_id`,`aiur_event_id`);--> statement-breakpoint
CREATE INDEX `build_chat_messages_job_seq` ON `build_chat_messages` (`job_id`,`seq`);--> statement-breakpoint
CREATE TABLE `build_chat_outbox_offsets` (
	`path` text PRIMARY KEY NOT NULL,
	`offset` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `build_chat_workspaces` (
	`workspace_root` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`pinned_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `build_chat_workspaces_job` ON `build_chat_workspaces` (`job_id`);