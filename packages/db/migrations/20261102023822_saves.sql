CREATE TABLE `play_leases` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`device_id` text NOT NULL,
	`tab_id` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `play_leases_expiry_index` ON `play_leases` (`expires_at`);--> statement-breakpoint
CREATE TABLE `save_revisions` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`revision` integer NOT NULL,
	`branch_id` text NOT NULL,
	`build_id` text NOT NULL,
	`release_id` text,
	`save_schema_version` integer NOT NULL,
	`payload` blob NOT NULL,
	`sha256` text NOT NULL,
	`device_id` text NOT NULL,
	`client_seq` integer NOT NULL,
	`reason` text NOT NULL,
	`migrated_from_revision` integer,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`, `slot_id`, `revision`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`game_id`,`slot_id`) REFERENCES `save_slots`(`user_id`,`game_id`,`slot_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "save_revisions_revision_check" CHECK("save_revisions"."revision" > 0),
	CONSTRAINT "save_revisions_schema_check" CHECK("save_revisions"."save_schema_version" >= 0),
	CONSTRAINT "save_revisions_client_seq_check" CHECK("save_revisions"."client_seq" >= 0),
	CONSTRAINT "save_revisions_reason_check" CHECK("save_revisions"."reason" IN ('pause', 'checkpoint', 'interval', 'hidden', 'manual', 'migration', 'update'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `save_revisions_idempotency_unique` ON `save_revisions` (`user_id`,`game_id`,`slot_id`,`device_id`,`client_seq`);--> statement-breakpoint
CREATE INDEX `save_revisions_slot_created_index` ON `save_revisions` (`user_id`,`game_id`,`slot_id`,`revision`);--> statement-breakpoint
CREATE TABLE `save_slots` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`head_revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`, `slot_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "save_slots_slot_check" CHECK("save_slots"."slot_id" IN ('auto', '1', '2', '3')),
	CONSTRAINT "save_slots_kind_check" CHECK("save_slots"."kind" IN ('auto', 'manual')),
	CONSTRAINT "save_slots_head_revision_check" CHECK("save_slots"."head_revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX `save_slots_game_user_index` ON `save_slots` (`game_id`,`user_id`);--> statement-breakpoint
CREATE TRIGGER `save_revisions_no_update`
BEFORE UPDATE ON `save_revisions`
BEGIN
	SELECT RAISE(ABORT, 'save revisions are immutable');
END;
