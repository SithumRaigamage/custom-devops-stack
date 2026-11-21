"use client";

import { useState } from "react";
import { useOllamaStatus, useOllamaModels, useOllamaRunning } from "@/lib/use-ollama";
import { ollamaLoadModel, ollamaUnloadModel } from "@/lib/api";

const BUTTON =
  "inline-flex h-[38px] items-center rounded-[8px] px-3 text-[13px] font-semibold disabled:opacity-60";
const PRIMARY = `${BUTTON} border border-brand bg-brand text-brand-foreground`;
const GHOST = `${BUTTON} border border-border2 bg-card2 text-fg2`;

function formatSize(size: number | string): string {
  const bytes = typeof size === "number" ? size : Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

export function OllamaPanel({ serviceId }: { serviceId: string }) {
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQuery = useOllamaStatus(serviceId);
  const modelsQuery = useOllamaModels(serviceId);
  const runningQuery = useOllamaRunning(serviceId);

  const models = modelsQuery.data ?? [];
  const runningModels = runningQuery.data ?? [];
  const runningNames = new Set(runningModels.map((model) => model.name));

  async function refresh() {
    await Promise.all([
      statusQuery.refetch(),
      modelsQuery.refetch(),
      runningQuery.refetch(),
    ]);
  }

  async function handleLoadModel(name: string) {
    setPending(name);
    setActionError(null);
    try {
      await ollamaLoadModel(serviceId, name);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not load the model");
    } finally {
      setPending(null);
    }
  }

  async function handleUnloadModel(name: string) {
    setPending(name);
    setActionError(null);
    try {
      await ollamaUnloadModel(serviceId, name);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not unload the model");
    } finally {
      setPending(null);
    }
  }

  return (
    <>

      <div className="flex flex-col gap-4">
        <section
          aria-label="Ollama endpoint"
          className="flex flex-wrap items-center gap-5 rounded-[14px] border border-border bg-card p-5"
        >
          <div className="flex flex-[1_1_260px] flex-col gap-1">
            <span className="text-[13px] text-muted-foreground">Endpoint</span>
            <code className="text-[15px] text-foreground">/api/version</code>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
            <span className={statusQuery.data?.reachable ? "size-1.5 rounded-full bg-ok" : "size-1.5 rounded-full bg-muted"} />
            {statusQuery.data?.reachable ? "Reachable" : statusQuery.data?.error ?? "Not reachable"}
          </span>

          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted-foreground">Loaded in memory</span>
            <span className="font-semibold">
              {runningNames.size > 0 ? [...runningNames].join(", ") : "None"}
            </span>
          </div>
        </section>

        {actionError && (
          <p role="alert" className="m-0 rounded-[10px] border border-bad-bg bg-bad-bg px-3 py-2 text-[13px] text-bad">
            {actionError}
          </p>
        )}

        <section
          aria-label="Models"
          className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5"
        >
          <h2 className="mb-2 text-base font-semibold text-foreground">Installed models</h2>

          {modelsQuery.error ? (
            <p className="m-0 text-sm text-bad">
              {modelsQuery.error.message}
            </p>
          ) : modelsQuery.isPending ? (
            <p className="m-0 text-muted-foreground">Loading models…</p>
          ) : models.length === 0 ? (
            <p className="m-0 text-muted-foreground">No models are installed.</p>
          ) : (
            models.map((model) => {
              const loaded = runningNames.has(model.name);
              const busy = pending === model.name;

              return (
                <div
                  key={model.name}
                  className="flex flex-wrap items-center gap-3.5 rounded-[10px] bg-card2 p-3"
                >
                  <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-foreground">{model.name}</span>
                    <span className="text-xs text-muted-foreground">{formatSize(model.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void (loaded ? handleUnloadModel(model.name) : handleLoadModel(model.name))
                    }
                    disabled={busy}
                    className={loaded ? GHOST : PRIMARY}
                  >
                    {busy ? "Working…" : loaded ? "Unload" : "Load"}
                  </button>
                </div>
              );
            })
          )}
        </section>

        <section
          aria-label="Running models"
          className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5"
        >
          <h2 className="mb-2 text-base font-semibold text-foreground">Running models</h2>

          {runningQuery.error ? (
            <p className="m-0 text-sm text-bad">
              {runningQuery.error.message}
            </p>
          ) : runningQuery.isPending ? (
            <p className="m-0 text-muted-foreground">Loading running models…</p>
          ) : runningModels.length === 0 ? (
            <p className="m-0 text-muted-foreground">No models are loaded.</p>
          ) : (
            runningModels.map((model) => {
              const busy = pending === model.name;

              return (
                <div
                  key={model.name}
                  className="flex flex-wrap items-center gap-3.5 rounded-[10px] bg-card2 p-3"
                >
                  <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-foreground">{model.name}</span>
                    <span className="text-xs text-muted-foreground">{formatSize(model.size)}</span>
                  </div>
                  <span className="min-w-16 text-[13px] text-fg2">Loaded</span>
                  <button
                    type="button"
                    onClick={() => void handleUnloadModel(model.name)}
                    disabled={busy}
                    className={GHOST}
                  >
                    {busy ? "Working…" : "Unload"}
                  </button>
                </div>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
