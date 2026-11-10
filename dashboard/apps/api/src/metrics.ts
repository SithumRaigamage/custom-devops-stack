import { pool } from "./db.js";
import { isDockerAvailable, listContainersByProject, projectNameForFolder } from "./docker.js";
import { loadServices, type Service } from "./services.js";
import { getServiceDetails } from "./status.js";

export type MetricsRange = "1h" | "6h" | "24h";

export interface MetricPoint {
  ts: number;
  cpuPct: number;
  memPct: number;
  memBytes: number;
}

export interface ServiceSeries {
  id: string;
  name: string;
  points: MetricPoint[];
}

export interface MetricsResponse {
  range: MetricsRange;
  from: number;
  to: number;
  points: MetricPoint[];
  services: ServiceSeries[];
  latest: MetricPoint | null;
}

const SAMPLE_INTERVAL_MS = 15_000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_POINTS = 120;

export const RANGE_MS: Record<MetricsRange, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

/** Accept only the three supported ranges; anything else falls back to 1h. */
export function parseMetricsRange(value: unknown): MetricsRange {
  return value === "6h" || value === "24h" ? value : "1h";
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** One sample for every running service, sharing a single timestamp. */
async function sampleRunningServices(services: Service[]): Promise<void> {
  if (!(await isDockerAvailable())) return;

  const byProject = await listContainersByProject();
  const ts = Date.now();

  const samples = await Promise.all(
    services.map(async (service) => {
      const container = byProject.get(projectNameForFolder(service.folder))?.[0];
      if (!container || container.State !== "running") return null;

      const detail = await getServiceDetails(service, container);
      if (detail.status === "stopped") return null;

      return {
        key: service.id,
        name: service.name,
        cpuPct: detail.cpuPct,
        memPct: detail.memPct,
        memBytes: detail.memBytes,
      };
    }),
  );

  const rows = samples.filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return;

  const params: unknown[] = [];
  const tuples = rows.map((row, index) => {
    const base = index * 6;
    params.push(ts, row.key, row.name, row.cpuPct, row.memBytes, row.memPct);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  await pool.query(
    `INSERT INTO metrics (ts, service_key, service_name, cpu, mem_bytes, mem_pct)
     VALUES ${tuples.join(", ")}`,
    params,
  );
}

async function purgeOldSamples(): Promise<void> {
  await pool.query("DELETE FROM metrics WHERE ts < $1", [Date.now() - RETENTION_MS]);
}

let started = false;

/**
 * Sample every 15s and drop rows older than 24h hourly. Both timers are
 * unref'd so they never keep the process alive on their own.
 */
export function startMetricsSampler(fallbackServices: Service[]): void {
  if (started) return;
  started = true;

  const sample = () => {
    // Reload services.yaml so registry edits are reflected without a restart.
    let services = fallbackServices;
    try {
      services = loadServices();
    } catch {
      // Keep the last usable snapshot while the file is being edited.
    }

    void sampleRunningServices(services).catch(() => {
      // Docker/DB hiccups are transient; the next interval retries.
    });
  };

  const purge = () => {
    void purgeOldSamples().catch(() => {
      // Retried on the next hourly run.
    });
  };

  sample();
  purge();

  setInterval(sample, SAMPLE_INTERVAL_MS).unref();
  setInterval(purge, 60 * 60 * 1000).unref();
}

/** Evenly reduce a time-ascending series to at most MAX_POINTS points. */
function downsample<T>(points: T[]): T[] {
  if (points.length <= MAX_POINTS) return points;

  const result: T[] = [];
  for (let i = 0; i < MAX_POINTS; i += 1) {
    const index = Math.round((i * (points.length - 1)) / (MAX_POINTS - 1));
    result.push(points[index]);
  }
  return result;
}

interface RawRow {
  ts: string;
  service_key: string;
  service_name: string;
  cpu: number;
  mem_bytes: number;
  mem_pct: number;
}

/**
 * Per-timestamp stack totals (CPU % summed across containers, memory % summed
 * across configured container limits) plus a per-service series. Both are
 * downsampled to at most 120 points.
 */
export async function readMetricsRange(range: MetricsRange): Promise<MetricsResponse> {
  const to = Date.now();
  const from = to - RANGE_MS[range];

  const { rows } = await pool.query<RawRow>(
    `SELECT ts, service_key, service_name, cpu, mem_bytes, mem_pct
       FROM metrics
      WHERE ts >= $1
      ORDER BY ts ASC`,
    [from],
  );

  // Aggregate rows that share a sample timestamp into one stack total.
  const totalsByTs = new Map<number, MetricPoint>();
  const seriesByKey = new Map<string, ServiceSeries>();

  for (const row of rows) {
    const ts = Number(row.ts);
    const cpuPct = Number(row.cpu);
    const memPct = Number(row.mem_pct);
    const memBytes = Number(row.mem_bytes);

    const total = totalsByTs.get(ts);
    if (total) {
      total.cpuPct += cpuPct;
      total.memPct += memPct;
      total.memBytes += memBytes;
    } else {
      totalsByTs.set(ts, { ts, cpuPct, memPct, memBytes });
    }

    let series = seriesByKey.get(row.service_key);
    if (!series) {
      series = { id: row.service_key, name: row.service_name, points: [] };
      seriesByKey.set(row.service_key, series);
    }
    series.points.push({ ts, cpuPct, memPct, memBytes });
  }

  const points = downsample(
    [...totalsByTs.values()]
      .sort((a, b) => a.ts - b.ts)
      .map((point) => ({
        ts: point.ts,
        cpuPct: round2(point.cpuPct),
        memPct: round2(point.memPct),
        memBytes: Math.round(point.memBytes),
      })),
  );

  const services = [...seriesByKey.values()].map((series) => ({
    id: series.id,
    name: series.name,
    points: downsample(
      series.points
        .sort((a, b) => a.ts - b.ts)
        .map((point) => ({
          ts: point.ts,
          cpuPct: round2(point.cpuPct),
          memPct: round2(point.memPct),
          memBytes: Math.round(point.memBytes),
        })),
    ),
  }));

  return {
    range,
    from,
    to,
    points,
    services,
    latest: points.length > 0 ? points[points.length - 1] : null,
  };
}
