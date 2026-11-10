import { pool } from "./db.js";
import type { AlertSeverity } from "./alerts.js";

export interface Incident {
  id: number;
  start: number;
  end: number;
  durationMs: number;
  cause: string;
  severity: AlertSeverity;
  rule: string;
  serviceKey: string | null;
  link: string | null;
}

export interface IncidentsResponse {
  incidents: Incident[];
}

interface IncidentRow {
  id: number;
  ts: string | number;
  resolved_at: string | number;
  rule: string;
  severity: string;
  message: string;
  service_key: string | null;
  link: string | null;
}

/** Resolved alerts are the incident history; active alerts appear in the bell. */
export async function listIncidents(limit = 50): Promise<IncidentsResponse> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);

  const { rows } = await pool.query<IncidentRow>(
    `SELECT id, ts, resolved_at, rule, severity, message, service_key, link
       FROM alerts
      WHERE resolved_at IS NOT NULL
      ORDER BY ts DESC
      LIMIT $1`,
    [safeLimit],
  );

  return {
    incidents: rows.map((row) => {
      const start = Number(row.ts);
      const end = Number(row.resolved_at);
      return {
        id: row.id,
        start,
        end,
        durationMs: Math.max(0, end - start),
        cause: row.message,
        severity: row.severity as AlertSeverity,
        rule: row.rule,
        serviceKey: row.service_key,
        link: row.link,
      };
    }),
  };
}
