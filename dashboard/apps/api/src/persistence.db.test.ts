import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-1234";

// Importing db.ts applies the migrations, so this suite needs a real PostgreSQL:
//   docker compose up -d postgres && pnpm test:db
// `pnpm test` deliberately excludes it so the unit suite runs without Docker.
const { pool } = await import("./db.js");
const { listRegistryServices } = await import("./registry.js");

const EXPECTED_TABLES = [
  "activity",
  "alerts",
  "conversations",
  "messages",
  "metrics",
  "service_credentials",
  "service_runs",
  "services",
  "sessions",
  "settings",
  "status_samples",
  "users",
];

test("migrations create the dashboard schema", async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const tables = new Set(rows.map((row) => row.table_name));
  for (const table of EXPECTED_TABLES) {
    assert.ok(tables.has(table), `missing table: ${table}`);
  }
});

test("the service registry reads its rows from PostgreSQL", async () => {
  const services = await listRegistryServices();
  assert.ok(Array.isArray(services));
  for (const service of services) {
    assert.equal(typeof service.id, "string");
    assert.equal(typeof service.name, "string");
    assert.equal(typeof service.runInShell, "boolean");
  }
});

after(async () => {
  await pool.end();
});
