-- Audit trail: every state-changing API request is recorded in activity.
-- Re-run safely on every startup.
ALTER TABLE activity
  ADD COLUMN IF NOT EXISTS service_key TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'event';

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_outcome_check;
ALTER TABLE activity
  ADD CONSTRAINT activity_outcome_check CHECK (outcome IN ('ok', 'failed'));

ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_source_check;
ALTER TABLE activity
  ADD CONSTRAINT activity_source_check CHECK (source IN ('event', 'audit'));

CREATE INDEX IF NOT EXISTS activity_ts_idx ON activity (ts DESC);
CREATE INDEX IF NOT EXISTS activity_kind_idx ON activity (kind);
CREATE INDEX IF NOT EXISTS activity_actor_idx ON activity (actor);
CREATE INDEX IF NOT EXISTS activity_service_key_idx ON activity (service_key);
