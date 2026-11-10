import { spawn } from "node:child_process";
import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { runCompose, serviceCwd } from "./compose.js";
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

const HOST = "127.0.0.1";
const PORT = 4000;
const ALLOWED_ORIGIN = "http://localhost:3001";

const ACTION_TIMEOUT_MS = 5 * 60 * 1000;
const LOGS_TIMEOUT_MS = 15 * 1000;
const DEFAULT_TAIL = 100;
const MAX_TAIL = 5000;

// Each action maps to a fixed `docker compose` argument array.
const ACTIONS = {
  start: ["up", "-d"],
  stop: ["stop"],
  restart: ["restart"],
} as const;

const ACTION_VERB = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
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

const app = Fastify({ logger: true });

await app.register(cors, { origin: ALLOWED_ORIGIN });
await app.register(rateLimit, { global: false });

// State-changing requests are simple cross-site POSTs a browser sends without a
// preflight, so refuse any that carry a foreign Origin header. PUT/DELETE/PATCH
// are just as reachable cross-site and must be covered too.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "OPTIONS") return;
  const origin = req.headers.origin;
  if (MUTATING_METHODS.has(req.method) && origin !== undefined && origin !== ALLOWED_ORIGIN) {
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

app.get("/api/services", async (_req, reply) => {
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
});

app.post<{ Params: { id: string; action: string } }>(
  "/api/services/:id/:action",
  async (req, reply) => {
    const service = loadServices().find((entry) => entry.id === req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const action = req.params.action;
    if (!Object.hasOwn(ACTIONS, action)) {
      return reply.code(404).send({ error: `Unknown action "${action}"` });
    }

    const user = await getSessionUser(req);

    // A stop the user asked for is not an incident; the next start/restart clears it.
    if (action === "stop") setIntentionalStop(service.id, true);
    else setIntentionalStop(service.id, false);

    try {
      const { stdout, stderr } = await runCompose(
        service,
        [...ACTIONS[action as keyof typeof ACTIONS]],
        ACTION_TIMEOUT_MS,
      );

      await recordActivity({
        kind: action,
        message: `${service.name} ${ACTION_VERB[action as keyof typeof ACTION_VERB]}`,
        actor: user?.username ?? "user",
      }).catch(() => {
        // A failed activity write must not turn a successful Docker action into an error.
      });

      return { id: service.id, action, ok: true, output: (stdout + stderr).trim() };
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

app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
  "/api/services/:id/logs",
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
app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
  "/api/services/:id/logs/stream",
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

app.get("/api/jenkins/builds", async (req, reply) => {
  if (!isJenkinsConfigured()) return { configured: false, builds: [] };
  try {
    return { configured: true, builds: await listJenkinsBuilds() };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({
      error: err instanceof Error ? err.message : "Jenkins is unavailable",
    });
  }
});

app.get("/api/jenkins/summary", async (req, reply) => {
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
});

app.post<{ Params: { job: string } }>("/api/jenkins/jobs/:job/build", async (req, reply) => {
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
});

app.get<{ Params: { job: string; num: string }; Querystring: { tail?: string } }>(
  "/api/jenkins/jobs/:job/:num/console",
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

app.get("/api/sonar/projects", async (req, reply) => {
  if (!isSonarConfigured()) return { configured: false, projects: [] };
  try {
    return { configured: true, projects: await listSonarProjects() };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({
      error: err instanceof Error ? err.message : "SonarQube is unavailable",
    });
  }
});

app.get<{ Params: { key: string } }>("/api/sonar/projects/:key", async (req, reply) => {
  if (!isSonarConfigured()) return { configured: false, key: req.params.key };
  try {
    return { configured: true, ...(await sonarProject(req.params.key)) };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({
      error: err instanceof Error ? err.message : "Could not read the SonarQube project",
    });
  }
});

// ---- Ollama ---------------------------------------------------------------

app.get("/api/ollama/status", async () => ollamaStatus());

app.get("/api/ollama/models", async () => ollamaModels());

app.get("/api/ollama/running", async () => ollamaRunning());

app.post<{ Params: { name: string } }>("/api/ollama/models/:name/load", async (req, reply) => {
  try {
    await ollamaLoadModel(req.params.name);
    return { ok: true };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({
      error: err instanceof Error ? err.message : "Could not load the Ollama model",
    });
  }
});

app.post<{ Params: { name: string } }>("/api/ollama/models/:name/unload", async (req, reply) => {
  try {
    await ollamaUnloadModel(req.params.name);
    return { ok: true };
  } catch (err) {
    req.log.error(err);
    return reply.code(502).send({
      error: err instanceof Error ? err.message : "Could not unload the Ollama model",
    });
  }
});

// ---- Activity and assistant -----------------------------------------------

app.get<{ Querystring: { limit?: string } }>("/api/activity", async (req, reply) => {
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
});

app.post<{ Body: { message?: unknown; model?: unknown } }>(
  "/api/assistant/chat",
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
            "You are StackPilot, a concise assistant for a local DevOps stack. Help with Docker Compose services, Jenkins builds, SonarQube quality gates, logs, and service health. Say when you do not have enough live data instead of inventing it.",
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

app.get("/api/settings", async (req, reply) => {
  try {
    return publicSettings(await getSettings());
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "settings_unavailable" });
  }
});

app.put("/api/settings", async (req, reply) => {
  const parsed = SettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
  }

  try {
    return publicSettings(await updateSettings(parsed.data));
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "settings_unavailable" });
  }
});

// ---- Alerts ---------------------------------------------------------------

app.get<{ Querystring: { limit?: string } }>("/api/alerts", async (req, reply) => {
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
});

app.post("/api/alerts/read", async (req, reply) => {
  try {
    const count = await markAllAlertsRead();
    return { ok: true, count };
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "alerts_unavailable" });
  }
});

app.post<{ Params: { id: string } }>("/api/alerts/:id/read", async (req, reply) => {
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
});

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

app.get("/api/registry/services", async (_req, reply) => {
  try {
    return await listRegistryServices();
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.get("/api/registry/folders", async (_req, reply) => {
  try {
    return await listFolders();
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.post("/api/registry/services", async (req, reply) => {
  try {
    return reply.code(201).send(await createService(req.body));
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.put<{ Params: { id: string } }>("/api/registry/services/:id", async (req, reply) => {
  try {
    return await updateService(req.params.id, req.body);
  } catch (err) {
    return sendRegistryError(reply, err);
  }
});

app.delete<{ Params: { id: string } }>("/api/registry/services/:id", async (req, reply) => {
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

app.get("/api/docker/disk", async (req, reply) => {
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

app.get("/api/docker/backups", async (_req, reply) => {
  try {
    return await listDockerBackups();
  } catch (err) {
    return sendHousekeepingError(reply, err);
  }
});

app.post<{ Params: { serviceId: string } }>(
  "/api/docker/backups/:serviceId",
  async (req, reply) => {
    try {
      return reply.code(201).send(await createImageBackup(req.params.serviceId));
    } catch (err) {
      return sendHousekeepingError(reply, err);
    }
  },
);

app.post<{ Params: { serviceId: string }; Body: { name?: unknown } }>(
  "/api/docker/backups/:serviceId/restore",
  async (req, reply) => {
    try {
      return await restoreImageBackup(req.params.serviceId, req.body?.name);
    } catch (err) {
      return sendHousekeepingError(reply, err);
    }
  },
);

app.get("/api/docker/prune", async (req, reply) => {
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

app.post("/api/docker/prune", async (req, reply) => {
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

app.get<{ Querystring: { range?: string } }>("/api/metrics", async (req, reply) => {
  const range = parseMetricsRange(req.query.range);
  try {
    return await readMetricsRange(range);
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "metrics_unavailable" });
  }
});

// ---- Uptime and incidents -------------------------------------------------

app.get("/api/uptime", async (req, reply) => {
  try {
    return await readUptime();
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "uptime_unavailable" });
  }
});

app.get<{ Querystring: { limit?: string } }>("/api/incidents", async (req, reply) => {
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

app.get("/api/events", async (req, reply) => {
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

app.get("/api/health", async () => ({ ok: true }));

startServiceMonitor(initialServices);
startMetricsSampler(initialServices);

await app.listen({ host: HOST, port: PORT });
