"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { fetchServiceLogs, type Service } from "@/lib/api";
import { StatusBadge } from "./StatusBadge";

const TAIL = 100;

const LEVEL_COLOR: Record<string, string> = {
  INFO: "text-log-info",
  WARN: "text-log-warn",
  ERROR: "text-log-error",
};

interface LogLine {
  time: string;
  level: string;
  message: string;
}

/** Best effort over `docker compose logs`: strip the container prefix, timestamp and level. */
function parseLine(raw: string): LogLine {
  let line = raw.replace(/^\S+\s*\|\s?/, "");
  let time = "";

  const iso = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?\s+/);
  if (iso) {
    time = iso[1].slice(11);
    line = line.slice(iso[0].length);
  } else {
    const clock = line.match(/^(\d{2}:\d{2}:\d{2})\s+/);
    if (clock) {
      time = clock[1];
      line = line.slice(clock[0].length);
    }
  }

  const match = line.match(/^\[?(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\]?\b\s*/i);
  let level = match ? match[1].toUpperCase() : "";
  if (level === "WARNING") level = "WARN";
  if (match) line = line.slice(match[0].length);

  return { time, level, message: line };
}

function folderName(folder: string): string {
  return `${folder.split("/").filter(Boolean).pop() ?? folder}/`;
}

export function LogsDrawer({ service, onClose }: { service: Service; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { data, isPending, error } = useQuery({
    queryKey: ["logs", service.id, TAIL],
    queryFn: ({ signal }) => fetchServiceLogs(service.id, TAIL, signal),
    staleTime: 0,
  });

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const lines = (data ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(parseLine);

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
              {service.name} logs
            </h2>
            <span className="truncate font-mono text-xs text-muted-foreground">
              docker compose logs --tail {TAIL} · {folderName(service.folder)}
            </span>
          </div>
          <StatusBadge status={service.status} />
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-log-bg px-5 py-3.5 font-mono text-[12.5px] leading-[1.7]">
          {isPending ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="text-log-error">{error.message}</div>
          ) : lines.length === 0 ? (
            <div className="text-muted-foreground">
              No log output. The service may not have been started yet.
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-16 shrink-0 text-log-time">{line.time}</span>
                <span
                  className={`w-11 shrink-0 font-medium ${LEVEL_COLOR[line.level] ?? "text-log-time"}`}
                >
                  {line.level}
                </span>
                <span className="break-words text-log-fg">{line.message}</span>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
