import type { FastifyInstance, FastifyRequest } from "fastify";
import { getSessionUser } from "./auth.js";
import { recordActivity } from "./events.js";
import { loadServices } from "./services.js";
import { createAuditRules, type AuditContext } from "./audit-rules.js";

/** Audit trail for every state-changing API request. Rules live in audit-rules.ts. */
export const AUDIT_RULES = createAuditRules(
  (id) => loadServices().find((service) => service.id === id)?.name,
);

function ruleKey(req: FastifyRequest): string | null {
  const url = req.routeOptions?.url;
  if (!url) return null;
  const key = `${req.method} ${url}`;
  return key in AUDIT_RULES ? key : null;
}

/** Register the audit hooks. Call before any routes are declared. */
export function registerAudit(app: FastifyInstance): void {
  // Resolve the actor before the handler runs, because logout deletes the session.
  const actors = new WeakMap<FastifyRequest, string>();

  app.addHook("preHandler", async (req) => {
    if (!ruleKey(req)) return;
    try {
      const user = await getSessionUser(req);
      if (user) actors.set(req, user.username);
    } catch {
      // The actor is best-effort; the request itself must not fail here.
    }
  });

  app.addHook("onResponse", async (req, reply) => {
    const key = ruleKey(req);
    if (!key) return;

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const ctx: AuditContext = {
      params: (req.params ?? {}) as Record<string, string>,
      body,
      ok: reply.statusCode < 400,
      statusCode: reply.statusCode,
    };

    let actor = actors.get(req);
    if (!actor) {
      try {
        actor = (await getSessionUser(req))?.username;
      } catch {
        actor = undefined;
      }
    }
    // Login and setup have no session yet; the submitted username identifies the attempt.
    if (!actor && typeof body.username === "string" && body.username.trim()) {
      actor = body.username.trim().slice(0, 64);
    }

    try {
      const record = AUDIT_RULES[key]!(ctx);
      await recordActivity({
        ...record,
        actor: actor ?? "anonymous",
        outcome: ctx.ok ? "ok" : "failed",
        source: "audit",
      });
    } catch (err) {
      req.log.error({ err }, "Could not write the audit entry");
    }
  });
}
