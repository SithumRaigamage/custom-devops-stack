DROP TABLE IF EXISTS service_credentials;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_integration_check;
ALTER TABLE services
  DROP COLUMN IF EXISTS integration_header,
  DROP COLUMN IF EXISTS integration_user,
  DROP COLUMN IF EXISTS integration_url,
  DROP COLUMN IF EXISTS integration,
  DROP COLUMN IF EXISTS run_in_shell;
