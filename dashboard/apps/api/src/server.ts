import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { runCompose } from "./compose.js";
import { loadServices } from "./services.js";
import { getServiceDetails } from "./status.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { authRoutes, getSessionUser } from "./auth.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;
const ALLOWED_ORIGINS = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);

if (HOST !== "127.0.0.1" && HOST !== "localhost") {
  throw new Error(`HOST must be 127.0.0.1 or localhost (got "${HOST}")`);
}

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

await app.register(cors, {
  origin: (origin, callback) => {
    callback(null, origin === undefined || ALLOWED_ORIGINS.has(origin));
  },
  credentials: true,
});

// Per-route limits only; nothing is limited globally.
await app.register(rateLimit, { global: false });

// State-changing requests are simple cross-site POSTs a browser sends without a
// preflight, so refuse any that carry a foreign Origin header.
app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin;
  if (req.method === "POST" && origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
    return reply.code(403).send({ error: "Origin not allowed" });
  }
});

// Every service route needs a session, and POSTs also need the X-StackPilot header.
app.addHook("onRequest", async (req, reply) => {
  const path = (req.url ?? "/").split("?")[0];
  if (!path.startsWith("/api/services") || req.method === "OPTIONS") return;

  const user = await getSessionUser(req);
  if (!user) return reply.code(401).send({ error: "Unauthenticated" });

  if (req.method !== "GET" && req.headers["x-stackpilot"] !== "1") {
    return reply.code(403).send({ error: "Missing X-StackPilot: 1 header" });
  }
});

await app.register(authRoutes);

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/services", async (req, reply) => {
  if (!(await isDockerAvailable())) {
    return reply.code(503).send({ error: "docker_unavailable" });
  }

  try {
    const byProject = await listContainersByProject();
    return await Promise.all(
      services.map((service) =>
        getServiceDetails(service, byProject.get(projectNameForFolder(service.folder))?.[0]),
      ),
    );
  } catch (err) {
    req.log.error(err);
    return reply.code(503).send({ error: "docker_unavailable" });
  }
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

    if (!(await isDockerAvailable())) {
      return reply.code(503).send({ error: "docker_unavailable" });
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

    if (!(await isDockerAvailable())) {
      return reply.code(503).send({ error: "docker_unavailable" });
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

await app.listen({ host: HOST, port: PORT });
