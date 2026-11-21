/** Pure SQL building for activity/audit queries (no database import, so it is unit-testable). */

export type ActivityOutcome = "ok" | "failed";
export type ActivitySource = "event" | "audit";

export interface ActivityFilter {
  limit?: number;
  /** Return entries strictly older than this id (cursor for "Load more"). */
  beforeId?: number;
  kind?: string;
  actor?: string;
  service?: string;
  source?: ActivitySource;
  outcome?: ActivityOutcome;
  /** Inclusive epoch-ms bounds. */
  from?: number;
  to?: number;
  /** Case-insensitive substring match on the message. */
  q?: string;
}

export const MAX_ACTIVITY_LIMIT = 500;

/** Build the WHERE clause for a filter. Values are always bound parameters. */
export function activityWhere(filter: ActivityFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace("?", `$${params.length}`));
  };

  if (filter.beforeId !== undefined) add("id < ?", filter.beforeId);
  if (filter.kind) {
    // "service.*" style prefixes match a whole family of kinds.
    if (filter.kind.endsWith(".*")) add("kind LIKE ?", `${filter.kind.slice(0, -1).replace(/[%_\\]/g, "\\$&")}%`);
    else add("kind = ?", filter.kind);
  }
  if (filter.actor) add("actor = ?", filter.actor);
  if (filter.service) add("service_key = ?", filter.service);
  if (filter.source) add("source = ?", filter.source);
  if (filter.outcome) add("outcome = ?", filter.outcome);
  if (filter.from !== undefined) add("ts >= ?", filter.from);
  if (filter.to !== undefined) add("ts <= ?", filter.to);
  if (filter.q) add("message ILIKE ?", `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`);

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

