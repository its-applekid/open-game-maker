CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  received_at TEXT NOT NULL,
  family_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  job_id TEXT,
  aiur_run_id TEXT,
  attempt_id TEXT,
  actor TEXT NOT NULL CHECK (actor IN ('agent', 'human')),
  activity TEXT NOT NULL CHECK (activity IN (
    'asset_pipeline', 'level_building', 'gameplay_code', 'animation_vfx', 'audio',
    'ui_hud', 'playtesting', 'deploy_release', 'writing'
  )),
  boundary TEXT NOT NULL CHECK (boundary IN ('start', 'end', 'point')),
  source TEXT NOT NULL CHECK (source IN ('gm_cli', 'skill', 'editor', 'sdk', 'manifest_path')),
  meta_json TEXT NOT NULL,
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('job', 'user')),
  principal_id TEXT NOT NULL
);

CREATE INDEX activity_events_job_ts_idx ON activity_events (job_id, ts);
CREATE INDEX activity_events_game_ts_idx ON activity_events (game_id, ts);
CREATE INDEX activity_events_family_ts_idx ON activity_events (family_id, ts);

CREATE TABLE aiur_phase_events (
  job_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('brainstorm', 'plan', 'work', 'review')),
  transition TEXT,
  at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('events_feed', 'progress_poll')),
  UNIQUE (job_id, phase, at)
);
