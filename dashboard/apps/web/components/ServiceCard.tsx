"use client";

import {
  ExternalLink,
  GitBranch,
  MessageSquare,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Square,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { Service, ServiceAction } from "@/lib/api";
import { metricsFor } from "@/lib/mock";
import { useServiceAction } from "@/lib/use-services";
import { cn } from "@/lib/utils";
import { StatusBadge, type UiStatus } from "./StatusBadge";

const ICONS: Record<string, LucideIcon> = {
  jenkins: GitBranch,
  sonarqube: ShieldCheck,
  "open-webui": MessageSquare,
};

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

function portFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return "—";
  }
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
}: {
  service: Service;
  onViewLogs: (service: Service) => void;
}) {
  const metrics = metricsFor(service.id);
  const mutation = useServiceAction(service.id);

  const pendingStatus =
    mutation.isPending && mutation.variables ? PENDING_STATUS[mutation.variables] : null;
  const status: UiStatus = pendingStatus ?? service.status;
  const running = service.status === "healthy" || service.status === "unhealthy";
  const busy = pendingStatus !== null;

  const startDisabled = busy || running;
  const stopDisabled = busy || service.status === "stopped";

  const Icon = ICONS[service.id] ?? Server;
  const note = status === "unhealthy" ? metrics.note : "";

  return (
    <article className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border2 bg-card2 text-brand-text">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 text-base font-semibold text-foreground">{service.name}</h3>
          <span className="text-xs text-muted-foreground">{metrics.description}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="m-0 grid grid-cols-3 gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Port</dt>
          <dd className="m-0 font-mono text-[13px] text-foreground">{portFromUrl(service.url)}</dd>
        </div>
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Uptime</dt>
          <dd className="m-0 text-[13px] text-foreground">{metrics.uptime}</dd>
        </div>
        <div className="flex flex-col gap-[3px]">
          <dt className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">Memory</dt>
          <dd className="m-0 text-[13px] text-foreground">{metrics.memoryLabel}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2.5">
        <Meter label="CPU" value={metrics.cpu} text={`${metrics.cpu}%`} series="cpu" />
        <Meter label="Memory" value={metrics.memory} text={`${metrics.memory}%`} series="memory" />
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
        <button type="button" onClick={() => onViewLogs(service)} className={TEXT_BUTTON}>
          <Terminal className="size-[14px]" strokeWidth={2} aria-hidden="true" />
          View Logs
        </button>
      </div>

      {mutation.isError && (
        <p className="m-0 text-xs text-bad">{mutation.error.message}</p>
      )}
    </article>
  );
}
