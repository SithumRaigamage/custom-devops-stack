-- Metrics are keyed by the Compose service id from services.yaml (text), not by
-- the optional row id in the mirrored services table.

ALTER TABLE metrics ADD COLUMN IF NOT EXISTS service_key TEXT NOT NULL DEFAULT '';
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS service_name TEXT NOT NULL DEFAULT '';

-- service_id is no longer required: the sampler may run before the mirror table
-- is populated, and it addresses services by their stable Compose id.
ALTER TABLE metrics ALTER COLUMN service_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS metrics_ts_idx ON metrics (ts);
CREATE INDEX IF NOT EXISTS metrics_service_key_ts_idx ON metrics (service_key, ts);
