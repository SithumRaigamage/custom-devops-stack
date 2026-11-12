import { spawn } from "node:child_process";
import Fastify, { type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { COMMAND_TIMEOUT_MS, describeInvocation, runCompose, runCustomCommand, serviceCwd } from "./compose.js";
import { loadServices } from "./services.js";
import { getServiceDetails } from "./status.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { authRoutes, getSessionUser } from "./auth.js";
import { activityFacets, listActivity, startServiceMonitor } from "./events.js";
import { registerAudit } from "./audit.js";
import { addEventClient } from "./sse.js";
import { parseLogLine, parseLogText } from "./logs.js";
import {
  isJenkinsConfigured,
  jenkinsConsole,
  jenkinsSummary,
  listJenkinsBuilds,
  triggerJenkinsBuild,
} from "./jenkins.js";
import {
  isSonarConfigured,
  listSonarProjects,
  sonarProject,
} from "./sonar.js";
import {
  ollamaChat,
  ollamaLoadModel,
  ollamaModels,
  ollamaRunning,
  ollamaStatus,
  ollamaUnloadModel,
} from "./ollama.js";
import {
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
  sendTestNotification,
  setIntentionalStop,
} from "./alerts.js";
import { parseMetricsRange, readMetricsRange, startMetricsSampler } from "./metrics.js";
import { listIncidents } from "./incidents.js";
import { readUptime } from "./uptime.js";
import {
  getSettings,
  publicSettings,
  SettingsUpdateSchema,
  updateSettings,
} from "./settings.js";
import {
  createService,
  deleteService,
  listFolders,
  listRegistryServices,
  RegistryError,
  updateService,
  testService,
  reorderServices,
  ServiceInputSchema,
  CommandTestBody,
  IntegrationTestBody,
  testCommand,
  testIntegration,
  removeServiceCredential,
} from "./registry.js";
import {
  createImageBackup,
  HousekeepingError,
  listDockerBackups,
  pruneDangling,
  prunePreview,
  readDiskUsage,
  restoreImageBackup,
} from "./housekeeping.js";
import { pool } from "./db.js";

const HOST = "127.0.0.1";
const PORT = 4000;

const ACTION_TIMEOUT_MS = 5 * 60 * 1000;
const LOGS_TIMEOUT_MS = 15 * 1000;
const DEFAULT_TAIL = 100;
const MAX_TAIL = 5000;


async function recordServiceRun(
  serviceId: string,
  action: string,
  command: string,
  ok: boolean,
  output: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO service_runs (service_key, action, command, ok, output, ts)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [serviceId, action, command, ok ? 1 : 0, output.slice(0, 100_000), Date.now()],
  );
}

// Pino redaction: cookies, auth headers and any secret-looking field in logged objects.
// Paths are pino paths (one wildcard level); values are replaced, keys are kept.
const SECRET_KEYS = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "apiToken",
  "secret",
  "headerValue",
  "discordWebhookUrl",
  "SESSION_SECRET",
  "DATABASE_URL",
  "JENKINS_API_TOKEN",
  "SONAR_TOKEN",
];
export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((key) => `*.${key}`),
  ...SECRET_KEYS.map((key) => `*.*.${key}`),
];

// Rate-limit tiers, applied per route through `config.rateLimit`.
const ACTION_LIMIT = { rateLimit: { max: 30, timeWindow: "1 minute" } } as const;

function parseTail(raw: string | undefined): number | null {
  const value = raw ?? String(DEFAULT_TAIL);
  if (!/^\d+$/.test(value)) return null;
  const tail = Number(value);
  return Number.isInteger(tail) && tail >= 1 && tail <= MAX_TAIL ? tail : null;
}

function requestParams(req: { params: unknown }): Record<string, string> {
  return req.params as Record<string, string>;
}

function requestQuery(req: { query: unknown }): Record<string, string | undefined> {
  return req.query as Record<string, string | undefined>;
}

function requestBody(req: { body: unknown }): Record<string, unknown> {
  return req.body as Record<string, unknown>;
}

// Database-backed service snapshots are refreshed after registry mutations.
const initialServices = loadServices();

const app = Fastify({
  logger: {
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
  },
});

app.setValidatorCompiler(({ schema }) => {
  const validator = schema as {
    safeParse?: (value: unknown) => {
      success: boolean;
      data?: unknown;
      error?: unknown;
    };
  };

  return (data: unknown): boolean | { value: unknown } | { error: Error } => {
    if (typeof validator.safeParse !== "function") return true;
    const result = validator.safeParse(data);
    return result.success
      ? { value: result.data }
      : { error: result.error instanceof Error ? result.error : new Error("Validation failed") };
  };
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
});

await app.register(rateLimit, { global: false });

// Rate-limit tiers applied via per-route `config.rateLimit`:
// login 5/min (on /api/auth/login in auth.ts), actions 30/min (mutating routes),
// assistant 10/min (/api/assistant/chat).

// State-changing requests are simple cross-site POSTs a browser sends without a
// preflight, so refuse any that carry a foreign Origin header. PUT/DELETE/PATCH
// are just as reachable cross-site and must be covered too.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "OPTIONS") return;
  const origin = req.headers.origin;
  const allowedOrigins = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);
  if (
    MUTATING_METHODS.has(req.method) &&
    origin !== undefined &&
    origin !== null &&
    !allowedOrigins.has(origin)
  ) {
    return reply.code(403).send({ error: "Origin not allowed" });
  }
});

// Every API route except the auth handshake and health probe needs a session.
// The browser reaches the API through the Next.js same-origin rewrite, so the
// HttpOnly session cookie is forwarded automatically.
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "OPTIONS") return;
  const path = req.url.split("?")[0] ?? "";
  if (path.startsWith("/api/auth/") || path === "/api/health") return;

  try {
    if (!(await getSessionUser(req))) {
      return reply.code(401).send({ error: "Unauthenticated" });
    }
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "auth_unavailable" });
  }
});

// Audit trail for every state-changing request; must run before routes are declared.
registerAudit(app);

app.get(
  "/api/services",
  {
    schema: {
      querystring: z.object({}).strict(),
    },
  },
  async (_req, reply) => {
    if (!(await isDockerAvailable())) {
      return reply.code(503).send({ error: "docker_unavailable" });
    }

    const services = loadServices();
    const byProject = await listContainersByProject();
    return Promise.all(
      services.map((service) =>
        getServiceDetails(service, byProject.get(projectNameForFolder(service.folder))),
      ),
    );
  },
);

app.post(
  "/api/services/:id/:action",
  {
    schema: {
      params: z.object({ id: z.string(), action: z.enum(["start", "stop", "restart"]) }),
      body: z.object({}).strict().nullish(),
    },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    const service = loadServices().find((entry) => entry.id === requestParams(req).id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${requestParams(req).id}"` });

    const action = requestParams(req).action;


    // A stop the user asked for is not an incident; the next start/restart clears it.
    if (action === "stop") setIntentionalStop(service.id, true);
    else setIntentionalStop(service.id, false);

    try {
      const outputs: string[] = [];
      let executedCommand = "";
      const customCommand = action === "start"
        ? service.startCommand
        : action === "stop"
          ? service.stopCommand
          : service.restartCommand;
      // Custom services always use their commands; compose services use them only in shell mode.
      if (service.type === "compose" && !(service.runInShell && customCommand)) {
        const composeAction = action === "start" ? "up" : action === "stop" ? "down" : "restart";
        executedCommand = `docker compose -f ${service.composeFile} ${composeAction}`;
        const args = composeAction === "up" ? ["up", "-d"] : [composeAction];
        const result = await runCompose(service, args, ACTION_TIMEOUT_MS);
        outputs.push(result.stdout, result.stderr);
      } else {
        const command = customCommand;
        if (!command) {
          return reply.code(500).send({
            id: service.id,
            action,
            ok: false,
            error: `No ${action} command configured for ${service.name}`,
          });
        }
        executedCommand = describeInvocation(command, service.runInShell);
        const result = await runCustomCommand(
          service,
          command,
          service.runInShell ? COMMAND_TIMEOUT_MS : ACTION_TIMEOUT_MS,
        );
        outputs.push(result.stdout, result.stderr);
      }
      await recordServiceRun(service.id, action, executedCommand, true, outputs.join(""));
      // The activity/audit entry is written by the audit hook (audit.ts) for success and failure.

      return { id: service.id, action, ok: true, output: outputs.join("").trim() };
    } catch (err) {
      if (action === "stop") setIntentionalStop(service.id, false);
      req.log.error(err);
      const detail = err as { stderr?: string; message: string };
      await recordServiceRun(
        service.id,
        action,
        service.type === "compose" && !service.runInShell
          ? `docker compose -f ${service.composeFile} ${action}`
          : describeInvocation(
              service[`${action}Command` as "startCommand" | "stopCommand" | "restartCommand"] ?? "",
              service.runInShell,
            ),
        false,
        (detail.stderr || detail.message).trim(),
      ).catch(() => undefined);
      return reply
        .code(500)
        .send({ id: service.id, action, ok: false, error: (detail.stderr || detail.message).trim() });
    }
  },
);

app.get(
  "/api/services/:id/logs",
  {
    schema: {
      params: z.object({ id: z.string() }),
      querystring: z.object({ tail: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    const service = loadServices().find((entry) => entry.id === requestParams(req).id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${requestParams(req).id}"` });

    const tail = parseTail(requestQuery(req).tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }

    try {
      if (service.type === "custom") {
        if (!service.logsCommand) {
          return reply.code(500).send({ error: `No logs command configured for ${service.name}` });
        }
        const { stdout, stderr } = await runCustomCommand(service, service.logsCommand, LOGS_TIMEOUT_MS);
        return { id: service.id, tail, lines: parseLogText(stdout + stderr) };
      }
      const { stdout, stderr } = await runCompose(
        service,
        ["logs", "--no-color", "--no-log-prefix", "--timestamps", "--tail", String(tail)],
        LOGS_TIMEOUT_MS,
      );
      return { id: service.id, tail, lines: parseLogText(stdout + stderr) };
    } catch (err) {
      req.log.error(err);
      const detail = err as { stderr?: string; message: string };
      return reply.code(500).send({ error: (detail.stderr || detail.message).trim() });
    }
  },
);

// Follow new log lines over SSE. The initial tail is fetched by the drawer; this
// stream only carries lines written after it connects.
app.get(
  "/api/services/:id/logs/stream",
  {
    schema: {
      params: z.object({ id: z.string() }),
      querystring: z.object({ tail: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    const service = loadServices().find((entry) => entry.id === requestParams(req).id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${requestParams(req).id}"` });

    const tail = parseTail(requestQuery(req).tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }
    if (service.type === "custom") {
      if (!service.logsCommand) return reply.code(500).send({ error: `No logs command configured for ${service.name}` });
      try {
        const { stdout, stderr } = await runCustomCommand(service, service.logsCommand, LOGS_TIMEOUT_MS);
        return { id: service.id, tail, lines: parseLogText(stdout + stderr) };
      } catch (err) {
        const detail = err as { stderr?: string; message: string };
        return reply.code(500).send({ error: (detail.stderr || detail.message).trim() });
      }
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");

    const child = spawn(
      "docker",
      [
        "compose",
        "-f",
        service.composeFile,
        "logs",
        "--no-color",
        "--no-log-prefix",
        "--timestamps",
        "--tail",
        String(tail),
        "--follow",
      ],
      { cwd: serviceCwd(service) },
    );

    let buffer = "";
    const send = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim() || res.writableEnded) continue;
        res.write(`data: ${JSON.stringify(parseLogLine(line))}\n\n`);
      }
    };

    child.stdout?.on("data", send);
    child.stderr?.on("data", send);

    const stop = () => {
      if (!child.killed) child.kill("SIGTERM");
    };

    req.raw.on("close", stop);
    req.raw.on("error", stop);
    child.on("error", (err) => {
      req.log.error(err);
      if (!res.writableEnded) res.end();
    });
    child.on("close", () => {
      if (!res.writableEnded) res.end();
    });

    return reply;
  },
);

/** Optional `?service=<id>` selects which service's integration to use (default: the first of that kind). */
const ServiceQuery = z.object({ service: z.string().optional() }).strict();
const sid = (req: unknown): string | undefined => (requestQuery(req as never) as { service?: string }).service;

// ---- Jenkins --------------------------------------------------------------

app.get(
  "/api/jenkins/builds",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    if (!(await isJenkinsConfigured(sid(req)))) return { configured: false, builds: [] };
    try {
      return { configured: true, builds: await listJenkinsBuilds(sid(req)) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Jenkins is unavailable",
      });
    }
  },
);

app.get(
  "/api/jenkins/summary",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    if (!(await isJenkinsConfigured(sid(req)))) {
      return {
        configured: false,
        successRate: 0,
        averageDurationMs: 0,
        running: 0,
        failedToday: 0,
      };
    }
    try {
      return { configured: true, ...(await jenkinsSummary(sid(req))) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Jenkins is unavailable",
      });
    }
  },
);

app.post(
  "/api/jenkins/jobs/:job/build",
  {
    schema: {
      params: z.object({ job: z.string() }),
      querystring: ServiceQuery,
      body: z.object({}).strict().nullish(),
    },
  },
  async (req, reply) => {
    if (!(await isJenkinsConfigured(sid(req)))) {
      return reply.code(400).send({ error: "Jenkins is not configured" });
    }
    if (!requestParams(req).job) return reply.code(400).send({ error: "Job is required" });

    try {
      await triggerJenkinsBuild(requestParams(req).job, sid(req));
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not trigger the Jenkins build",
      });
    }
  },
);

app.get(
  "/api/jenkins/jobs/:job/:num/console",
  {
    schema: {
      params: z.object({ job: z.string(), num: z.string() }),
      querystring: z.object({ tail: z.string().optional(), service: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    if (!(await isJenkinsConfigured(sid(req)))) return { configured: false, lines: [] };

    const num = Number(requestParams(req).num);
    if (!Number.isInteger(num) || num < 1) {
      return reply.code(400).send({ error: "Build number must be a positive integer" });
    }
    const tail = parseTail(requestQuery(req).tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }

    try {
      return { configured: true, lines: await jenkinsConsole(requestParams(req).job, num, tail, sid(req)) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not read the Jenkins console",
      });
    }
  },
);

// ---- SonarQube ------------------------------------------------------------

app.get(
  "/api/sonar/projects",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    if (!(await isSonarConfigured(sid(req)))) return { configured: false, projects: [] };
    try {
      return { configured: true, projects: await listSonarProjects(sid(req)) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "SonarQube is unavailable",
      });
    }
  },
);

app.get(
  "/api/sonar/projects/:key",
  {
    schema: {
      params: z.object({ key: z.string() }),
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    if (!(await isSonarConfigured(sid(req)))) return { configured: false, key: requestParams(req).key };
    try {
      return { configured: true, ...(await sonarProject(requestParams(req).key, sid(req))) };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not read the SonarQube project",
      });
    }
  },
);

// ---- Ollama ---------------------------------------------------------------

app.get(
  "/api/ollama/status",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req) => ollamaStatus(sid(req)),
);

app.get(
  "/api/ollama/models",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    try {
      return await ollamaModels(sid(req));
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not reach Ollama",
      });
    }
  },
);

app.get(
  "/api/ollama/running",
  {
    schema: {
      querystring: ServiceQuery,
    },
  },
  async (req, reply) => {
    try {
      return await ollamaRunning(sid(req));
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not reach Ollama",
      });
    }
  },
);

app.post(
  "/api/ollama/models/:name/load",
  {
    schema: {
      params: z.object({ name: z.string() }),
      querystring: ServiceQuery,
      body: z.object({}).strict().nullish(),
    },
  },
  async (req, reply) => {
    try {
      await ollamaLoadModel(requestParams(req).name, sid(req));
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not load the Ollama model",
      });
    }
  },
);

app.post(
  "/api/ollama/models/:name/unload",
  {
    schema: {
      params: z.object({ name: z.string() }),
      querystring: ServiceQuery,
      body: z.object({}).strict().nullish(),
    },
  },
  async (req, reply) => {
    try {
      await ollamaUnloadModel(requestParams(req).name, sid(req));
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Could not unload the Ollama model",
      });
    }
  },
);

// ---- Activity and assistant -----------------------------------------------

const ActivityQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    before: z.coerce.number().int().min(1).optional(),
    kind: z.string().trim().min(1).max(64).regex(/^[a-z_.]+\*?$/i, "Invalid kind").optional(),
    actor: z.string().trim().min(1).max(64).optional(),
    service: z.string().trim().min(1).max(128).optional(),
    source: z.enum(["event", "audit"]).optional(),
    outcome: z.enum(["ok", "failed"]).optional(),
    from: z.coerce.number().int().min(0).optional(),
    to: z.coerce.number().int().min(0).optional(),
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

app.get(
  "/api/activity",
  { schema: { querystring: ActivityQuery } },
  async (req, reply) => {
    const query = req.query as z.infer<typeof ActivityQuery>;
    try {
      return await listActivity({
        limit: query.limit ?? 50,
        beforeId: query.before,
        kind: query.kind,
        actor: query.actor,
        service: query.service,
        source: query.source,
        outcome: query.outcome,
        from: query.from,
        to: query.to,
        q: query.q,
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "activity_unavailable" });
    }
  },
);

app.get(
  "/api/activity/facets",
  { schema: { querystring: z.object({}).strict() } },
  async (req, reply) => {
    try {
      return await activityFacets();
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "activity_unavailable" });
    }
  },
);

app.post(
  "/api/assistant/chat",
  {
    schema: {
      body: z.object({
        message: z.string().min(1).max(8000),
        model: z.string().optional(),
      }).strict(),
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const body = requestBody(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "gpt-oss:20b";

    if (!message) return reply.code(400).send({ error: "Message is required" });
    if (message.length > 8000) {
      return reply.code(400).send({ error: "Message must be 8000 characters or fewer" });
    }

    try {
      const answer = await ollamaChat(model, [
        {
          role: "system",
          content:
            "You are StackPilot, a concise assistant for a local DevOps stack. Help with Docker Compose services, Jenkins builds, SonarQube quality gates, logs, and service health. Say when you do not have enough live data instead of inventing it. You are strictly read-only: never run commands, never trigger builds, never stop or start services.",
        },
        { role: "user", content: message },
      ]);

      if (!answer) {
        return reply.code(502).send({ error: "Ollama returned an empty response" });
      }
      return { reply: answer };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "The assistant is unavailable",
      });
    }
  },
);

// Auth routes
await authRoutes(app);

// ---- Settings -------------------------------------------------------------

app.get(
  "/api/settings",
  {
    schema: {
      querystring: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    try {
      return publicSettings(await getSettings());
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "settings_unavailable" });
    }
  },
);

app.put(
  "/api/settings",
  {
    schema: {
      body: z.object({
        stackRoot: z.string().trim().min(1).max(1024).optional(),
        healthCheckIntervalSeconds: z.number().int().min(2).max(300).optional(),
        theme: z.string().trim().min(1).max(64).optional(),
        mode: z.enum(["light", "dark"]).optional(),
        notifications: z.object({
          desktop: z.boolean().optional(),
          confirmStopAll: z.boolean().optional(),
          autoRefresh: z.boolean().optional(),
          rules: z.object({
            serviceStopped: z.boolean().optional(),
            serviceUnhealthy: z.boolean().optional(),
            jenkinsFailed: z.boolean().optional(),
            sonarGateFailed: z.boolean().optional(),
            ollamaUnreachable: z.boolean().optional(),
          }).strict().optional(),
          discordWebhookUrl: z.string().trim().max(2048).refine((v) => v === "" || /^https?:\/\//i.test(v), {
            message: "Discord webhook must be an http(s) URL",
          }).optional(),
        }).strict().refine((v) => Object.keys(v).length > 0, {
          message: "No notification settings provided",
        }).optional(),
      }).strict().refine((v) => Object.keys(v).length > 0, {
        message: "No settings provided",
      }),
    },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    try {
      return publicSettings(await updateSettings(requestBody(req)));
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "settings_unavailable" });
    }
  },
);

// ---- Alerts ---------------------------------------------------------------

app.get(
  "/api/alerts",
  {
    schema: {
      querystring: z.object({ limit: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    const raw = requestQuery(req).limit;
    const limit = raw === undefined ? 50 : Number(raw);

    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return reply.code(400).send({ error: "limit must be an integer from 1 to 200" });
    }

    try {
      return await listAlerts(limit);
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "alerts_unavailable" });
    }
  },
);

app.post("/api/alerts/read", {
  schema: { body: z.object({}).strict().nullish() },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    const count = await markAllAlertsRead();
    return { ok: true, count };
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "alerts_unavailable" });
  }
});

app.post<{ Params: { id: string } }>(
  "/api/alerts/:id/read",
  {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({}).strict().nullish(),
    },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    const id = Number(requestParams(req).id);
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: "Invalid alert id" });
    }

    try {
      const updated = await markAlertRead(id);
      if (!updated) return reply.code(404).send({ error: `Unknown alert "${requestParams(req).id}"` });
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "alerts_unavailable" });
    }
  },
);

app.post("/api/notifications/test", {
  schema: { body: z.object({}).strict().nullish() },
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
}, async (req, reply) => {
  try {
    const result = await sendTestNotification();
    if (result.discord === "not_configured") {
      return reply.code(400).send({
        error: "Configure a Discord webhook first",
        ...result,
      });
    }
    return result;
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "notification_test_failed" });
  }
});

// ---- Service registry -----------------------------------------------------

function sendRegistryError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof RegistryError) return reply.code(err.status).send({ error: err.message });
  return reply.code(500).send({ error: "registry_error" });
}

app.get("/api/registry/services", { schema: { querystring: z.object({}).strict() } }, async (_req, reply) => {
  try {
    return await listRegistryServices();
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.get("/api/registry/folders", { schema: { querystring: z.object({}).strict() } }, async (_req, reply) => {
  try {
    return await listFolders();
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.post(
  "/api/registry/services",
  {
    schema: {
      body: ServiceInputSchema,
    },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    try {
      return reply.code(201).send(await createService(requestBody(req)));
    } catch (err) {
      return sendRegistryError(reply, err);
    }
  },
);

app.put("/api/registry/services/reorder", {
  schema: { body: z.object({ ids: z.array(z.string().max(128)).min(1).max(500) }).strict() },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    const ids = requestBody(req).ids;
    await reorderServices(Array.isArray(ids) && ids.every((id): id is string => typeof id === "string") ? ids : []);
    return { ok: true };
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.put("/api/registry/services/:id", {
  schema: {
    params: z.object({ id: z.string() }),
    body: ServiceInputSchema,
  },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    return await updateService(requestParams(req).id, requestBody(req));
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.post(
  "/api/registry/services/test",
  {
    schema: {
      body: ServiceInputSchema,
    },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    try {
      return await testService(requestBody(req));
    } catch (err) {
      return sendRegistryError(reply, err);
    }
  },
);

app.post(
  "/api/registry/services/test-command",
  {
    schema: { body: CommandTestBody },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    try {
      return await testCommand(requestBody(req));
    } catch (err) {
      return sendRegistryError(reply, err);
    }
  },
);

app.post(
  "/api/registry/integrations/test",
  {
    schema: { body: IntegrationTestBody },
    config: ACTION_LIMIT,
  },
  async (req, reply) => {
    try {
      return await testIntegration(requestBody(req));
    } catch (err) {
      return sendRegistryError(reply, err);
    }
  },
);

app.delete("/api/registry/services/:id/credential", {
  schema: { params: z.object({ id: z.string() }) },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    await removeServiceCredential(requestParams(req).id);
    return { ok: true };
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.delete("/api/registry/services/:id", {
  schema: {
    params: z.object({ id: z.string() }),
  },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    await deleteService(requestParams(req).id);
    return { ok: true };
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

// ---- Docker housekeeping --------------------------------------------------

function sendHousekeepingError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof HousekeepingError) {
    return reply.code(err.status).send({ error: err.message });
  }
  return reply.code(500).send({ error: err instanceof Error ? err.message : "housekeeping_error" });
}

app.get("/api/docker/disk", { schema: { querystring: z.object({}).strict() } }, async (req, reply) => {
  if (!(await isDockerAvailable())) {
    return reply.code(503).send({ error: "docker_unavailable" });
  }
  try {
    return await readDiskUsage();
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: "Could not read Docker disk usage" });
  }
});

app.get("/api/docker/backups", { schema: { querystring: z.object({}).strict() } }, async (_req, reply) => {
  try {
    return await listDockerBackups();
  } catch (err) {
    return sendHousekeepingError(reply, err);
  }
});

app.post("/api/docker/backups/:serviceId", {
  schema: {
    params: z.object({ serviceId: z.string() }),
    body: z.object({}).strict().nullish(),
  },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    return reply.code(201).send(await createImageBackup(requestParams(req).serviceId));
  } catch (err) {
    return sendHousekeepingError(reply, err);
  }
});

app.post("/api/docker/backups/:serviceId/restore", {
  schema: {
    params: z.object({ serviceId: z.string() }),
    body: z.object({ name: z.string().max(256).optional() }).strict().nullish(),
  },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  try {
    return await restoreImageBackup(requestParams(req).serviceId, requestBody(req)?.name);
  } catch (err) {
    return sendHousekeepingError(reply, err);
  }
});

app.get("/api/docker/prune", { schema: { querystring: z.object({}).strict() } }, async (req, reply) => {
  if (!(await isDockerAvailable())) {
    return reply.code(503).send({ error: "docker_unavailable" });
  }
  try {
    return await prunePreview();
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: "Could not build a prune preview" });
  }
});

app.post("/api/docker/prune", {
  schema: {
    body: z.object({}).strict().nullish(),
  },
  config: ACTION_LIMIT,
}, async (req, reply) => {
  if (!(await isDockerAvailable())) {
    return reply.code(503).send({ error: "docker_unavailable" });
  }
  try {
    return await pruneDangling();
  } catch (err) {
    req.log.error(err);
    return reply.code(500).send({ error: "Could not prune Docker data" });
  }
});

// ---- Metrics --------------------------------------------------------------

app.get("/api/metrics", {
  schema: {
    querystring: z.object({ range: z.string().optional() }).strict(),
  },
}, async (req, reply) => {
  const range = parseMetricsRange(requestQuery(req).range);
  try {
    return await readMetricsRange(range);
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "metrics_unavailable" });
  }
});

// ---- Uptime and incidents -------------------------------------------------

app.get("/api/uptime", { schema: { querystring: z.object({}).strict() } }, async (req, reply) => {
  try {
    return await readUptime();
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "uptime_unavailable" });
  }
});

app.get("/api/incidents", {
  schema: {
    querystring: z.object({ limit: z.string().optional() }).strict(),
  },
}, async (req, reply) => {
  const raw = requestQuery(req).limit;
  const limit = raw === undefined ? 50 : Number(raw);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return reply.code(400).send({ error: "limit must be an integer from 1 to 200" });
  }

  try {
    return await listIncidents(limit);
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "incidents_unavailable" });
  }
});

// ---- Event stream ---------------------------------------------------------

app.get("/api/events", { schema: { querystring: z.object({}).strict() } }, async (req, reply) => {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const remove = addEventClient(res);
  req.raw.on("close", remove);
  req.raw.on("error", remove);

  return reply;
});

app.get("/api/health", { schema: { querystring: z.object({}).strict() } }, async () => ({ ok: true }));

const stopServiceMonitor = startServiceMonitor(initialServices);
startMetricsSampler(initialServices);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down API");
  stopServiceMonitor();

  try {
    await app.close();
    await pool.end();
    process.exitCode = 0;
  } catch (error) {
    app.log.error(error, "API shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ host: HOST, port: PORT });
