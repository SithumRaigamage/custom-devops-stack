import "dotenv/config";
import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { bigint, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";
import { parse } from "yaml";

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

async function importLegacyServices(): Promise<void> {
  const legacyPath = new URL("../../../services.yaml", import.meta.url);
  const backupPath = new URL("../../../services.yaml.bak", import.meta.url);
  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM services");
  if (Number(rows[0]?.count ?? 0) > 0 || !existsSync(legacyPath)) return;

  const doc = parse(readFileSync(legacyPath, "utf8")) as { services?: Array<Record<string, unknown>> };
  const entries = Array.isArray(doc?.services) ? doc.services : [];
  const now = Date.now();
  for (const [index, entry] of entries.entries()) {
    const folder = String(entry.folder ?? "");
    const workingDir = folder === "~" || folder.startsWith("~/")
      ? `${homedir()}${folder.slice(1)}`
      : folder;
    const url = String(entry.url ?? "");
    const health = String(entry.health ?? `${url}/`);
    const portValue = Number(entry.port ?? (() => {
      try {
        const parsed = new URL(url);
        return parsed.port ? Number(parsed.port) : null;
      } catch {
        return null;
      }
    })());
    await pool.query(
      `INSERT INTO services
        (compose_id, name, description, folder, url, health, type, working_dir,
         compose_file, port, health_url, start_cmd, stop_cmd, restart_cmd, logs_cmd,
         sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'compose',$7,$8,$9,$6,$10,$11,'docker compose restart','docker compose logs',
               $12,$13,$13)`,
      [
        String(entry.id ?? `service-${index + 1}`),
        String(entry.name ?? entry.id ?? "Service"),
        String(entry.desc ?? ""),
        folder,
        url,
        health,
        workingDir,
        String(entry.composeFile ?? "docker-compose.yml"),
        Number.isInteger(portValue) ? portValue : null,
        typeof entry.startCommand === "string" ? entry.startCommand : null,
        typeof entry.stopCommand === "string" ? entry.stopCommand : null,
        index,
        now,
      ],
    );
  }
  renameSync(legacyPath, backupPath);
}

await importLegacyServices();
await pool.query(
  `UPDATE services SET working_dir = $1 || SUBSTRING(working_dir FROM 2)
   WHERE working_dir LIKE '~/%'`,
  [homedir()],
);

// services – mirror of the Docker Compose inventory (for FK convenience)
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  compose_id: text("compose_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon"),
  type: text("type").notNull().default("compose"),
  folder: text("folder").notNull(),
  working_dir: text("working_dir"),
  compose_file: text("compose_file").notNull().default("docker-compose.yml"),
  port: integer("port"),
  url: text("url").notNull(),
  health: text("health").notNull(),
  health_url: text("health_url"),
  start_cmd: text("start_cmd"),
  stop_cmd: text("stop_cmd"),
  restart_cmd: text("restart_cmd"),
  logs_cmd: text("logs_cmd"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
});

export const serviceRuns = pgTable("service_runs", {
  id: serial("id").primaryKey(),
  service_key: text("service_key").notNull(),
  action: text("action").notNull(),
  command: text("command").notNull(),
  ok: integer("ok").notNull(),
  output: text("output").notNull().default(""),
  ts: bigint("ts", { mode: "number" }).notNull(),
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

// status_samples – seven-day service status history for uptime and strips
export const statusSamples = pgTable("status_samples", {
  ts: bigint("ts", { mode: "number" }).notNull(),
  service_key: text("service_key").notNull(),
  service_name: text("service_name").notNull(),
  status: text("status").notNull(),
});

// alerts – incidents generated by the alert engine, resolved on recovery
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  ts: bigint("ts", { mode: "number" }).notNull(),
  rule: text("rule").notNull(),
  severity: text("severity").notNull(), // "info" | "warn" | "bad"
  message: text("message").notNull(),
  read: integer("read").notNull().default(0), // 0/1
  incident_key: text("incident_key"),
  service_key: text("service_key"),
  link: text("link"),
  resolved_at: bigint("resolved_at", { mode: "number" }),
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
