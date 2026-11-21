-- 001_init.down.sql
-- Drop all tables (reverse order due to FK constraints)

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS services;