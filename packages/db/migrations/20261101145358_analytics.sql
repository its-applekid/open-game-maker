CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`received_at` text NOT NULL,
	`family_id` text NOT NULL,
	`game_id` text NOT NULL,
	`job_id` text,
	`aiur_run_id` text,
	`attempt_id` text,
	`actor` text NOT NULL,
	`activity` text NOT NULL,
	`boundary` text NOT NULL,
	`source` text NOT NULL,
	`meta_json` text NOT NULL,
	`principal_kind` text NOT NULL,
	`principal_id` text NOT NULL,
	CONSTRAINT "activity_events_actor_check" CHECK("activity_events"."actor" IN ('agent', 'human')),
	CONSTRAINT "activity_events_activity_check" CHECK("activity_events"."activity" IN ('asset_pipeline', 'level_building', 'gameplay_code', 'animation_vfx', 'audio', 'ui_hud', 'playtesting', 'deploy_release', 'writing')),
	CONSTRAINT "activity_events_boundary_check" CHECK("activity_events"."boundary" IN ('start', 'end', 'point')),
	CONSTRAINT "activity_events_source_check" CHECK("activity_events"."source" IN ('gm_cli', 'skill', 'editor', 'sdk', 'manifest_path')),
	CONSTRAINT "activity_events_principal_kind_check" CHECK("activity_events"."principal_kind" IN ('job', 'user'))
);
--> statement-breakpoint
CREATE INDEX `activity_events_job_ts_idx` ON `activity_events` (`job_id`,`ts`);--> statement-breakpoint
CREATE INDEX `activity_events_game_ts_idx` ON `activity_events` (`game_id`,`ts`);--> statement-breakpoint
CREATE INDEX `activity_events_family_ts_idx` ON `activity_events` (`family_id`,`ts`);--> statement-breakpoint
CREATE TABLE `aiur_phase_events` (
	`job_id` text NOT NULL,
	`phase` text NOT NULL,
	`transition` text,
	`at` text NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "aiur_phase_events_phase_check" CHECK("aiur_phase_events"."phase" IN ('brainstorm', 'plan', 'work', 'review')),
	CONSTRAINT "aiur_phase_events_source_check" CHECK("aiur_phase_events"."source" IN ('events_feed', 'progress_poll'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aiur_phase_events_job_phase_at_idx` ON `aiur_phase_events` (`job_id`,`phase`,`at`);