"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLogs } from "./api";
import { Spinner } from "./Spinner";

const TAIL = 100;

export function LogsDrawer({
  service,
  onClose,
}: {
  service: { id: string; name: string };
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const text = await fetchLogs(service.id, TAIL, controller.signal);
      setLogs(text);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [service.id]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the newest lines in view after each load.
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close logs"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-medium">{service.name} logs</h2>
            <p className="text-xs text-neutral-400">Last {TAIL} lines</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-700 disabled:opacity-60"
            >
              {loading && <Spinner />}
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-700"
            >
              Close
            </button>
          </div>
        </header>

        {error && (
          <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <pre
          ref={preRef}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-neutral-300"
        >
          {logs === null
            ? loading
              ? "Loading…"
              : ""
            : logs.trim() === ""
              ? "No log output. The service may not have been started yet."
              : logs}
        </pre>
      </aside>
    </div>
  );
}
