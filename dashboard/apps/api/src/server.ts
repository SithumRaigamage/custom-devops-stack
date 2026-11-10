import Fastify from "fastify";
import cors from "@fastify/cors";
import { runCompose } from "./compose.js";
import { loadServices } from "./services.js";
import { getServiceDetails } from "./status.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { authRoutes } from "./auth.js";
import { addEventClient, startServiceMonitor } from "./events.js";
import { parseMetricsRange, readMetricsRange, startMetricsSampler } from "./metrics.js";

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

const services = loadServices();
const byId = new Map(services.map((s) => [s.id, s]));

const app = Fastify({ logger: true });

await app.register(cors, { origin: ALLOWED_ORIGIN });

// State-changing requests are simple cross-site POSTs a browser sends without a
// preflight, so refuse any that carry a foreign Origin header.
app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin;
  if (req.method === "POST" && origin !== undefined && origin !== ALLOWED_ORIGIN) {
    return reply.code(403).send({ error: "Origin not allowed" });
  }
});

app.get("/api/services", async (_req, reply) => {
  if (!(await isDockerAvailable())) {
    return reply.code(503).send({ error: "docker_unavailable" });
  }

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
    const service = byId.get(req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const action = req.params.action;
    if (!Object.hasOwn(ACTIONS, action)) {
      return reply.code(404).send({ error: `Unknown action "${action}"` });
    }

    try {
      const { stdout, stderr } = await runCompose(
        service,
        [...ACTIONS[action as keyof typeof ACTIONS]],
        ACTION_TIMEOUT_MS,
      );
      return { id: service.id, action, ok: true, output: (stdout + stderr).trim() };
    } catch (err) {
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
    const service = byId.get(req.params.id);
    if (!service) return reply.code(404).send({ error: `Unknown service "${req.params.id}"` });

    const raw = req.query.tail ?? String(DEFAULT_TAIL);
    const tail = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(tail) || tail < 1 || tail > MAX_TAIL) {
      return reply.code(400).send({ error: `tail must be an integer from 1 to ${MAX_TAIL}` });
    }

    try {
      const { stdout, stderr } = await runCompose(
        service,
        ["logs", "--no-color", "--tail", String(tail)],
        LOGS_TIMEOUT_MS,
      );
      return { id: service.id, tail, logs: stdout + stderr };
    } catch (err) {
      req.log.error(err);
      const detail = err as { stderr?: string; message: string };
      return reply.code(500).send({ error: (detail.stderr || detail.message).trim() });
    }
  },
);

// Auth routes
await authRoutes(app);

// CPU / memory time series, 1h | 6h | 24h (downsampled to 120 points).
app.get<{ Querystring: { range?: string } }>("/api/metrics", async (req, reply) => {
  const range = parseMetricsRange(req.query.range);
  try {
    return await readMetricsRange(range);
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "metrics_unavailable" });
  }
});

// Activity SSE endpoint
app.get("/api/events", async (_req, reply) => {
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
  _req.raw.on("close", remove);
  _req.raw.on("error", remove);

  return reply;
});

// Health check
app.get("/api/health", async () => ({ ok: true }));

startServiceMonitor(services);
startMetricsSampler(services);

await app.listen({ host: HOST, port: PORT });
