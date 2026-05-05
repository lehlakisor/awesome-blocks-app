CREATE TABLE IF NOT EXISTS team_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS submissions (
  id BIGINT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  giver TEXT NOT NULL,
  awardee TEXT NOT NULL,
  value TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  imported BOOLEAN DEFAULT FALSE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS points_ledger (
  name TEXT PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cash_milestones (
  name TEXT PRIMARY KEY,
  fired_thresholds INTEGER[] NOT NULL DEFAULT '{}'
);
