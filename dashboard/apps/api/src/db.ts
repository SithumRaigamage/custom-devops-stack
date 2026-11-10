import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { bigint, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// PostgreSQL connection (docker compose up -d postgres)
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot";

export const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Migrations – run on startup, forward-only (skip *.down.sql)
// ---------------------------------------------------------------------------

const migrationFiles = readdirSync(new URL("../migrations", import.meta.url))
  .filter((file) => file.endsWith(".sql") && !file.endsWith(".down.sql"))
  .sort();

try {
  for (const file of migrationFiles) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    await pool.query(sql);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `PostgreSQL is unavailable (${message}). Start it with: docker compose up -d postgres`,
  );
}

// ---------------------------------------------------------------------------
// Drizzle client and schema
// ---------------------------------------------------------------------------

export const db = drizzle(pool);

// services – mirror of the Docker Compose inventory (for FK convenience)
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  compose_id: text("compose_id").notNull().unique(),
  name: text("name").notNull(),
  folder: text("folder").notNull(),
  url: text("url").notNull(),
  health: text("health").notNull(),
});

// users – local account (single-user)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  created_at: text("created_at").notNull(),
});

// sessions – opaque session tokens for auth cookies
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
});

// settings – per-user (currently single-user) app settings
export const settings = pgTable("settings", {
  key: text("key").notNull().primaryKey(),
  value: text("value").notNull(), // JSON-encoded
});

// activity log – every UI action + API status change
export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  service_id: integer("service_id").references(() => services.id),
  message: text("message").notNull(),
  actor: text("actor").notNull().default("user"),
});

// metrics – time-series for CPU / memory per service
export const metrics = pgTable("metrics", {
  ts: bigint("ts", { mode: "number" }).notNull(),
  service_id: integer("service_id").references(() => services.id),
  service_key: text("service_key").notNull(),
  service_name: text("service_name").notNull(),
  cpu: real("cpu").notNull(),
  mem_bytes: real("mem_bytes").notNull(),
  mem_pct: real("mem_pct").notNull(),
});

// alerts – generated when a metric exceeds a rule
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  rule: text("rule").notNull(),
  severity: text("severity").notNull(), // "info" | "warn" | "bad"
  message: text("message").notNull(),
  read: integer("read").notNull().default(0), // 0/1
});

// conversation threads for the AI Assistant
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  created_at: text("created_at").notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  ts: bigint("ts", { mode: "number" }).notNull(),
});
