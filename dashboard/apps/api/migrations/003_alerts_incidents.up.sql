-- Alerts become incidents: one open row per incident_key, resolved when it recovers.
-- The partial unique index is what makes the alert engine idempotent across ticks.

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS incident_key TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS service_key TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_active_incident_idx
  ON alerts (incident_key)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS alerts_active_idx ON alerts (resolved_at, ts DESC);
CREATE INDEX IF NOT EXISTS alerts_unread_idx ON alerts (read, resolved_at);
