CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0)
);

CREATE UNIQUE INDEX push_subscriptions_endpoint_unique ON push_subscriptions(endpoint);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  data_json TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at);
CREATE INDEX notifications_user_read_idx ON notifications(user_id, read_at);
