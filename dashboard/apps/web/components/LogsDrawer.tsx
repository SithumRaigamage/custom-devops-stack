"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Pause, Play, X } from "lucide-react";
import {
  fetchJenkinsConsole,
  fetchServiceLogs,
  serviceLogStreamUrl,
  type LogLevel,
  type LogLine,
  type Service,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

const TAIL = 200;
const MAX_LINES = 2000;
const LEVELS: LogLevel[] = ["INFO", "WARN", "ERROR"];

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: "text-log-info",
  WARN: "text-log-warn",
  ERROR: "text-log-error",
};

const LEVEL_ACTIVE: Record<LogLevel, string> = {
  INFO: "border-log-info/50 bg-log-info/10 text-log-info",
  WARN: "border-log-warn/50 bg-log-warn/10 text-log-warn",
  ERROR: "border-log-error/50 bg-log-error/10 text-log-error",
};

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-log-time/30 bg-white/5 px-2.5 text-[12px] font-semibold text-log-fg transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

function folderName(folder: string): string {
  return `${folder.split("/").filter(Boolean).pop() ?? folder}/`;
}

function clockTime(ts: string): string {
  if (!ts) return "—";
  const match = ts.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? ts;
}

function cap(lines: LogLine[]): LogLine[] {
  return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
}

/** Jenkins consoleText has no per-line JSON; classify it locally. */
function consoleLogLine(raw: string): LogLine {
  const msg = raw.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
  const level: LogLevel = /\b(error|fatal|exception|failed|failure)\b/i.test(msg)
    ? "ERROR"
    : /\bwarn(?:ing)?\b/i.test(msg)
      ? "WARN"
      : "INFO";
  return { ts: "", level, msg };
}

export interface JenkinsConsoleSource {
  job: string;
  num: number;
  status?: "success" | "failed" | "unstable" | "aborted" | "running";
}

type StreamState = "connecting" | "live" | "reconnecting" | "paused";

type LogsDrawerProps = {
  onClose: () => void;
} & (
  | { service: Service; console?: never }
  | { service?: never; console: JenkinsConsoleSource }
);

export function LogsDrawer({ service, console: consoleSource, onClose }: LogsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const serviceId = service?.id;
  const consoleJob = consoleSource?.job;
  const consoleNum = consoleSource?.num;

  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [filter, setFilter] = useState("");
  const [levels, setLevels] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
  });
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  );

  const pausedRef = useRef(false);
  const bufferedRef = useRef<LogLine[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const { data, isPending, error } = useQuery<LogLine[]>({
    queryKey: serviceId
      ? ["logs", serviceId, TAIL]
      : ["jenkins-console", consoleJob, consoleNum, TAIL],
    queryFn: async ({ signal }) => {
      if (serviceId) return fetchServiceLogs(serviceId, TAIL, signal);
      if (consoleJob && consoleNum) {
        const result = await fetchJenkinsConsole(consoleJob, consoleNum, TAIL, signal);
        return result.lines.map(consoleLogLine);
      }
      return [];
    },
    enabled: Boolean(serviceId || (consoleJob && consoleNum)),
    staleTime: 0,
  });

  // Reset the drawer whenever it is opened for another source.
  useEffect(() => {
    setLines([]);
    setBuffered(0);
    setPaused(false);
    setFilter("");
    setConnection("connecting");
    pausedRef.current = false;
    bufferedRef.current = [];
  }, [serviceId, consoleJob, consoleNum]);

  useEffect(() => {
    if (Array.isArray(data)) setLines(data);
  }, [data]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Load the tail first, then follow new lines over SSE (service logs only).
  useEffect(() => {
    if (!serviceId || isPending) return;

    setConnection("connecting");
    const source = new EventSource(serviceLogStreamUrl(serviceId));

    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("reconnecting");
    source.onmessage = (event) => {
      let line: LogLine;
      try {
        line = JSON.parse(event.data) as LogLine;
      } catch {
        return;
      }

      if (pausedRef.current) {
        bufferedRef.current = cap([...bufferedRef.current, line]);
        setBuffered(bufferedRef.current.length);
        return;
      }

      setLines((previous) => cap([...previous, line]));
    };

    return () => source.close();
  }, [serviceId, isPending]);

  useEffect(() => {
    if (paused || !stickToBottom.current) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines, paused]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return lines.filter(
      (line) =>
        levels[line.level] && (query === "" || line.msg.toLowerCase().includes(query)),
    );
  }, [lines, filter, levels]);

  function append(pending: LogLine[]) {
    if (pending.length === 0) return;
    setLines((previous) => cap([...previous, ...pending]));
  }

  function togglePause() {
    if (paused) {
      pausedRef.current = false;
      setPaused(false);
      const pending = bufferedRef.current;
      bufferedRef.current = [];
      setBuffered(0);
      append(pending);
      return;
    }

    pausedRef.current = true;
    setPaused(true);
  }

  function download() {
    const text = filtered
      .map((line) => `${line.ts || new Date().toISOString()} ${line.level} ${line.msg}`)
      .join("\n");
    const blob = new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = service
      ? `${service.id}-logs.log`
      : `${consoleJob ?? "job"}-${consoleNum ?? 0}-console.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function onScroll() {
    const body = bodyRef.current;
    if (!body) return;
    stickToBottom.current = body.scrollHeight - body.scrollTop - body.clientHeight < 32;
  }

  const state: StreamState = paused ? "paused" : connection;
  const title = service
    ? `${service.name} logs`
    : `${consoleJob ?? "Build"} #${consoleNum ?? ""} console`;
  const subtitle = service
    ? `docker compose logs --tail ${TAIL} · ${folderName(service.folder)}`
    : `Jenkins console · last ${TAIL} lines`;
  const badge = service?.status ?? consoleSource?.status;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close logs"
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 cursor-default bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="logs-title"
        className="relative flex h-full w-[600px] max-w-full animate-[drawer-in_0.22s_ease-out] flex-col border-l border-border2 bg-sidebar shadow-[var(--shadow-drawer)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="logs-title" className="m-0 text-base font-semibold text-foreground">
              {title}
            </h2>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {subtitle}
            </span>
          </div>
          {badge && <StatusBadge status={badge} />}
          <button
            ref={closeRef}
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close logs"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-border2 bg-card2 text-fg2"
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-log-bg">
          <div className="flex flex-wrap items-center gap-2 border-b border-log-time/20 px-5 py-3 font-mono">
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter logs"
              placeholder="Filter logs…"
              className="h-8 min-w-[140px] flex-1 rounded-[6px] border border-log-time/30 bg-white/5 px-2 text-[12px] text-log-fg placeholder:text-log-time focus:border-log-info focus:outline-none"
            />

            {service && (
              <button
                type="button"
                onClick={togglePause}
                className={cn(BUTTON, paused && "border-log-info/50 text-log-info")}
              >
                {paused ? (
                  <Play className="size-3" fill="currentColor" stroke="none" aria-hidden="true" />
                ) : (
                  <Pause className="size-3" fill="currentColor" stroke="none" aria-hidden="true" />
                )}
                {paused ? "Resume" : "Pause"}
              </button>
            )}

            <button
              type="button"
              onClick={download}
              disabled={filtered.length === 0}
              aria-label="Download logs"
              className={cn(BUTTON, "px-2")}
            >
              <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
              <span className="sr-only">Download .log</span>
            </button>

            <div role="group" aria-label="Log levels" className="flex items-center gap-1.5">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={levels[level]}
                  onClick={() =>
                    setLevels((previous) => ({ ...previous, [level]: !previous[level] }))
                  }
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2 text-[11px] font-semibold",
                    levels[level]
                      ? LEVEL_ACTIVE[level]
                      : "border-log-time/30 text-log-time opacity-60",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {level}
                </button>
              ))}
            </div>

            {service ? (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-log-time">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    state === "live"
                      ? "bg-log-info"
                      : state === "reconnecting"
                        ? "bg-log-warn"
                        : state === "paused"
                          ? "bg-log-time"
                          : "bg-log-time animate-pulse",
                  )}
                  aria-hidden="true"
                />
                {state === "live"
                  ? "Live"
                  : state === "reconnecting"
                    ? "Reconnecting…"
                    : state === "paused"
                      ? "Paused"
                      : "Connecting…"}
              </span>
            ) : (
              <span className="ml-auto text-[11px] text-log-time">Snapshot</span>
            )}
          </div>

          <div
            ref={bodyRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5 font-mono text-[12.5px] leading-[1.7]"
          >
            {error && lines.length === 0 ? (
              <div className="text-log-error">{error.message}</div>
            ) : isPending && lines.length === 0 ? (
              <div className="text-log-time">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-log-time">
                {lines.length === 0
                  ? service
                    ? "No log output yet. New lines appear here as the container writes them."
                    : "No console output for this build yet."
                  : "No lines match the current filter."}
              </div>
            ) : (
              filtered.map((line, index) => (
                <div key={index} className="flex gap-3">
                  <span className="w-16 shrink-0 text-log-time">{clockTime(line.ts)}</span>
                  <span
                    className={cn(
                      "w-11 shrink-0 font-medium",
                      LEVEL_COLOR[line.level] ?? "text-log-time",
                    )}
                  >
                    {line.level}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-log-fg">{line.msg}</span>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-log-time/20 px-5 py-2 text-[11px] text-log-time">
            <span>
              {filtered.length} of {lines.length} lines
              {paused && buffered > 0 ? ` · ${buffered} buffered` : ""}
            </span>
            <span>
              {service ? "Docker timestamps · INFO / WARN / ERROR" : "Jenkins console · tail"}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
