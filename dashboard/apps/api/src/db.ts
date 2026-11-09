import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Database path – defaults to the env‑provided path ( ./data/stackpilot.db )
// ---------------------------------------------------------------------------

const DbPath = process.env.DATABASE_PATH ?? "./data/stackpilot.db";

// Ensure the parent directory exists
import { mkdirSync } from "node:fs";
import { existsSync } from "node:fs";
const parentDir = DbPath.replace(/[^/]+$/, "");
if (parentDir && !existsSync(parentDir)) {
	mkdirSync(parentDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Run migrations on first use (development only)
// ---------------------------------------------------------------------------

const migrationDir = new URL("../migrations", import.meta.url).pathname;
const fs = await import("node:fs");
const path = await import("node:path");
const migrationFiles = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();

for (const file of migrationFiles) {
	const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
	const statements = sql.split(";").filter((s) => s.trim());
	for (const stmt of statements) {
		if (stmt.trim()) {
			const db = new Database(DbPath, { readonly: false });
			db.exec(stmt);
			db.close();
		}
	}
}

// ---------------------------------------------------------------------------
// Raw SQLite database instance (lazy – created when first needed)
// ---------------------------------------------------------------------------

let rawDb: Database.Database | null = null;
export function getDb() {
	if (!rawDb) {
		rawDb = new Database(DbPath, { readonly: false });
	}
	return rawDb;
}

// ---------------------------------------------------------------------------
// Drizzle‑powered DB (re‑exported so API routes can use the schema directly)
// ---------------------------------------------------------------------------

export const db = drizzle(getDb());

// ---------------------------------------------------------------------------
// Schema – all tables for the dashboard + assistant
// ---------------------------------------------------------------------------
// NOTE: drizzle‑orm infers types from the sqliteTable definitions.
// Default values for `ts` columns are applied in the code that inserts rows.

// services – mirror of the Docker Compose inventory (for FK convenience)
export const services = sqliteTable("services", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	compose_id: text("compose_id").notNull().unique(),
	name: text("name").notNull(),
	folder: text("folder").notNull(),
	url: text("url").notNull(),
	health: text("health").notNull(),
});

// users – local account (single‑user)
export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	password_hash: text("password_hash").notNull(),
	created_at: text("created_at").notNull(),
});

// sessions – for auth cookies / JWT revocation
export const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	user_id: integer("user_id").notNull().references(() => users.id),
	expires_at: integer("expires_at").notNull(),
});

// settings – per‑user (currently single‑user) app settings
export const settings = sqliteTable("settings", {
	key: text("key").notNull().primaryKey(),
	value: text("value").notNull(), // JSON‑encoded
});

// activity log – every UI action + API status change
export const activity = sqliteTable("activity", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	ts: integer("ts").notNull(),
	kind: text("kind").notNull(),
	service_id: integer("service_id").references(() => services.id),
	message: text("message").notNull(),
	actor: text("actor").notNull().default("user"),
});

// metrics – time‑series for CPU / memory per service
export const metrics = sqliteTable("metrics", {
	ts: integer("ts").notNull(),
	service_id: integer("service_id").notNull().references(() => services.id),
	cpu: real("cpu").notNull(),
	mem_bytes: real("mem_bytes").notNull(),
	mem_pct: real("mem_pct").notNull(),
});

// alerts – generated when a metric exceeds a rule
export const alerts = sqliteTable("alerts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	ts: integer("ts").notNull(),
	rule: text("rule").notNull(),
	severity: text("severity").notNull(), // "info" | "warn" | "bad"
	message: text("message").notNull(),
	read: integer("read").notNull().default(0), // 0/1 in SQLite
});

// conversation threads for the AI Assistant
export const conversations = sqliteTable("conversations", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	user_id: integer("user_id").notNull().references(() => users.id),
	created_at: text("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	conversation_id: integer("conversation_id").notNull().references(() => conversations.id),
	role: text("role").notNull(), // "user" | "assistant"
	content: text("content").notNull(),
	ts: integer("ts").notNull(),
});