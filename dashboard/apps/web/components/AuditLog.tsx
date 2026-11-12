"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityEntry, ActivityFilter } from "@/lib/api";
import { activityDot, activityKindLabel, relativeTime } from "@/lib/activity";
import { useActivityFacets, useActivityLog } from "@/lib/use-activity";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 rounded-[9px] border border-border2 bg-field px-2.5 text-[13px] text-foreground";
const INPUT_CLASS =
  "h-9 rounded-[9px] border border-border2 bg-field px-3 text-[13px] text-foreground";

/** Kind families shown first in the "Action" filter. */
const KIND_GROUPS: { value: string; label: string }[] = [
  { value: "auth.*", label: "All sign-in & account" },
  { value: "service.*", label: "All service registry changes" },
  { value: "backup.*", label: "All image backups" },
];

type Source = "" | "audit" | "event";
type Outcome = "" | "ok" | "failed";

/** Local date (yyyy-mm-dd) → epoch ms at the start or end of that day. */
function dayBound(value: string, end: boolean): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: ActivityEntry[]): void {
  const header = ["time", "actor", "action", "service", "outcome", "source", "message"];
  const lines = rows.map((row) =>
    [
      new Date(row.ts).toISOString(),
      row.actor,
      row.kind,
      row.serviceKey,
      row.outcome,
      row.source,
      row.message,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stackpilot-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AuditLog() {
  const [source, setSource] = useState<Source>("audit");
  const [kind, setKind] = useState("");
  const [actor, setActor] = useState("");
  const [service, setService] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce the free-text search so typing doesn't fire a request per key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = useMemo<ActivityFilter>(
    () => ({
      source: source || undefined,
      kind: kind || undefined,
      actor: actor || undefined,
      service: service || undefined,
      outcome: outcome || undefined,
      from: dayBound(fromDay, false),
      to: dayBound(toDay, true),
      q: q || undefined,
    }),
    [source, kind, actor, service, outcome, fromDay, toDay, q],
  );

  const facets = useActivityFacets();
  const log = useActivityLog(filter);
  const rows = useMemo(() => log.data?.pages.flatMap((page) => page.activity) ?? [], [log.data]);

  const filtered =
    source !== "audit" || kind || actor || service || outcome || fromDay || toDay || q;

  function reset() {
    setSource("audit");
    setKind("");
    setActor("");
    setService("");
    setOutcome("");
    setFromDay("");
    setToDay("");
    setSearch("");
  }

  return (
    <section
      aria-label="Audit log"
      className="flex max-w-[1100px] flex-col gap-4 rounded-[14px] border border-border bg-card p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-bold text-foreground">Audit log</h2>
          <p className="m-0 text-xs text-muted-foreground">
            Every change made through the dashboard or API: who did it, what changed and whether
            it worked. Secret values are never recorded.
          </p>
        </div>
        <div className="flex gap-2">
          {filtered && (
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground"
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadCsv(rows)}
            disabled={rows.length === 0}
            className="h-9 rounded-[9px] border border-border2 px-3 text-xs font-semibold text-foreground disabled:opacity-60"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Audit filters">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search messages…"
          aria-label="Search messages"
          className={cn(INPUT_CLASS, "min-w-[200px] flex-1")}
        />
        <select
          aria-label="Source"
          value={source}
          onChange={(event) => setSource(event.target.value as Source)}
          className={SELECT_CLASS}
        >
          <option value="audit">Changes (audit)</option>
          <option value="event">Status events</option>
          <option value="">Everything</option>
        </select>
        <select
          aria-label="Action"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Any action</option>
          {KIND_GROUPS.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
          {(facets.data?.kinds ?? []).map((value) => (
            <option key={value} value={value}>
              {activityKindLabel(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Actor"
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Anyone</option>
          {(facets.data?.actors ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Service"
          value={service}
          onChange={(event) => setService(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Any service</option>
          {(facets.data?.services ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as Outcome)}
          className={SELECT_CLASS}
        >
          <option value="">Any outcome</option>
          <option value="ok">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={fromDay}
            max={toDay || undefined}
            onChange={(event) => setFromDay(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={toDay}
            min={fromDay || undefined}
            onChange={(event) => setToDay(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {log.isPending ? (
        <p className="m-0 text-[13px] text-muted-foreground">Loading audit log…</p>
      ) : log.error ? (
        <p role="alert" className="m-0 text-[13px] text-bad">
          Could not load the audit log: {log.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          {filtered ? "No entries match these filters." : "No changes recorded yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">When</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Who</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Action</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Details</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Service</th>
                <th scope="col" className="py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-track align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                    <time dateTime={new Date(row.ts).toISOString()} title={new Date(row.ts).toLocaleString()}>
                      {relativeTime(row.ts)}
                    </time>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{row.actor}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", activityDot(row.kind, row.outcome))} />
                      {activityKindLabel(row.kind)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-foreground">{row.message}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-muted-foreground">
                    {row.serviceKey ?? "—"}
                  </td>
                  <td className="whitespace-nowrap py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        row.outcome === "failed" ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok",
                      )}
                    >
                      {row.outcome === "failed" ? "Failed" : "OK"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.hasNextPage && (
        <button
          type="button"
          onClick={() => void log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
          className="h-9 self-center rounded-[9px] border border-border2 px-4 text-xs font-semibold text-foreground disabled:opacity-60"
        >
          {log.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}
