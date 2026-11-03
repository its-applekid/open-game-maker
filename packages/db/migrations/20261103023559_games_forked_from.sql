ALTER TABLE `games` ADD `forked_from_game_id` text;--> statement-breakpoint
ALTER TABLE `games` ADD `forked_from_release_id` text;--> statement-breakpoint
ALTER TABLE `games` ADD `forkable` integer DEFAULT true NOT NULL CHECK (`forkable` IN (0, 1));--> statement-breakpoint
CREATE TRIGGER `games_fork_provenance_insert`
BEFORE INSERT ON `games`
WHEN (`NEW`.`forked_from_game_id` IS NULL) <> (`NEW`.`forked_from_release_id` IS NULL)
BEGIN
	SELECT RAISE(ABORT, 'fork provenance must be complete');
END;--> statement-breakpoint
CREATE TRIGGER `games_fork_provenance_no_update`
BEFORE UPDATE OF `forked_from_game_id`, `forked_from_release_id` ON `games`
WHEN OLD.`forked_from_game_id` IS NOT NEW.`forked_from_game_id`
  OR OLD.`forked_from_release_id` IS NOT NEW.`forked_from_release_id`
BEGIN
	SELECT RAISE(ABORT, 'fork provenance is immutable');
END;
