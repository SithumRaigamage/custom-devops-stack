import { activity, db, pool } from "./db.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { loadServices, type Service } from "./services.js";
import { getServiceDetails, type ServiceDetail, type Status } from "./status.js";
import { getSettings } from "./settings.js";
import { evaluateAlerts } from "./alerts.js";
import { broadcast } from "./sse.js";
import { recordStatusSamples } from "./uptime.js";
import { activityWhere, type ActivityFilter } from "./activity-filter.js";

export { activityWhere, MAX_ACTIVITY_LIMIT, type ActivityFilter } from "./activity-filter.js";

export { addEventClient, broadcast } from "./sse.js";

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

import type { ActivityOutcome, ActivitySource } from "./activity-filter.js";
export type { ActivityOutcome, ActivitySource } from "./activity-filter.js";

export interface ActivityEntry {
  id: number;
  ts: number;
  kind: string;
  message: string;
  actor: string;
  serviceId: number | null;
  /** Registry id of the service the entry is about, when there is one. */
  serviceKey: string | null;
  outcome: ActivityOutcome;
  /** "audit" for user/API state changes, "event" for status changes seen by the monitor. */
  source: ActivitySource;
}

export async function recordActivity(input: {
  kind: string;
  message: string;
  actor: string;
  serviceKey?: string | null;
  outcome?: ActivityOutcome;
  source?: ActivitySource;
}): Promise<ActivityEntry> {
  const [row] = await db
    .insert(activity)
    .values({
      ts: Date.now(),
      kind: input.kind,
      message: input.message,
      actor: input.actor,
      service_key: input.serviceKey ?? null,
      outcome: input.outcome ?? "ok",
      source: input.source ?? "event",
    })
    .returning();

  const entry = toEntry(row);
  broadcast("activity.created", entry);
  return entry;
}

interface ActivityRow {
  id: number;
  ts: string | number;
  kind: string;
  message: string;
  actor: string;
  service_id: number | null;
  service_key: string | null;
  outcome: string;
  source: string;
}

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    ts: Number(row.ts),
    kind: row.kind,
    message: row.message,
    actor: row.actor,
    serviceId: row.service_id ?? null,
    serviceKey: row.service_key ?? null,
    outcome: row.outcome === "failed" ? "failed" : "ok",
    source: row.source === "audit" ? "audit" : "event",
  };
}

export async function listActivity(
  filterOrLimit: ActivityFilter | number = {},
): Promise<{ activity: ActivityEntry[]; nextCursor: number | null }> {
  const filter = typeof filterOrLimit === "number" ? { limit: filterOrLimit } : filterOrLimit;
  const safeLimit = Math.min(Math.max(Math.trunc(filter.limit ?? 50), 1), 500);
  const where = activityWhere(filter);

  // Ask for one extra row to know whether another page exists.
  const { rows } = await pool.query<ActivityRow>(
    `SELECT id, ts, kind, message, actor, service_id, service_key, outcome, source
       FROM activity
       ${where.sql}
      ORDER BY id DESC
      LIMIT $${where.params.length + 1}`,
    [...where.params, safeLimit + 1],
  );

  const page = rows.slice(0, safeLimit).map(toEntry);
  const nextCursor = rows.length > safeLimit ? page[page.length - 1]!.id : null;
  return { activity: page, nextCursor };
}

/** Distinct values for the audit filter dropdowns. */
export async function activityFacets(): Promise<{
  kinds: string[];
  actors: string[];
  services: string[];
}> {
  const [kinds, actors, services] = await Promise.all([
    pool.query<{ v: string }>("SELECT DISTINCT kind AS v FROM activity ORDER BY 1"),
    pool.query<{ v: string }>("SELECT DISTINCT actor AS v FROM activity ORDER BY 1"),
    pool.query<{ v: string }>(
      "SELECT DISTINCT service_key AS v FROM activity WHERE service_key IS NOT NULL ORDER BY 1",
    ),
  ]);
  return {
    kinds: kinds.rows.map((r) => r.v),
    actors: actors.rows.map((r) => r.v),
    services: services.rows.map((r) => r.v),
  };
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
          getServiceDetails(service, byProject.get(projectNameForFolder(service.folder))),
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
            serviceKey: detail.id,
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
