DROP INDEX IF EXISTS alerts_unread_idx;
DROP INDEX IF EXISTS alerts_active_idx;
DROP INDEX IF EXISTS alerts_active_incident_idx;

ALTER TABLE alerts DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE alerts DROP COLUMN IF EXISTS link;
ALTER TABLE alerts DROP COLUMN IF EXISTS service_key;
ALTER TABLE alerts DROP COLUMN IF EXISTS incident_key;
