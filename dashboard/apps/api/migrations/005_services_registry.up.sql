ALTER TABLE services
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'compose',
  ADD COLUMN IF NOT EXISTS working_dir TEXT,
  ADD COLUMN IF NOT EXISTS compose_file TEXT NOT NULL DEFAULT 'docker-compose.yml',
  ADD COLUMN IF NOT EXISTS port INTEGER,
  ADD COLUMN IF NOT EXISTS health_url TEXT,
  ADD COLUMN IF NOT EXISTS start_cmd TEXT,
  ADD COLUMN IF NOT EXISTS stop_cmd TEXT,
  ADD COLUMN IF NOT EXISTS restart_cmd TEXT,
  ADD COLUMN IF NOT EXISTS logs_cmd TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0;

UPDATE services
SET description = COALESCE(NULLIF(description, ''), ''),
    working_dir = COALESCE(working_dir, folder),
    health_url = COALESCE(health_url, health),
    created_at = CASE WHEN created_at = 0 THEN EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 ELSE created_at END,
    updated_at = CASE WHEN updated_at = 0 THEN EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 ELSE updated_at END;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_type_check;

ALTER TABLE services
  ADD CONSTRAINT services_type_check CHECK (type IN ('compose', 'custom'));

CREATE INDEX IF NOT EXISTS services_sort_order_idx ON services (sort_order, compose_id);

CREATE TABLE IF NOT EXISTS service_runs (
  id SERIAL PRIMARY KEY,
  service_key TEXT NOT NULL,
  action TEXT NOT NULL,
  command TEXT NOT NULL,
  ok INTEGER NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  ts BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS service_runs_service_ts_idx
  ON service_runs (service_key, ts);
