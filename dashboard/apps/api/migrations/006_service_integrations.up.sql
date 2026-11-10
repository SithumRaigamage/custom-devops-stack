-- Per-service shell mode and integrations. Re-run safely on every startup.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS run_in_shell BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS integration TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS integration_url TEXT,
  ADD COLUMN IF NOT EXISTS integration_user TEXT,
  ADD COLUMN IF NOT EXISTS integration_header TEXT;

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_integration_check;
ALTER TABLE services
  ADD CONSTRAINT services_integration_check
  CHECK (integration IN ('none', 'jenkins', 'sonarqube', 'ollama', 'generic_http'));

-- Secrets (API token / header value) encrypted with SESSION_SECRET; never sent to the browser.
CREATE TABLE IF NOT EXISTS service_credentials (
  compose_id TEXT PRIMARY KEY REFERENCES services (compose_id) ON DELETE CASCADE ON UPDATE CASCADE,
  secret_enc TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
