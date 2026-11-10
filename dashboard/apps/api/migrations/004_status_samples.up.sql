-- Seven-day service-status history, separate from the 24-hour CPU/memory metrics.
-- One row per service per sample (or status change), used for uptime and the
-- hourly status strip.
CREATE TABLE IF NOT EXISTS status_samples (
  ts BIGINT NOT NULL,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS status_samples_service_ts_idx
  ON status_samples (service_key, ts);

CREATE INDEX IF NOT EXISTS status_samples_ts_idx
  ON status_samples (ts);
