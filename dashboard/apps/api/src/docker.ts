import Docker from "dockerode";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Socket resolution order:
 *   1. DOCKER_HOST (unix:///…, tcp://host:port, or a bare socket path)
 *   2. ~/.docker/run/docker.sock  (Docker Desktop on macOS)
 *   3. /var/run/docker.sock       (colima / Rancher / Linux)
 */
export function resolveDockerOptions(): Docker.DockerOptions {
  const fromEnv = process.env.DOCKER_HOST?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith("unix://")) {
      return { socketPath: fromEnv.slice("unix://".length) };
    }
    if (fromEnv.startsWith("tcp://") || fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
      const url = new URL(fromEnv.replace(/^tcp:\/\//, "http://"));
      return {
        host: url.hostname,
        port: Number(url.port || 2375),
        protocol: url.protocol === "https:" ? "https" : "http",
      };
    }
    return { socketPath: fromEnv };
  }

  const desktopSocket = join(homedir(), ".docker", "run", "docker.sock");
  if (existsSync(desktopSocket)) return { socketPath: desktopSocket };

  return { socketPath: "/var/run/docker.sock" };
}

let client: Docker | null = null;

export function getDocker(): Docker {
  client ??= new Docker(resolveDockerOptions());
  return client;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await getDocker().ping();
    return true;
  } catch {
    return false;
  }
}

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

/** Containers grouped by their Compose project label (the service folder name). */
export async function listContainersByProject(): Promise<Map<string, Docker.ContainerInfo[]>> {
  const containers = await getDocker().listContainers({ all: true });
  const byProject = new Map<string, Docker.ContainerInfo[]>();

  for (const container of containers) {
    const project = container.Labels?.[COMPOSE_PROJECT_LABEL];
    if (!project) continue;
    const group = byProject.get(project) ?? [];
    group.push(container);
    byProject.set(project, group);
  }

  // Prefer a running container, then the most recently created one.
  for (const group of byProject.values()) {
    group.sort((a, b) => {
      const aRunning = a.State === "running" ? 1 : 0;
      const bRunning = b.State === "running" ? 1 : 0;
      if (aRunning !== bRunning) return bRunning - aRunning;
      return (b.Created ?? 0) - (a.Created ?? 0);
    });
  }

  return byProject;
}

export function projectNameForFolder(folder: string): string {
  return folder.split("/").filter(Boolean).pop() ?? folder;
}

export function formatUptime(startedAt: string | undefined): string {
  if (!startedAt) return "—";
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return "—";

  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export interface ContainerStats {
  cpuPct: number;
  memBytes: number;
  memPct: number;
}

/**
 * One-shot stats, computed the way the Docker CLI does:
 *   cpu% = (cpuDelta / systemDelta) × onlineCPUs × 100
 *   mem% = (usage − inactive_file) / limit × 100
 */
export async function readStats(container: Docker.Container): Promise<ContainerStats> {
  try {
    const stats = (await container.stats({ stream: false })) as Docker.ContainerStats;

    const cpu = stats.cpu_stats;
    const preCpu = stats.precpu_stats;
    const cpuDelta = (cpu?.cpu_usage?.total_usage ?? 0) - (preCpu?.cpu_usage?.total_usage ?? 0);
    const systemDelta = (cpu?.system_cpu_usage ?? 0) - (preCpu?.system_cpu_usage ?? 0);
    const onlineCpus =
      cpu?.online_cpus || cpu?.cpu_usage?.percpu_usage?.length || 1;

    const cpuPct =
      systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

    const memory = stats.memory_stats;
    const usage = memory?.usage ?? 0;
    const inactiveFile =
      memory?.stats?.total_inactive_file ?? memory?.stats?.inactive_file ?? 0;
    const limit = memory?.limit ?? 0;
    const used = Math.max(usage - inactiveFile, 0);

    return {
      cpuPct: Math.round(cpuPct * 100) / 100,
      memBytes: used,
      memPct: limit > 0 ? Math.round((used / limit) * 10000) / 100 : 0,
    };
  } catch {
    return { cpuPct: 0, memBytes: 0, memPct: 0 };
  }
}
