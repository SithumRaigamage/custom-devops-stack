"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useOllamaStatus, useOllamaModels, useOllamaRunning } from "@/lib/use-ollama";
import { ollamaLoadModel, ollamaUnloadModel } from "@/lib/api";

const BUTTON =
  "inline-flex h-[38px] items-center rounded-[8px] px-3 text-[13px] font-semibold";
const PRIMARY = `${BUTTON} border border-brand bg-brand text-brand-foreground`;
const GHOST = `${BUTTON} border border-border2 bg-card2 text-fg2`;

export default function OllamaPage() {
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const { data: status, isLoading: statusLoading } = useOllamaStatus();
  const { data: models, isLoading: modelsLoading } = useOllamaModels();
  const { data: runningModels, isLoading: runningLoading } = useOllamaRunning();

  // Fetch data on mount
  useEffect(() => {
    // Already fetched by hooks, but ensure initial load
  }, []);

  async function handleLoadModel(name: string) {
    await ollamaLoadModel(name);
    setLoadedModel(name);
    // Refresh models after load
    // The queries will refetch automatically or we can manually invalidate
  }

  async function handleUnloadModel(name: string) {
    await ollamaUnloadModel(name);
    if (loadedModel === name) setLoadedModel(null);
    // Refresh models after unload
  }

  return (
    <>
      <PageHeader title="Ollama" sub="Local models that power the assistant and Open WebUI." />

      <div className="flex flex-col gap-4">
        <section
          aria-label="Ollama endpoint"
          className="flex flex-wrap items-center gap-5 rounded-[14px] border border-border bg-card p-5"
        >
          <div className="flex flex-[1_1_260px] flex-col gap-1">
            <span className="text-[13px] text-muted-foreground">Endpoint</span>
            <code className="text-[15px] text-foreground">{window.location.origin}/api/ollama/status</code>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
            <span className={status?.reachable ? "size-1.5 rounded-full bg-ok" : "size-1.5 rounded-full bg-muted"} />
            {status?.reachable ? "Reachable" : "Not reachable"}
          </span>

          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted-foreground">Loaded in memory</span>
            <span className="font-semibold">{loadedModel ?? "None"}</span>
          </div>
        </section>

        <section
          aria-label="Models"
          className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5"
        >
          <h2 className="mb-2 text-base font-semibold text-foreground">Installed models</h2>

          {models ? (
            models.map((model) => {
              if (!model) return null;

              const loaded = loadedModel === model.name;

              return (
                <div
                  key={model.name}
                  className="flex flex-wrap items-center gap-3.5 rounded-[10px] bg-card2 p-3"
                >
                  <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-foreground">{model.name}</span>
                    <span className="text-xs text-muted-foreground">{model.size}</span>
                  </div>
                  <span className="min-w-16 text-[13px] text-fg2">{model.size}</span>
                  <button
                    type="button"
                    onClick={() => handleLoadModel(model.name)}
                    className={loaded ? GHOST : PRIMARY}
                  >
                    {loaded ? "Unload" : "Load"}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground">Loading models...</p>
          )}
        </section>

        <section
          aria-label="Running models"
          className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-5"
        >
          <h2 className="mb-2 text-base font-semibold text-foreground">Running models</h2>

          {runningModels ? (
            runningModels.map((model) => {
              if (!model) return null;

              const loaded = loadedModel === model.name;

              return (
                <div
                  key={model.name}
                  className="flex flex-wrap items-center gap-3.5 rounded-[10px] bg-card2 p-3"
                >
                  <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium text-foreground">{model.name}</span>
                  </div>
                  <span className="min-w-16 text-[13px] text-fg2">Loaded</span>
                  <button
                    type="button"
                    onClick={() => handleUnloadModel(model.name)}
                    className={loaded ? GHOST : PRIMARY}
                  >
                    {loaded ? "Unload" : "Load"}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground">Loading running models...</p>
          )}
        </section>
      </div>
    </>
  );
}