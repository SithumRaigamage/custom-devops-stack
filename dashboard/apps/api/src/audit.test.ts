import assert from "node:assert/strict";
import test from "node:test";
import { createAuditRules, describeSettingsChange, type AuditContext } from "./audit-rules.js";
import { activityWhere } from "./activity-filter.js";

const rules = createAuditRules((id) => (id === "jenkins" ? "Jenkins" : undefined));

function ctx(partial: Partial<AuditContext>): AuditContext {
  return { params: {}, body: {}, ok: true, statusCode: 200, ...partial };
}

test("service actions name the service and record failures", () => {
  const rule = rules["POST /api/services/:id/:action"]!;
  assert.deepEqual(rule(ctx({ params: { id: "jenkins", action: "stop" } })), {
    kind: "stop",
    message: "Jenkins stopped",
    serviceKey: "jenkins",
  });
  const failed = rule(ctx({ params: { id: "jenkins", action: "start" }, ok: false, statusCode: 500 }));
  assert.equal(failed.kind, "fail");
  assert.match(failed.message, /start Jenkins — failed \(HTTP 500\)/);
});

test("unknown service ids fall back to the id", () => {
  const rule = rules["PUT /api/registry/services/:id"]!;
  assert.equal(rule(ctx({ params: { id: "ghost" } })).message, "Edited service ghost");
});

test("settings changes list field names, never secret values", () => {
  const body = {
    theme: "midnight-teal",
    notifications: { discordWebhookUrl: "https://discord.com/api/webhooks/SECRET", rules: { serviceStopped: true } },
  };
  const message = rules["PUT /api/settings"]!(ctx({ body })).message;
  assert.equal(message, "Changed settings: theme, notifications.discordWebhookUrl, rules.serviceStopped");
  assert.doesNotMatch(message, /SECRET/);
  assert.equal(describeSettingsChange({}), "nothing");
  assert.equal(
    rules["PUT /api/settings"]!(ctx({ ok: false, statusCode: 401 })).message,
    "Settings change rejected (HTTP 401)",
  );
});

test("login and password rules never include the password", () => {
  const body = { username: "sithum", password: "hunter2", currentPassword: "a", newPassword: "b" };
  for (const key of ["POST /api/auth/login", "POST /api/auth/password", "POST /api/auth/setup"]) {
    const record = rules[key]!(ctx({ body, ok: false, statusCode: 401 }));
    assert.doesNotMatch(record.message, /hunter2|newPassword/);
  }
  assert.equal(rules["POST /api/auth/login"]!(ctx({ ok: false, statusCode: 401 })).message, "Sign-in rejected (HTTP 401)");
});

test("long test commands are clipped", () => {
  const message = rules["POST /api/registry/services/test-command"]!(
    ctx({ body: { folder: "jenkins", command: "x".repeat(500), runInShell: true } }),
  ).message;
  assert.ok(message.length < 300);
  assert.match(message, /^Test-ran shell command in jenkins: x+…$/);
});

test("activityWhere binds every value as a parameter", () => {
  assert.deepEqual(activityWhere({}), { sql: "", params: [] });
  const where = activityWhere({ kind: "service.*", actor: "sithum", outcome: "failed", from: 1, to: 2, beforeId: 9 });
  assert.equal(where.sql, "WHERE id < $1 AND kind LIKE $2 AND actor = $3 AND outcome = $4 AND ts >= $5 AND ts <= $6");
  assert.deepEqual(where.params, [9, "service.%", "sithum", "failed", 1, 2]);
});

test("activityWhere escapes LIKE wildcards in search text", () => {
  const where = activityWhere({ q: "100%_done'; DROP TABLE activity;--" });
  assert.equal(where.sql, "WHERE message ILIKE $1");
  assert.deepEqual(where.params, ["%100\\%\\_done'; DROP TABLE activity;--%"]);
});
