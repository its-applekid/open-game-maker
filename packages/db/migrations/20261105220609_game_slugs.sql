CREATE TABLE `game_slugs` (
	`slug` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_slugs_game_id_index` ON `game_slugs` (`game_id`);--> statement-breakpoint
ALTER TABLE `games` ADD `slug` text;--> statement-breakpoint
UPDATE `games` SET `slug` = 'game-' || substr(replace(`id`, 'g_', ''), 1, 8) WHERE `slug` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);
