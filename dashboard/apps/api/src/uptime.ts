import { pool } from "./db.js";
import { loadServices } from "./services.js";
import type { Status } from "./status.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SAMPLE_INTERVAL_MS = 60_000;
const UPTIME_HOURS = 168;
export const STATUS_RETENTION_MS = 7 * DAY_MS;

/** A service is "up" while its container is running, even if unhealthy. */
const UP_STATUSES = new Set<Status>([
  "healthy",
  "unhealthy",
  "starting",
  "restarting",
]);

/** Higher wins when an hour contains several statuses. */
const WORST_STATUS: Record<Status, number> = {
  healthy: 0,
  starting: 1,
  stopping: 2,
  restarting: 3,
  unhealthy: 4,
  stopped: 5,
};

export interface UptimeHour {
  start: number;
  status: Status | null;
}

export interface ServiceUptime {
  id: string;
  name: string;
  uptime24h: number | null;
  uptime7d: number | null;
  samples24h: number;
  samples7d: number;
  hours: UptimeHour[];
}

export interface UptimeResponse {
  from: number;
  to: number;
  services: ServiceUptime[];
}

export interface StatusSampleInput {
  id: string;
  name: string;
  status: Status;
}

interface SampleRow {
  ts: string | number;
  service_key: string;
  status: string;
}

interface LastSample {
  ts: number;
  status: Status;
}

const lastSamples = new Map<string, LastSample>();
let lastPurge = 0;

/**
 * Persist status history at most once a minute per service, plus immediately
 * whenever a service changes state. Called by the service monitor on every tick.
 */
export async function recordStatusSamples(
  samples: StatusSampleInput[],
): Promise<void> {
  if (samples.length === 0) return;

  const now = Date.now();
  const rows = samples.filter((sample) => {
    const previous = lastSamples.get(sample.id);
    return (
      !previous ||
      previous.status !== sample.status ||
      now - previous.ts >= SAMPLE_INTERVAL_MS
    );
  });

  if (rows.length > 0) {
    const params: unknown[] = [];
    const tuples = rows.map((row, index) => {
      const base = index * 4;
      params.push(now, row.id, row.name, row.status);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await pool.query(
      `INSERT INTO status_samples (ts, service_key, service_name, status)
       VALUES ${tuples.join(", ")}`,
      params,
    );

    for (const row of rows) {
      lastSamples.set(row.id, { ts: now, status: row.status });
    }
  }

  // Keep seven days, independent of the 24-hour metrics retention.
  if (now - lastPurge >= HOUR_MS) {
    lastPurge = now;
    await pool.query("DELETE FROM status_samples WHERE ts < $1", [
      now - STATUS_RETENTION_MS,
    ]);
  }
}

function uptimePercent(rows: SampleRow[]): number | null {
  if (rows.length === 0) return null;
  const up = rows.filter((row) => UP_STATUSES.has(row.status as Status)).length;
  return Math.round((up / rows.length) * 1000) / 10;
}

/**
 * Per-service 24h/7d uptime plus a 168-cell hourly strip. Hours with no samples
 * are null so the web app can render them as "no data" rather than as downtime.
 */
export async function readUptime(): Promise<UptimeResponse> {
  const to = Date.now();
  const from = to - STATUS_RETENTION_MS;

  const { rows } = await pool.query<SampleRow>(
    `SELECT ts, service_key, status
       FROM status_samples
      WHERE ts >= $1
      ORDER BY ts ASC`,
    [from],
  );

  const samplesByService = new Map<string, SampleRow[]>();
  for (const row of rows) {
    const list = samplesByService.get(row.service_key);
    if (list) list.push(row);
    else samplesByService.set(row.service_key, [row]);
  }

  const currentHour = Math.floor(to / HOUR_MS) * HOUR_MS;
  const firstHour = currentHour - (UPTIME_HOURS - 1) * HOUR_MS;
  const dayAgo = to - DAY_MS;

  const services = loadServices().map((service): ServiceUptime => {
    const samples = samplesByService.get(service.id) ?? [];
    const samples24h = samples.filter((row) => Number(row.ts) >= dayAgo);

    const hours: UptimeHour[] = Array.from({ length: UPTIME_HOURS }, (_, index) => ({
      start: firstHour + index * HOUR_MS,
      status: null,
    }));

    for (const row of samples) {
      const ts = Number(row.ts);
      if (ts < firstHour) continue;

      const index = Math.min(
        UPTIME_HOURS - 1,
        Math.floor((ts - firstHour) / HOUR_MS),
      );
      const status = row.status as Status;
      const current = hours[index].status;
      if (current === null || WORST_STATUS[status] > WORST_STATUS[current]) {
        hours[index].status = status;
      }
    }

    return {
      id: service.id,
      name: service.name,
      uptime24h: uptimePercent(samples24h),
      uptime7d: uptimePercent(samples),
      samples24h: samples24h.length,
      samples7d: samples.length,
      hours,
    };
  });

  return { from, to, services };
}
