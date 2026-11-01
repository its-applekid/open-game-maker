CREATE TABLE `game_daemons` (
	`slug` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`checkout_path` text NOT NULL,
	`unit` text NOT NULL,
	`env_file` text NOT NULL,
	`port` integer NOT NULL,
	`status` text NOT NULL,
	`last_health_at` text,
	`last_error` text,
	`started_at` text,
	`idle_since` text,
	`max_concurrent_agents` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "game_daemons_status" CHECK("game_daemons"."status" IN ('stopped', 'starting', 'running', 'idle')),
	CONSTRAINT "game_daemons_max_agents" CHECK("game_daemons"."max_concurrent_agents" IN (1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_daemons_repo_unique` ON `game_daemons` (`repo`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_daemons_port_unique` ON `game_daemons` (`port`);