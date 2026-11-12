DROP INDEX IF EXISTS activity_service_key_idx;
DROP INDEX IF EXISTS activity_actor_idx;
DROP INDEX IF EXISTS activity_kind_idx;
DROP INDEX IF EXISTS activity_ts_idx;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_source_check;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_outcome_check;
ALTER TABLE activity
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS service_key;
