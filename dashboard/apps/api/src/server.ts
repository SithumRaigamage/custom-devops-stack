import { spawn } from "node:child_process";
import Fastify, { type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { runCompose, runOperatorCommand, serviceCwd } from "./compose.js";
import { loadServices } from "./services.js";
import { getServiceDetails } from "./status.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { authRoutes, getSessionUser } from "./auth.js";
import { listActivity, recordActivity, startServiceMonitor } from "./events.js";
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

const ACTION_VERB = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
} as const;

// Rate-limit tiers per requirement.
const RATE_LIMIT = {
  login: { max: 5, windowMs: 60_000 },
  actions: { max: 30, windowMs: 60_000 },
  assistant: { max: 10, windowMs: 60_000 },
} as const;

// Secret patterns to redact from pino logs.
const SECRET_PATTERNS = [
  /discordWebhookUrl/i,
  /telegramBotToken/i,
  /JENKINS_API_TOKEN/i,
  /SONAR_TOKEN/i,
  /SESSION_SECRET/i,
  /DATABASE_URL/i,
];

function redactSecrets(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SECRET_PATTERNS.some((p) => p.test(key))) {
      out[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      out[key] = redactSecrets(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// Zod schemas for every route's params/query/body — strict rejects unknown keys.
const Schemas = {
  // --- Services ---
  serviceAction: z.object({
    params: z.object({ id: z.string(), action: z.enum(["start", "stop", "restart"]) }),
    body: z.object({}).strict(),
  }),
  serviceLogs: z.object({
    params: z.object({ id: z.string() }),
    query: z.object({ tail: z.string().optional() }).strict(),
  }),

  // --- Jenkins ---
  jenkinsBuild: z.object({
    params: z.object({ job: z.string() }),
    query: z.object({ tail: z.string().optional() }).strict(),
  }),
  jenkinsTrigger: z.object({
    params: z.object({ job: z.string() }),
    body: z.object({}).strict(),
  }),

  // --- Alerts ---
  alertRead: z.object({
    params: z.object({ id: z.string() }),
  }),

  // --- Settings ---
  settingsPatch: z.object({
    body: z.object({
      stackRoot: z.string().optional(),
      healthCheckIntervalSeconds: z.number().optional(),
      theme: z.string().optional(),
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
        }).optional(),
        discordWebhookUrl: z.string().trim().max(2048).optional(),
        telegramBotToken: z.string().trim().max(512).optional(),
        telegramChatId: z.string().trim().max(128).optional(),
      }).refine((v) => Object.keys(v).length > 0 || Object.keys(v).length === 0, {
        message: "No notification settings provided",
      }),
    }).strict(),
  }),

  // --- Assistant ---
  assistantChat: z.object({
    body: z.object({
      message: z.string().min(1).max(8000),
      model: z.string().optional(),
    }).strict(),
  }),

  // --- Registry ---
  registryServiceCreate: z.object({
    body: z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      desc: z.string().optional(),
      image: z.string().url().optional(),
      folder: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      url: z.string().url(),
      healthPath: z.string().trim().regex(/^\//, "Health path must start with /").max(512).optional(),
      icon: z.string().optional(),
    }).strict(),
  }),

  // --- Docker ---
  dockerRestoreBackup: z.object({
    params: z.object({ serviceId: z.string() }),
    body: z.object({ name: z.string().optional() }),
  }),
  dockerPrune: z.object({
    body: z.object({}).strict(),
  }),

  // --- Assistant read-only guard ---
  assistantGuard: z.object({
    params: z.object({}).strict(),
  }),
} as const;

function parseTail(raw: string | undefined): number | null {
  const value = raw ?? String(DEFAULT_TAIL);
  if (!/^\d+$/.test(value)) return null;
  const tail = Number(value);
  return Number.isInteger(tail) && tail >= 1 && tail <= MAX_TAIL ? tail : null;
}

// Background monitors keep this snapshot; request handling re-reads services.yaml
// so registry edits take effect immediately.
const initialServices = loadServices();

const app = Fastify({
  logger: {
    redact: {
      paths: SECRET_PATTERNS.map((p) => p.source),
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
        getServiceDetails(service, byProject.get(projectNameForFolder(service.folder))?.[0]),
      ),
    );
  },
);

app.post(
  "/api/services/:id/:action",
  {
    schema: {
      params: z.object({ id: z.string(), action: z.enum(["start", "stop", "restart"]) }),
      body: z.object({}).strict(),
    },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    const service = loadServices().find((entry) => entry.id === req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const action = req.params.action;

    const user = await getSessionUser(req);

    // A stop the user asked for is not an incident; the next start/restart clears it.
    if (action === "stop") setIntentionalStop(service.id, true);
    else setIntentionalStop(service.id, false);

    try {
      const command =
        action === "start" ? service.startCommand : service.stopCommand;
      if (!command) {
        return reply.code(500).send({
          id: service.id,
          action,
          ok: false,
          error: `No ${action} command configured for ${service.name}`,
        });
      }

      const commandArgs = command === "webui" ? [action] : [];
      const outputs: string[] = [];
      if (action === "restart") {
        const stopCommand = service.stopCommand;
        const startCommand = service.startCommand;
        if (!stopCommand || !startCommand) {
          return reply.code(500).send({
            id: service.id,
            action,
            ok: false,
            error: `Restart commands are not configured for ${service.name}`,
          });
        }
        const stopped = await runOperatorCommand(
          stopCommand,
          stopCommand === "webui" ? ["stop"] : [],
          ACTION_TIMEOUT_MS,
        );
        outputs.push(stopped.stdout, stopped.stderr);
        const started = await runOperatorCommand(
          startCommand,
          startCommand === "webui" ? ["start"] : [],
          ACTION_TIMEOUT_MS,
        );
        outputs.push(started.stdout, started.stderr);
      } else {
        const result = await runOperatorCommand(command, commandArgs, ACTION_TIMEOUT_MS);
        outputs.push(result.stdout, result.stderr);
      }

      await recordActivity({
        kind: action,
        message: `${service.name} ${ACTION_VERB[action as keyof typeof ACTION_VERB]}`,
        actor: user?.username ?? "user",
      }).catch(() => {
        // A failed activity write must not turn a successful Docker action into an error.
      });

      return { id: service.id, action, ok: true, output: outputs.join("").trim() };
    } catch (err) {
      if (action === "stop") setIntentionalStop(service.id, false);
      req.log.error(err);
      const detail = err as { stderr?: string; message: string };
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
    const service = loadServices().find((entry) => entry.id === req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const tail = parseTail(req.query.tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }

    try {
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
    const service = loadServices().find((entry) => entry.id === req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const tail = parseTail(req.query.tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
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

// ---- Jenkins --------------------------------------------------------------

app.get(
  "/api/jenkins/builds",
  {
    schema: {
      querystring: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    if (!isJenkinsConfigured()) return { configured: false, builds: [] };
    try {
      return { configured: true, builds: await listJenkinsBuilds() };
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
      querystring: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    if (!isJenkinsConfigured()) {
      return {
        configured: false,
        successRate: 0,
        averageDurationMs: 0,
        running: 0,
        failedToday: 0,
      };
    }
    try {
      return { configured: true, ...(await jenkinsSummary()) };
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
      body: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    if (!isJenkinsConfigured()) {
      return reply.code(400).send({ error: "Jenkins is not configured" });
    }
    if (!req.params.job) return reply.code(400).send({ error: "Job is required" });

    try {
      await triggerJenkinsBuild(req.params.job);
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
      querystring: z.object({ tail: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    if (!isJenkinsConfigured()) return { configured: false, lines: [] };

    const num = Number(req.params.num);
    if (!Number.isInteger(num) || num < 1) {
      return reply.code(400).send({ error: "Build number must be a positive integer" });
    }
    const tail = parseTail(req.query.tail);
    if (tail === null) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }

    try {
      return { configured: true, lines: await jenkinsConsole(req.params.job, num, tail) };
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
      querystring: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    if (!isSonarConfigured()) return { configured: false, projects: [] };
    try {
      return { configured: true, projects: await listSonarProjects() };
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
    },
  },
  async (req, reply) => {
    if (!isSonarConfigured()) return { configured: false, key: req.params.key };
    try {
      return { configured: true, ...(await sonarProject(req.params.key)) };
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
      querystring: z.object({}).strict(),
    },
  },
  async () => ollamaStatus(),
);

app.get(
  "/api/ollama/models",
  {
    schema: {
      querystring: z.object({}).strict(),
    },
  },
  async () => ollamaModels(),
);

app.get(
  "/api/ollama/running",
  {
    schema: {
      querystring: z.object({}).strict(),
    },
  },
  async () => ollamaRunning(),
);

app.post(
  "/api/ollama/models/:name/load",
  {
    schema: {
      params: z.object({ name: z.string() }),
      body: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    try {
      await ollamaLoadModel(req.params.name);
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
      body: z.object({}).strict(),
    },
  },
  async (req, reply) => {
    try {
      await ollamaUnloadModel(req.params.name);
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

app.get(
  "/api/activity",
  {
    schema: {
      querystring: z.object({ limit: z.string().optional() }).strict(),
    },
  },
  async (req, reply) => {
    const raw = req.query.limit;
    const limit = raw === undefined ? 50 : Number(raw);

    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return reply.code(400).send({ error: "limit must be an integer from 1 to 200" });
    }

    try {
      return { activity: await listActivity(limit) };
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
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const model =
      typeof req.body?.model === "string" && req.body.model.trim()
        ? req.body.model.trim()
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
          }).optional(),
          discordWebhookUrl: z.string().trim().max(2048).refine((v) => v === "" || /^https?:\/\//i.test(v), {
            message: "Discord webhook must be an http(s) URL",
          }).optional(),
          telegramBotToken: z.string().trim().max(512).optional(),
          telegramChatId: z.string().trim().max(128).optional(),
        }).refine((v) => Object.keys(v).length > 0, {
          message: "No notification settings provided",
        }).optional(),
      }).refine((v) => Object.keys(v).length > 0, {
        message: "No settings provided",
      }),
    },
  },
  async (req, reply) => {
    try {
      return publicSettings(await updateSettings(req.body));
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
    const raw = req.query.limit;
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
  config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
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
    },
  },
  async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: "Invalid alert id" });
    }

    try {
      const updated = await markAlertRead(id);
      if (!updated) return reply.code(404).send({ error: `Unknown alert "${req.params.id}"` });
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(503).send({ error: "alerts_unavailable" });
    }
  },
);

app.post("/api/notifications/test", async (req, reply) => {
  try {
    const result = await sendTestNotification();
    if (result.discord === "not_configured" && result.telegram === "not_configured") {
      return reply.code(400).send({
        error: "Configure a Discord webhook or a Telegram token and chat id first",
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
      body: z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        desc: z.string().optional(),
        image: z.string().url().optional(),
        folder: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        url: z.string().url(),
        healthPath: z.string().trim().regex(/^\//, "Health path must start with /").max(512),
        icon: z.string().optional(),
        startCommand: z.enum([
          "jenkins-start",
          "jenkins-stop",
          "sonar-start",
          "sonar-stop",
          "mongo-start",
          "mongo-stop",
          "webui",
        ]).optional(),
        stopCommand: z.enum([
          "jenkins-start",
          "jenkins-stop",
          "sonar-start",
          "sonar-stop",
          "mongo-start",
          "mongo-stop",
          "webui",
        ]).optional(),
      }).strict(),
    },
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  },
  async (req, reply) => {
    try {
      return reply.code(201).send(await createService(req.body));
    } catch (err) {
      return sendRegistryError(reply, err);
    }
  },
);

app.put("/api/registry/services/:id", {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      desc: z.string().optional(),
      image: z.string().url().optional(),
      folder: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      url: z.string().url(),
      healthPath: z.string().trim().regex(/^\//, "Health path must start with /").max(512),
      icon: z.string().optional(),
      startCommand: z.enum([
        "jenkins-start",
        "jenkins-stop",
        "sonar-start",
        "sonar-stop",
        "mongo-start",
        "mongo-stop",
        "webui",
      ]).optional(),
      stopCommand: z.enum([
        "jenkins-start",
        "jenkins-stop",
        "sonar-start",
        "sonar-stop",
        "mongo-start",
        "mongo-stop",
        "webui",
      ]).optional(),
    }).strict(),
  },
  config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
}, async (req, reply) => {
  try {
    return await updateService(req.params.id, req.body);
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.delete("/api/registry/services/:id", {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (req, reply) => {
  try {
    await deleteService(req.params.id);
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
    body: z.object({}).strict(),
  },
}, async (req, reply) => {
  try {
    return reply.code(201).send(await createImageBackup(req.params.serviceId));
  } catch (err) {
    return sendHousekeepingError(reply, err);
  }
});

app.post("/api/docker/backups/:serviceId/restore", {
  schema: {
    params: z.object({ serviceId: z.string() }),
    body: z.object({ name: z.string().optional() }),
  },
}, async (req, reply) => {
  try {
    return await restoreImageBackup(req.params.serviceId, req.body?.name);
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
    body: z.object({}).strict(),
  },
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
  const range = parseMetricsRange(req.query.range);
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
  const raw = req.query.limit;
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
