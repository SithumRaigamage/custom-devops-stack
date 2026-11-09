-- 001_init.up.sql
-- Create all tables for StackPilot API

-- services mirror (for FK convenience in activity/metrics)
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compose_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    folder TEXT NOT NULL,
    url TEXT NOT NULL,
    health TEXT NOT NULL
);

-- users – single‑user account
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- sessions – for auth cookies / JWT revocation
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- settings – per‑user (currently single‑user) app settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);

-- activity log – every UI action + API status change
CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400 * 1000 AS INTEGER)),
    kind TEXT NOT NULL,
    service_id INTEGER REFERENCES services(id),
    message TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'user'
);

-- metrics – time‑series for CPU / memory per service
CREATE TABLE IF NOT EXISTS metrics (
    ts INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    cpu REAL NOT NULL,
    mem_bytes REAL NOT NULL,
    mem_pct REAL NOT NULL,
    FOREIGN KEY (service_id) REFERENCES services(id)
);

-- alerts – generated when a metric exceeds a rule
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    rule TEXT NOT NULL,
    severity TEXT NOT NULL, -- "info" | "warn" | "bad"
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
);

-- conversation threads for the AI Assistant
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL, -- "user" | "assistant"
    content TEXT NOT NULL,
    ts INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400 * 1000 AS INTEGER)),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);