/**
 * Audit rules for every state-changing API route.
 *
 * Rules describe what happened in plain words and never include secret values
 * (passwords, tokens, webhook URLs): only which fields changed. Failed requests are
 * described too, so a rejected login or a failed stop is visible.
 *
 * Pure module (no database import) so it can be unit-tested.
 */

export interface AuditContext {
  params: Record<string, string>;
  body: Record<string, unknown>;
  ok: boolean;
  statusCode: number;
}

export interface AuditRecord {
  kind: string;
  message: string;
  serviceKey?: string | null;
}

export type AuditRule = (ctx: AuditContext) => AuditRecord;

/** Turns a service id into its display name; falls back to the id. */
export type NameResolver = (id: string) => string | undefined;

const MAX_DETAIL = 200;

function clip(value: unknown): string {
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;
}


function failed(ctx: AuditContext, message: string): string {
  return ctx.ok ? message : `${message} — failed (HTTP ${ctx.statusCode})`;
}

/** Changed setting names only; values can be secrets and are never logged. */
export function describeSettingsChange(body: Record<string, unknown>): string {
  const keys = Object.keys(body).filter((key) => key !== "notifications");
  const notifications = body.notifications;
  if (notifications && typeof notifications === "object") {
    for (const key of Object.keys(notifications as Record<string, unknown>)) {
      if (key === "rules") {
        const rules = (notifications as Record<string, unknown>).rules;
        if (rules && typeof rules === "object") {
          for (const rule of Object.keys(rules)) keys.push(`rules.${rule}`);
        }
      } else {
        keys.push(`notifications.${key}`);
      }
    }
  }
  return keys.length ? keys.join(", ") : "nothing";
}

const VERB = { start: "started", stop: "stopped", restart: "restarted" } as const;

export function createAuditRules(resolveName: NameResolver): Record<string, AuditRule> {
  const serviceName = (id: string | undefined): string => {
    if (!id) return "unknown service";
    try {
      return resolveName(id) ?? id;
    } catch {
      return id;
    }
  };

  return {
    // --- Services ---
    "POST /api/services/:id/:action": (ctx) => {
      const action = ctx.params.action as keyof typeof VERB;
      const name = serviceName(ctx.params.id);
      return {
        kind: ctx.ok ? action : "fail",
        message: ctx.ok ? `${name} ${VERB[action] ?? action}` : failed(ctx, `${action} ${name}`),
        serviceKey: ctx.params.id,
      };
    },

    // --- Integrations ---
    "POST /api/jenkins/jobs/:job/build": (ctx) => ({
      kind: ctx.ok ? "build" : "fail",
      message: failed(ctx, `Triggered Jenkins build for ${ctx.params.job}`),
    }),
    "POST /api/ollama/models/:name/load": (ctx) => ({
      kind: "ollama.load",
      message: failed(ctx, `Loaded Ollama model ${ctx.params.name}`),
    }),
    "POST /api/ollama/models/:name/unload": (ctx) => ({
      kind: "ollama.unload",
      message: failed(ctx, `Unloaded Ollama model ${ctx.params.name}`),
    }),

    // --- Settings, alerts, notifications ---
    "PUT /api/settings": (ctx) => ({
      kind: "settings.update",
      message:
        !ctx.ok && Object.keys(ctx.body).length === 0
          ? `Settings change rejected (HTTP ${ctx.statusCode})`
          : failed(ctx, `Changed settings: ${describeSettingsChange(ctx.body)}`),
    }),
    "POST /api/alerts/read": (ctx) => ({
      kind: "alerts.read",
      message: failed(ctx, "Marked all alerts as read"),
    }),
    "POST /api/alerts/:id/read": (ctx) => ({
      kind: "alerts.read",
      message: failed(ctx, `Marked alert #${ctx.params.id} as read`),
    }),
    "POST /api/notifications/test": (ctx) => ({
      kind: "notifications.test",
      message: failed(ctx, "Sent a test notification"),
    }),

    // --- Service registry ---
    "POST /api/registry/services": (ctx) => ({
      kind: "service.create",
      message: failed(ctx, `Added service ${clip(ctx.body.name)}`),
      serviceKey: typeof ctx.body.id === "string" ? ctx.body.id : null,
    }),
    "PUT /api/registry/services/reorder": (ctx) => ({
      kind: "service.reorder",
      message: failed(ctx, "Reordered services"),
    }),
    "PUT /api/registry/services/:id": (ctx) => ({
      kind: "service.update",
      message: failed(ctx, `Edited service ${serviceName(ctx.params.id)}`),
      serviceKey: ctx.params.id,
    }),
    "DELETE /api/registry/services/:id": (ctx) => ({
      kind: "service.delete",
      message: failed(ctx, `Removed service ${ctx.params.id}`),
      serviceKey: ctx.params.id,
    }),
    "DELETE /api/registry/services/:id/credential": (ctx) => ({
      kind: "credential.remove",
      message: failed(ctx, `Removed the saved credential for ${serviceName(ctx.params.id)}`),
      serviceKey: ctx.params.id,
    }),
    // Runs a real command on the host, so it is audited even though it changes no data.
    "POST /api/registry/services/test-command": (ctx) => ({
      kind: "command.test",
      message: failed(
        ctx,
        `Test-ran ${ctx.body.runInShell ? "shell " : ""}command in ${clip(ctx.body.folder)}: ${clip(ctx.body.command)}`,
      ),
    }),

    // --- Docker housekeeping ---
    "POST /api/docker/backups/:serviceId": (ctx) => ({
      kind: "backup.create",
      message: failed(ctx, `Backed up the image of ${serviceName(ctx.params.serviceId)}`),
      serviceKey: ctx.params.serviceId,
    }),
    "POST /api/docker/backups/:serviceId/restore": (ctx) => ({
      kind: "backup.restore",
      message: failed(
        ctx,
        `Restored the image of ${serviceName(ctx.params.serviceId)}${ctx.body.name ? ` from ${clip(ctx.body.name)}` : ""}`,
      ),
      serviceKey: ctx.params.serviceId,
    }),
    "POST /api/docker/prune": (ctx) => ({
      kind: "docker.prune",
      message: failed(ctx, "Pruned dangling Docker data"),
    }),

    // --- Auth ---
    "POST /api/auth/setup": (ctx) => ({
      kind: "auth.setup",
      message: failed(ctx, `Created the admin account ${clip(ctx.body.username)}`),
    }),
    "POST /api/auth/login": (ctx) => ({
      kind: "auth.login",
      message: ctx.ok ? "Signed in" : `Sign-in rejected (HTTP ${ctx.statusCode})`,
    }),
    "POST /api/auth/logout": (ctx) => ({
      kind: "auth.logout",
      message: failed(ctx, "Signed out"),
    }),
    "POST /api/auth/password": (ctx) => ({
      kind: "auth.password",
      message: failed(ctx, "Changed the password"),
    }),
  };
}
