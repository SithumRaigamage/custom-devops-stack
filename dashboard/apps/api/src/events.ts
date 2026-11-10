import { activity, db, pool } from "./db.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { loadServices, type Service } from "./services.js";
import { getServiceDetails, type ServiceDetail, type Status } from "./status.js";
import { getSettings } from "./settings.js";
import { evaluateAlerts } from "./alerts.js";
import { broadcast } from "./sse.js";
import { recordStatusSamples } from "./uptime.js";

export { addEventClient, broadcast } from "./sse.js";

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  id: number;
  ts: number;
  kind: string;
  message: string;
  actor: string;
  serviceId: number | null;
}

export async function recordActivity(input: {
  kind: string;
  message: string;
  actor: string;
}): Promise<ActivityEntry> {
  const [row] = await db
    .insert(activity)
    .values({
      ts: Date.now(),
      kind: input.kind,
      message: input.message,
      actor: input.actor,
    })
    .returning();

  const entry: ActivityEntry = {
    id: row.id,
    ts: Number(row.ts),
    kind: row.kind,
    message: row.message,
    actor: row.actor,
    serviceId: row.service_id ?? null,
  };

  broadcast("activity.created", entry);
  return entry;
}

export async function listActivity(limit = 50): Promise<ActivityEntry[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const { rows } = await pool.query<{
    id: number;
    ts: string | number;
    kind: string;
    message: string;
    actor: string;
    service_id: number | null;
  }>(
    `SELECT id, ts, kind, message, actor, service_id
       FROM activity
      ORDER BY ts DESC
      LIMIT $1`,
    [safeLimit],
  );

  return rows.map((row) => ({
    id: row.id,
    ts: Number(row.ts),
    kind: row.kind,
    message: row.message,
    actor: row.actor,
    serviceId: row.service_id,
  }));
}

// ---------------------------------------------------------------------------
// Background service monitor
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_SECONDS = 4;
const MIN_INTERVAL_SECONDS = 2;
const MAX_INTERVAL_SECONDS = 300;

const STATUS_KIND: Record<Status, string> = {
  healthy: "healthy",
  unhealthy: "unhealthy",
  stopped: "stop",
  starting: "status",
  stopping: "status",
  restarting: "status",
};

async function pollSeconds(): Promise<number> {
  try {
    const settings = await getSettings();
    return Math.min(
      Math.max(settings.healthCheckIntervalSeconds, MIN_INTERVAL_SECONDS),
      MAX_INTERVAL_SECONDS,
    );
  } catch {
    return DEFAULT_INTERVAL_SECONDS;
  }
}

function signature(detail: ServiceDetail): string {
  return `${detail.status}|${detail.image}|${detail.port}|${detail.healthNote}`;
}

/** Poll Docker in the background so status changes are recorded even with no browser open. */
export function startServiceMonitor(fallbackServices: Service[]): () => void {
  const previous = new Map<string, string>();
  let ticking = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;

    try {
      // Refresh the database-backed registry so edits take effect without restart.
      let services = fallbackServices;
      try {
        services = loadServices();
      } catch {
        // Keep the last usable snapshot if the file is being edited.
      }

      if (!(await isDockerAvailable())) {
        // Docker being unavailable still counts as downtime for every service.
        await recordStatusSamples(
          services.map((service) => ({
            id: service.id,
            name: service.name,
            status: "stopped" as const,
          })),
        ).catch(() => {
          // History is best-effort; monitoring must keep running.
        });

        // No container status to judge, but the external rules still run.
        await evaluateAlerts([]);
        return;
      }

      const byProject = await listContainersByProject();
      const details = await Promise.all(
        services.map((service) =>
          getServiceDetails(service, byProject.get(projectNameForFolder(service.folder))?.[0]),
        ),
      );

      broadcast("stats", { ts: Date.now(), services: details });

      await recordStatusSamples(
        details.map((detail) => ({
          id: detail.id,
          name: detail.name,
          status: detail.status,
        })),
      ).catch(() => {
        // History is best-effort; monitoring must keep running.
      });

      // Alert rules run on every status tick, independent of the UI.
      await evaluateAlerts(details);

      for (const detail of details) {
        const current = signature(detail);
        const before = previous.get(detail.id);
        previous.set(detail.id, current);

        // The first observation only seeds the baseline.
        if (before === undefined || before === current) continue;

        broadcast("service.updated", detail);

        const beforeStatus = before.split("|")[0] as Status;
        if (beforeStatus !== detail.status) {
          await recordActivity({
            kind: STATUS_KIND[detail.status],
            message: `${detail.name} is ${detail.status}`,
            actor: "system",
          });
        }
      }
    } catch {
      // Docker hiccups are transient; the next tick retries.
    } finally {
      ticking = false;
    }
  }

  const schedule = () => {
    if (stopped) return;
    void pollSeconds().then((seconds) => {
      if (stopped) return;
      timer = setTimeout(async () => {
        timer = null;
        if (stopped) return;
        await tick();
        schedule();
      }, seconds * 1000);
    });
  };

  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
