CREATE TABLE `game_abuse_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`family_id` text NOT NULL,
	`flagged_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "game_abuse_flags_reason_check" CHECK("game_abuse_flags"."reason" IN ('spam', 'harmful', 'other'))
);
--> statement-breakpoint
CREATE INDEX `game_abuse_flags_family_created` ON `game_abuse_flags` (`family_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `game_abuse_flags_game_created` ON `game_abuse_flags` (`game_id`,`created_at`);