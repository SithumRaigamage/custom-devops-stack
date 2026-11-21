DROP INDEX IF EXISTS metrics_service_key_ts_idx;
DROP INDEX IF EXISTS metrics_ts_idx;

ALTER TABLE metrics DROP COLUMN IF EXISTS service_name;
ALTER TABLE metrics DROP COLUMN IF EXISTS service_key;
