"use client";

import type { AlertSeverity, Incident } from "@/lib/api";
import { useIncidents } from "@/lib/use-uptime";
import { useServices } from "@/lib/use-services";
import { cn } from "@/lib/utils";

const RULE_SUBJECT: Record<string, string> = {
  jenkins_failed: "Jenkins",
  sonar_gate_failed: "SonarQube",
  ollama_unreachable: "Ollama",
  service_stopped: "Service",
  service_unhealthy: "Service",
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  bad: "bg-bad",
  warn: "bg-warn",
  info: "bg-info",
};

function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function subjectOf(incident: Incident, names: Map<string, string>): string {
  if (incident.serviceKey) {
    const name = names.get(incident.serviceKey);
    if (name) return name;
  }
  return RULE_SUBJECT[incident.rule] ?? "StackPilot";
}

export function IncidentsTable() {
  const { data, isPending, error } = useIncidents();
  const { data: services } = useServices();

  const names = new Map((services ?? []).map((service) => [service.id, service.name]));
  const incidents = data?.incidents ?? [];

  return (
    <section
      aria-label="Incidents"
      className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold text-foreground">Incidents</h2>
          <p className="m-0 text-xs text-muted-foreground">Resolved alerts, newest first.</p>
        </div>
        {!isPending && !error && (
          <span className="text-xs text-muted-foreground">
            {incidents.length} resolved
          </span>
        )}
      </div>

      {error ? (
        <p className="m-0 rounded-[8px] border border-bad-bg bg-bad-bg px-3 py-2 text-xs text-bad">
          Incidents are unavailable: {error.message}
        </p>
      ) : isPending ? (
        <p className="m-0 text-sm text-muted-foreground">Loading incidents…</p>
      ) : incidents.length === 0 ? (
        <p className="m-0 rounded-[10px] border border-dashed border-border2 px-4 py-6 text-center text-sm text-muted-foreground">
          No resolved incidents yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                {["Start", "End", "Duration", "Service", "Cause"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border px-3 py-2.5 font-medium"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td className="whitespace-nowrap border-b border-track px-3 py-3 text-fg2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          SEVERITY_COLOR[incident.severity],
                        )}
                        title={incident.severity}
                        aria-hidden="true"
                      />
                      {formatTimestamp(incident.start)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-track px-3 py-3 text-fg2">
                    {formatTimestamp(incident.end)}
                  </td>
                  <td className="whitespace-nowrap border-b border-track px-3 py-3 font-mono text-xs text-fg2">
                    {formatDuration(incident.durationMs)}
                  </td>
                  <td className="whitespace-nowrap border-b border-track px-3 py-3 font-semibold text-foreground">
                    {subjectOf(incident, names)}
                  </td>
                  <td className="max-w-[420px] border-b border-track px-3 py-3 text-fg2">
                    {incident.cause}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
