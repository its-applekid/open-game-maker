CREATE TABLE `change_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`job_id` text,
	`tx_id` text,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`release_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "change_notes_kind_check" CHECK("change_notes"."kind" IN ('fix', 'add', 'change', 'remove'))
);
--> statement-breakpoint
CREATE INDEX `change_notes_game_release_index` ON `change_notes` (`game_id`,`release_id`);--> statement-breakpoint
CREATE TABLE `override_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`build_id` text NOT NULL,
	`head_rev` integer NOT NULL,
	`sha256` text NOT NULL,
	`entries_json` text NOT NULL,
	`entity_ops_json` text NOT NULL,
	`fold_sha` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "override_snapshots_head_rev_check" CHECK("override_snapshots"."head_rev" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `override_snapshots_game_build_hash_unique` ON `override_snapshots` (`game_id`,`build_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `override_snapshots_game_index` ON `override_snapshots` (`game_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`seq` integer NOT NULL,
	`version` text NOT NULL,
	`build_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`git_tag` text NOT NULL,
	`kind` text NOT NULL,
	`restores_release_id` text,
	`predecessor_release_id` text,
	`changelog_json` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `override_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "releases_seq_check" CHECK("releases"."seq" > 0),
	CONSTRAINT "releases_kind_check" CHECK("releases"."kind" IN ('publish', 'rollback'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_game_seq_unique` ON `releases` (`game_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_git_tag_unique` ON `releases` (`git_tag`);--> statement-breakpoint
CREATE INDEX `releases_game_published_index` ON `releases` (`game_id`,`published_at`);--> statement-breakpoint
CREATE TRIGGER `releases_no_update`
BEFORE UPDATE ON `releases`
BEGIN
	SELECT RAISE(ABORT, 'releases is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `releases_no_delete`
BEFORE DELETE ON `releases`
BEGIN
	SELECT RAISE(ABORT, 'releases is append-only');
END;
