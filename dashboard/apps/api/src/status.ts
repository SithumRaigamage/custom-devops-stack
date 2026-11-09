import { runCompose } from "./compose.js";
import type { Service } from "./services.js";

export type Status = "healthy" | "unhealthy" | "stopped";

const HEALTH_TIMEOUT_MS = 3000;
const COMPOSE_TIMEOUT_MS = 10000;

// `docker compose ps` lists running containers only. Depending on the Compose
// version, --format json prints one JSON array or one JSON object per line.
async function hasRunningContainers(service: Service): Promise<boolean> {
  const { stdout } = await runCompose(service, ["ps", "--format", "json"], COMPOSE_TIMEOUT_MS);
  const text = stdout.trim();
  if (!text) return false;
  const rows: { State?: string }[] = text.startsWith("[")
    ? JSON.parse(text)
    : text.split("\n").map((line) => JSON.parse(line));
  return rows.some((row) => row.State === "running");
}

async function healthResponds(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getStatus(service: Service): Promise<Status> {
  let running: boolean;
  try {
    running = await hasRunningContainers(service);
  } catch {
    // Docker unavailable or the folder/compose file is unusable: nothing is running from our side.
    return "stopped";
  }
  if (!running) return "stopped";
  return (await healthResponds(service.health)) ? "healthy" : "unhealthy";
}
