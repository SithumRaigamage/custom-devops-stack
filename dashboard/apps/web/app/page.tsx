"use client";

import { useCallback, useEffect, useState } from "react";
import { type Action, type Service, type Status, fetchServices, runAction } from "./api";
import { LogsDrawer } from "./LogsDrawer";
import { Spinner } from "./Spinner";

const POLL_MS = 5000;

const BADGE: Record<Status, string> = {
  healthy: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  unhealthy: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  stopped: "bg-neutral-500/15 text-neutral-300 ring-neutral-500/30",
};

const DOT: Record<Status, string> = {
  healthy: "bg-emerald-400",
  unhealthy: "bg-amber-400",
  stopped: "bg-neutral-500",
};

const ACTIONS: { action: Action; label: string }[] = [
  { action: "start", label: "Start" },
  { action: "stop", label: "Stop" },
  { action: "restart", label: "Restart" },
];

// Start makes no sense on a healthy service; Stop and Restart make none on a stopped one.
function disabledFor(action: Action, status: Status): boolean {
  if (action === "start") return status === "healthy";
  return status === "stopped";
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-800";

export default function Page() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, Action>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [logsFor, setLogsFor] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setServices(await fetchServices(signal));
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  async function run(id: string, action: Action) {
    setPending((p) => ({ ...p, [id]: action }));
    setActionErrors(({ [id]: _cleared, ...rest }) => rest);
    try {
      await runAction(id, action);
    } catch (err) {
      setActionErrors((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Action failed",
      }));
    } finally {
      await load();
      setPending(({ [id]: _done, ...rest }) => rest);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">DevOps Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-400">Refreshes every 5 seconds</p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Can&apos;t reach the API: {error}
        </div>
      )}

      {services === null && !error && <p className="mt-8 text-neutral-400">Loading…</p>}

      {services && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const busy = pending[service.id];
            const failure = actionErrors[service.id];
            return (
              <li
                key={service.id}
                className="flex flex-col justify-between gap-5 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-medium">{service.name}</h2>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${BADGE[service.status]}`}
                  >
                    <span className={`size-1.5 rounded-full ${DOT[service.status]}`} />
                    {service.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map(({ action, label }) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => run(service.id, action)}
                      disabled={busy !== undefined || disabledFor(action, service.status)}
                      className={buttonClass}
                    >
                      {busy === action && <Spinner />}
                      {label}
                    </button>
                  ))}
                </div>

                {failure && (
                  <p className="max-h-24 overflow-auto rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {failure}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLogsFor({ id: service.id, name: service.name })}
                    className={buttonClass}
                  >
                    View Logs
                  </button>
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass}
                  >
                    Open
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {logsFor && <LogsDrawer service={logsFor} onClose={() => setLogsFor(null)} />}
    </main>
  );
}
