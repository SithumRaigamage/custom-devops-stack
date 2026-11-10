"use client";

import {
  ExternalLink,
  Play,
  RefreshCw,
  Square,
  Terminal,
} from "lucide-react";
import { resolveServiceIcon } from "@/lib/service-icons";
import type { Service, ServiceAction } from "@/lib/api";
import { useServiceAction } from "@/lib/use-services";
import { useUptime } from "@/lib/use-uptime";
import { cn } from "@/lib/utils";
import { StatusBadge, type UiStatus } from "./StatusBadge";

const PENDING_STATUS: Record<ServiceAction, UiStatus> = {
  start: "starting",
  stop: "stopping",
  restart: "restarting",
};

const BUTTON =
  "inline-flex h-[38px] items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-[0.38]";
const PRIMARY = cn(BUTTON, "border border-brand bg-brand text-brand-foreground");
const GHOST = cn(BUTTON, "border border-border2 bg-card2 text-fg2");
const OPEN_LINK = cn(BUTTON, "border border-border2 bg-card2 text-fg2 no-underline");
const TEXT_BUTTON =
  "ml-auto inline-flex h-[38px] items-center gap-1.5 rounded-[8px] border border-transparent bg-transparent px-3 text-[13px] font-semibold text-brand-text";

function formatUptimePct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function uptimeTone(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  if (value >= 99.5) return "text-ok";
  if (value >= 95) return "text-warn";
  return "text-bad";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

function Meter({
  label,
  value,
  text,
  series,
}: {
  label: string;
  value: number;
  text: string;
  series: "cpu" | "memory";
}) {
  const hot = value >= 70;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted2">{label}</span>
        <span className="font-mono text-fg2">{text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            hot ? "bg-hot" : series === "cpu" ? "bg-brand" : "bg-series2",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ServiceCard({
  service,
  onViewLogs,
  hideLogsButton = false,
}: {
  service: Service;
  onViewLogs?: (service: Service) => void;
  hideLogsButton?: boolean;
}) {
  const mutation = useServiceAction(service.id);
  const { data: uptimeData } = useUptime();
  const uptimeStats = uptimeData?.services.find((entry) => entry.id === service.id);

  const pendingStatus =
    mutation.isPending && mutation.variables ? PENDING_STATUS[mutation.variables] : null;
  const status: UiStatus = pendingStatus ?? service.status;
  const running = service.status !== "stopped";
  const busy = pendingStatus !== null;

  const cpuPct = Math.round(service.cpuPct * 10) / 10;
  const memPct = Math.round(service.memPct * 10) / 10;

  const startDisabled = busy || running;
  const stopDisabled = busy || service.status === "stopped";

  const Icon = resolveServiceIcon(service.icon, service.id);
  const note = status === "unhealthy" ? service.healthNote : "";

  return (
    <article className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border2 bg-card2 text-brand-text">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 text-base font-semibold text-foreground">{service.name}</h3>
          <span className="text-xs text-muted-foreground">{service.desc}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      <div
        className="flex items-center gap-2 text-[11px] text-muted-foreground"
        title={
          uptimeStats
            ? `${uptimeStats.samples24h} status samples in the last 24 hours, ${uptimeStats.samples7d} in the last 7 days`
            : "No status samples yet"
        }
      >
        <span className="uppercase tracking-[0.05em]">Uptime 24h</span>
        <span
          className={cn(
            "font-mono text-[12px] font-semibold",
            uptimeTone(uptimeStats?.uptime24h),
          )}
        >
          {formatUptimePct(uptimeStats?.uptime24h)}
        </span>
        <span className="ml-auto uppercase tracking-[0.05em]">7d</span>
        <span
          className={cn(
            "font-mono text-[12px] font-semibold",
            uptimeTone(uptimeStats?.uptime7d),
          )}
        >
          {formatUptimePct(uptimeStats?.uptime7d)}
        </span>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Port</dt>
          <dd className="m-0 font-mono text-[13px] text-foreground">{service.port}</dd>
        </div>
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Uptime</dt>
          <dd className="m-0 text-[13px] text-foreground">{service.uptime}</dd>
        </div>
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Memory</dt>
          <dd className="m-0 text-[13px] text-foreground">{formatBytes(service.memBytes)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2.5">
        <Meter label="CPU" value={cpuPct} text={`${cpuPct}%`} series="cpu" />
        <Meter label="Memory" value={memPct} text={`${memPct}%`} series="memory" />
      </div>

      {note && (
        <div className="rounded-[8px] border border-warn-bg bg-warn-bg px-2.5 py-2 text-xs text-warn">
          {note}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-track pt-1">
        <button
          type="button"
          onClick={() => mutation.mutate("start")}
          disabled={startDisabled}
          className={PRIMARY}
        >
          <Play className="size-3" fill="currentColor" stroke="none" aria-hidden="true" />
          Start
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate("stop")}
          disabled={stopDisabled}
          className={GHOST}
        >
          <Square className="size-[11px]" fill="currentColor" stroke="none" aria-hidden="true" />
          Stop
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate("restart")}
          disabled={stopDisabled}
          className={GHOST}
        >
          <RefreshCw className="size-[13px]" strokeWidth={2.2} aria-hidden="true" />
          Restart
        </button>
        <a
          href={service.url}
          target="_blank"
          rel="noopener"
          aria-label={`Open ${service.name} in a new tab`}
          className={OPEN_LINK}
        >
          <ExternalLink className="size-[13px]" strokeWidth={2} aria-hidden="true" />
          Open
        </a>
        {!hideLogsButton && onViewLogs && (
          <button type="button" onClick={() => onViewLogs(service)} className={TEXT_BUTTON}>
            <Terminal className="size-[14px]" strokeWidth={2} aria-hidden="true" />
            View Logs
          </button>
        )}
      </div>

      {mutation.isError && (
        <p className="m-0 text-xs text-bad">{mutation.error.message}</p>
      )}
    </article>
  );
}
