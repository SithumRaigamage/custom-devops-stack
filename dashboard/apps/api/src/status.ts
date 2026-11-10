import type Docker from "dockerode";
import { formatUptime, getDocker, readStats } from "./docker.js";
import type { Service } from "./services.js";

export type Status =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting";

export interface ServiceDetail {
  id: string;
  name: string;
  desc: string;
  port: string;
  url: string;
  folder: string;
  image: string;
  icon?: string;
  status: Status;
  cpuPct: number;
  memBytes: number;
  memPct: number;
  uptime: string;
  healthNote: string;
}

const HEALTH_TIMEOUT_MS = 3000;

function portFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return "—";
  }
}

/** Prefer the published port that matches the service URL, else the first binding. */
function publishedPort(inspect: Docker.ContainerInspectInfo, url: string): string {
  const bindingsByPort = inspect.NetworkSettings?.Ports ?? {};
  const published: string[] = [];

  for (const bindings of Object.values(bindingsByPort)) {
    for (const binding of bindings ?? []) {
      if (binding?.HostPort) published.push(binding.HostPort);
    }
  }

  const urlPort = portFromUrl(url);
  if (published.includes(urlPort)) return urlPort;
  return published[0] ?? urlPort;
}

async function checkHttp(url: string): Promise<{ ok: boolean; note: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (res.ok) return { ok: true, note: "" };
    return { ok: false, note: `HTTP ${res.status} from ${url}` };
  } catch {
    return { ok: false, note: `No response from ${url} within 3s` };
  }
}

function lastHealthLog(inspect: Docker.ContainerInspectInfo): string {
  const log = inspect.State?.Health?.Log ?? [];
  const last = log[log.length - 1];
  return last?.Output?.trim() ?? "";
}

function emptyDetail(service: Service): ServiceDetail {
  return {
    id: service.id,
    name: service.name,
    desc: service.desc ?? "",
    port: portFromUrl(service.url),
    url: service.url,
    folder: service.folder,
    image: service.image ?? "—",
    ...(service.icon ? { icon: service.icon } : {}),
    status: "stopped",
    cpuPct: 0,
    memBytes: 0,
    memPct: 0,
    uptime: "—",
    healthNote: "",
  };
}

export async function getServiceDetails(
  service: Service,
  containerInfo?: Docker.ContainerInfo,
): Promise<ServiceDetail> {
  if (!containerInfo) {
    return emptyDetail(service);
  }

  const container = getDocker().getContainer(containerInfo.Id);

  let inspect: Docker.ContainerInspectInfo;
  try {
    inspect = await container.inspect();
  } catch {
    return emptyDetail(service);
  }

  const state = inspect.State?.Status ?? "exited";
  const detail: ServiceDetail = {
    ...emptyDetail(service),
    image: inspect.Config?.Image ?? containerInfo.Image ?? service.image ?? "—",
    port: publishedPort(inspect, service.url),
  };

  if (state === "restarting") {
    detail.status = "restarting";
    detail.uptime = formatUptime(inspect.State?.StartedAt);
    return detail;
  }

  if (state === "removing") {
    detail.status = "stopping";
    detail.uptime = formatUptime(inspect.State?.StartedAt);
    return detail;
  }

  if (state !== "running") {
    detail.status = "stopped";
    return detail;
  }

  detail.uptime = formatUptime(inspect.State?.StartedAt);

  const stats = await readStats(container);
  detail.cpuPct = stats.cpuPct;
  detail.memBytes = stats.memBytes;
  detail.memPct = stats.memPct;

  const health = inspect.State?.Health?.Status;
  if (health === "starting") {
    detail.status = "starting";
    detail.healthNote = lastHealthLog(inspect);
    return detail;
  }

  if (health === "unhealthy") {
    detail.status = "unhealthy";
    detail.healthNote = lastHealthLog(inspect) || "Container health check is failing";
    return detail;
  }

  const http = await checkHttp(service.health);
  if (!http.ok) {
    detail.status = "unhealthy";
    detail.healthNote = http.note;
    return detail;
  }

  detail.status = "healthy";

  return detail;
}
