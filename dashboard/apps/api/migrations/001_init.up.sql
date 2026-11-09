-- StackPilot schema (PostgreSQL)

-- services – mirror of the Docker Compose inventory (for FK convenience)
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  compose_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  folder TEXT NOT NULL,
  url TEXT NOT NULL,
  health TEXT NOT NULL
);

-- users – local account (single-user)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- sessions – opaque session tokens for auth cookies
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

-- settings – per-user (currently single-user) app settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- activity log – every UI action + API status change
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY,
  ts BIGINT NOT NULL,
  kind TEXT NOT NULL,
  service_id INTEGER REFERENCES services (id),
  message TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'user'
);

-- metrics – time-series for CPU / memory per service
CREATE TABLE IF NOT EXISTS metrics (
  ts BIGINT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services (id),
  cpu REAL NOT NULL,
  mem_bytes REAL NOT NULL,
  mem_pct REAL NOT NULL
);

-- alerts – generated when a metric exceeds a rule
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  ts BIGINT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

-- conversation threads for the AI Assistant
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ts BIGINT NOT NULL
);
