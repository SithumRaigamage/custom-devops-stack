"use client";

import type { Service, UptimeHour, UptimeStatus } from "@/lib/api";
import { useUptime } from "@/lib/use-uptime";
import { cn } from "@/lib/utils";

const HOURS = 168;

const STATUS_LABEL: Record<UptimeStatus, string> = {
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  restarting: "Restarting",
};

const STATUS_COLOR: Record<UptimeStatus, string> = {
  healthy: "bg-ok",
  unhealthy: "bg-warn",
  stopped: "bg-bad",
  starting: "bg-info",
  stopping: "bg-info",
  restarting: "bg-info",
};

const LEGEND = [
  { label: "Healthy", color: "bg-ok" },
  { label: "Degraded", color: "bg-warn" },
  { label: "Down", color: "bg-bad" },
  { label: "Transition", color: "bg-info" },
  { label: "No data", color: "bg-track" },
];

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function uptimeTone(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  if (value >= 99.5) return "text-ok";
  if (value >= 95) return "text-warn";
  return "text-bad";
}

function hourLabel(hour: UptimeHour | undefined): string {
  if (!hour) return "No status data";

  const stamp = new Date(hour.start).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });

  return `${stamp} · ${hour.status ? STATUS_LABEL[hour.status] : "No data"}`;
}

export function UptimeSection({ services }: { services: Service[] }) {
  const { data, isPending, error } = useUptime();
  const byId = new Map((data?.services ?? []).map((entry) => [entry.id, entry]));
  const collecting = !isPending && !(data?.services.some((entry) => entry.samples7d > 0) ?? false);

  if (services.length === 0) return null;

  return (
    <section
      aria-label="Uptime"
      className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold text-foreground">Uptime</h2>
          <p className="m-0 text-xs text-muted-foreground">Hourly status · last 7 days</p>
        </div>

        <div
          aria-label="Status legend"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        >
          {LEGEND.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-[2px]", item.color)} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <p className="m-0 rounded-[8px] border border-bad-bg bg-bad-bg px-3 py-2 text-xs text-bad">
          Uptime history is unavailable: {error.message}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {services.map((service) => {
              const uptime = byId.get(service.id);
              const hours = uptime?.hours ?? [];

              return (
                <div key={service.id} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{service.name}</span>
                    <span className="ml-auto text-muted-foreground">
                      24h{" "}
                      <span
                        className={cn(
                          "font-mono text-[12px] font-semibold",
                          uptimeTone(uptime?.uptime24h),
                        )}
                      >
                        {formatPercent(uptime?.uptime24h)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      7d{" "}
                      <span
                        className={cn(
                          "font-mono text-[12px] font-semibold",
                          uptimeTone(uptime?.uptime7d),
                        )}
                      >
                        {formatPercent(uptime?.uptime7d)}
                      </span>
                    </span>
                  </div>

                  <div className="overflow-x-auto pb-1">
                    <div className="min-w-[960px]">
                      <div
                        role="img"
                        aria-label={`${service.name} status for the last 7 days`}
                        className="flex h-5 gap-px"
                      >
                        {Array.from({ length: HOURS }, (_, index) => {
                          const hour = hours[index];
                          return (
                            <span
                              key={hour?.start ?? index}
                              title={hourLabel(hour)}
                              aria-hidden="true"
                              className={cn(
                                "h-full flex-1 rounded-[2px]",
                                hour?.status ? STATUS_COLOR[hour.status] : "bg-track",
                              )}
                            />
                          );
                        })}
                      </div>

                      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                        <span>7 days ago</span>
                        <span>Now</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {collecting && (
            <p className="m-0 text-xs text-muted-foreground">
              Status history starts now. The strip and percentages fill in as the monitor samples
              each service.
            </p>
          )}
        </>
      )}
    </section>
  );
}
